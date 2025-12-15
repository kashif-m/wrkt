exception StrataError(string)

type trackerEngine
type json = JSON.t

@val external trackerEngine: trackerEngine = "TrackerEngine"
@send external jsCompileTracker: (trackerEngine, string) => string = "compileTracker"
@send
external jsValidateEvent: (trackerEngine, string, string) => string = "validateEvent"
@send
external jsCompute: (trackerEngine, string, string, string) => string = "compute"
@send
external jsSimulate: (trackerEngine, string, string, string, string) => string = "simulate"
@send
external jsSuggest: (trackerEngine, string, string, string) => string = "suggest"

let parseJson = jsonString =>
  try {
    JSON.parseOrThrow(jsonString)
  } catch {
  | _ => throw(StrataError("Invalid JSON from native binding"))
  }

let stringifyJson = (json: json) =>
  switch JSON.stringifyAny(json) {
  | Some(string) => string
  | None => throw(StrataError("Unable to stringify JSON"))
  }

let stringifyArray = (items: array<json>) => {
  let strings = items->Belt.Array.map(stringifyJson)
  "[" ++ Belt.Array.joinWith(strings, ",", s => s) ++ "]"
}

let compileTracker = (~dsl: string) => {
  let json = jsCompileTracker(trackerEngine, dsl)
  parseJson(json)
}

let validateEvent = (~dsl: string, ~event: json) => {
  let eventJson = stringifyJson(event)
  let normalized = jsValidateEvent(trackerEngine, dsl, eventJson)
  parseJson(normalized)
}

let compute = (~dsl: string, ~events: array<json>, ~query: json) => {
  let eventsJson = stringifyArray(events)
  let queryJson = stringifyJson(query)
  let result = jsCompute(trackerEngine, dsl, eventsJson, queryJson)
  parseJson(result)
}

let simulate = (
  ~dsl: string,
  ~baseEvents: array<json>,
  ~hypotheticals: array<json>,
  ~query: json,
) => {
  let baseJson = stringifyArray(baseEvents)
  let hypoJson = stringifyArray(hypotheticals)
  let queryJson = stringifyJson(query)
  let result = jsSimulate(trackerEngine, dsl, baseJson, hypoJson, queryJson)
  parseJson(result)
}

let suggest = (~dsl: string, ~events: array<json>, ~planner: string) => {
  let eventsJson = stringifyArray(events)
  let result = jsSuggest(trackerEngine, dsl, eventsJson, planner)
  parseJson(result)
}
