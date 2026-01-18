import { TurboModuleRegistry } from 'react-native';
import { BrandedString, DslText, JsonText, PlannerKind } from './domain/types';

export type JsonValue =
  | null
  | boolean
  | number
  | BrandedString
  | JsonValue[]
  | JsonObject;
export interface JsonObject {
  [key: string]: JsonValue;
}
export type JsonArray = JsonValue[];

interface TrackerEngineBinding {
  compileTracker: (dsl: DslText) => JsonText;
  validateEvent: (dsl: DslText, event: JsonText) => JsonText;
  compute: (dsl: DslText, events: JsonText, query: JsonText) => JsonText;
  simulate: (
    dsl: DslText,
    base: JsonText,
    hypotheticals: JsonText,
    query: JsonText,
  ) => JsonText;
  suggest: (dsl: DslText, events: JsonText, planner: PlannerKind) => JsonText;
  getExerciseCatalog: () => JsonText;
  validateExercise: (entry: JsonText) => JsonText;
  importFitnotes: (path: string) => JsonText;
}

declare global {
  interface GlobalThis {
    TrackerEngine?: TrackerEngineBinding;
  }
}

// Best-effort warm-up without noisy warning; the JSI binding is installed lazily.
TurboModuleRegistry.get('TrackerEngineModule');

const binding = (globalThis as { TrackerEngine?: TrackerEngineBinding })
  .TrackerEngine;

if (!binding) {
  console.warn(
    'TrackerEngine binding is missing; Strata native module might not be registered yet.',
  );
}

const ensureBinding = (): TrackerEngineBinding => {
  if (!binding) {
    throw new Error('TrackerEngine native module is not available');
  }
  return binding;
};

const parse = <T extends JsonValue>(value: JsonText): T =>
  JSON.parse(value) as T;
const stringify = (value: JsonValue): JsonText =>
  JSON.stringify(value) as JsonText;

const call = <T extends JsonValue>(
  fn: keyof TrackerEngineBinding,
  ...args: Array<DslText | JsonText | PlannerKind>
): T => {
  const engine = ensureBinding();
  const method = engine[fn] as (
    ...inner: Array<DslText | JsonText | PlannerKind>
  ) => JsonText;
  const raw = method(...args);
  return parse<T>(raw);
};

const callRaw = <T extends JsonValue>(
  fn: keyof TrackerEngineBinding,
  ...args: Array<string>
): T => {
  const engine = ensureBinding();
  const method = engine[fn] as (...inner: string[]) => JsonText;
  const raw = method(...args);
  return parse<T>(raw);
};

export const validateEvent = async (dsl: DslText, event: JsonObject) => {
  return call<JsonObject>('validateEvent', dsl, stringify(event));
};

export const compute = async (
  dsl: DslText,
  events: JsonObject[],
  query: JsonObject,
) => {
  return call<JsonObject>(
    'compute',
    dsl,
    JSON.stringify(events) as JsonText,
    stringify(query),
  );
};

export const suggest = async (
  dsl: DslText,
  events: JsonObject[],
  planner: PlannerKind,
) => {
  return call<JsonArray>(
    'suggest',
    dsl,
    JSON.stringify(events) as JsonText,
    planner,
  );
};

export const simulate = async (
  dsl: DslText,
  baseEvents: JsonObject[],
  hypotheticals: JsonObject[],
  query: JsonObject,
) =>
  call<JsonObject>(
    'simulate',
    dsl,
    JSON.stringify(baseEvents) as JsonText,
    JSON.stringify(hypotheticals) as JsonText,
    stringify(query),
  );

export const compileTracker = async (dsl: DslText) =>
  call<JsonObject>('compileTracker', dsl);

export const getExerciseCatalog = async () =>
  call<JsonArray>('getExerciseCatalog');
export const validateExercise = async (entry: JsonObject) => {
  return call<JsonObject>('validateExercise', stringify(entry));
};

export const importFitnotes = async (path: string) => {
  return callRaw<JsonObject>('importFitnotes', path);
};
