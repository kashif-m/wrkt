export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }
export type JsonObject = { [key: string]: JsonValue }
export type JsonArray = JsonValue[]

interface TrackerEngineBinding {
  compileTracker: (dsl: string) => string
  validateEvent: (dsl: string, event: string) => string
  compute: (dsl: string, events: string, query: string) => string
  simulate: (dsl: string, base: string, hypotheticals: string, query: string) => string
  suggest: (dsl: string, events: string, planner: string) => string
}

declare global {
  interface GlobalThis {
    TrackerEngine?: TrackerEngineBinding
  }
}

const binding = (globalThis as { TrackerEngine?: TrackerEngineBinding }).TrackerEngine

if (!binding) {
  console.warn("TrackerEngine binding is missing; Strata native module might not be registered yet.")
}

const ensureBinding = (): TrackerEngineBinding => {
  if (!binding) {
    throw new Error("TrackerEngine native module is not available")
  }
  return binding
}

const parse = <T extends JsonValue>(value: string): T => JSON.parse(value) as T
const stringify = (value: JsonValue) => JSON.stringify(value)

const call = (fn: keyof TrackerEngineBinding, ...args: string[]) => {
  const engine = ensureBinding()
  const method = engine[fn] as (...inner: string[]) => string
  const raw = method(...args)
  return parse<JsonObject>(raw)
}

export const validateEvent = async (dsl: string, event: JsonObject) => {
  return call("validateEvent", dsl, stringify(event))
}

export const compute = async (dsl: string, events: JsonObject[], query: JsonObject) => {
  return call("compute", dsl, JSON.stringify(events), stringify(query))
}

export const suggest = async (dsl: string, events: JsonObject[], planner: string) => {
  return call("suggest", dsl, JSON.stringify(events), planner)
}

export const simulate = async (
  dsl: string,
  baseEvents: JsonObject[],
  hypotheticals: JsonObject[],
  query: JsonObject,
) => call("simulate", dsl, JSON.stringify(baseEvents), JSON.stringify(hypotheticals), stringify(query))

export const compileTracker = async (dsl: string) => call("compileTracker", dsl)
