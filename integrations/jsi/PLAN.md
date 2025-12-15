# React Native JSI Bridge Plan

## Goals

* Expose Strata core (`compile_tracker`, `validate_event`, `compute`, `simulate`) plus workout planners to React Native with minimal overhead.
* Keep the binding deterministic: JSON in/out, no hidden mutable state except cached tracker definitions.
* Integrate cleanly with the iOS RN build (podspec + Xcode target).

## Module Shape

`TrackerEngine` JSI module functions:

1. `compileTracker(dsl: string) -> TrackerHandle`
   * Calls `strata::compile_tracker`.
   * Returns opaque handle (UUID) persisted on native side so JS references compiled configs.

2. `validateEvent(handle: string, eventJson: string) -> string`
   * Parses JSON, runs `validate_event`, returns normalized JSON string.

3. `compute(handle: string, eventsJson: string, queryJson: string) -> string`
   * Events and query provided from JS as JSON strings.
   * Returns metrics/pr/alerts JSON.

4. `simulate(handle: string, baseEventsJson: string, hypotheticalsJson: string, queryJson: string) -> string`
   * Wraps Strata `simulate`.

5. `suggest(handle: string, eventsJson: string, plannerKind: string) -> string`
   * Deserializes into `NormalizedEvent[]`, dispatches to workout-pack planners (`Strength`, `Hypertrophy`, `Conditioning`).
   * Returns array of `PlanSuggestion`.

## Native Implementation Steps

1. Create an Xcode static library target `StrataBridge` that links:
   * `strata` staticlib artifacts.
   * `workout-pack` staticlib (if building as Rust crate).

2. C++ layer:
   * Write JSI host object with methods above.
   * Manage tracker handles via `std::unordered_map<std::string, TrackerDefinition>`.
   * Convert JS `Array`/`Object` ↔ `std::string` (JSON) and call into Rust via FFI functions.

3. Rust FFI layer:
   * Provide C ABI wrappers (maybe `strata_ffi` crate) that expose the public API taking/returning `const char*`.
   * Same for planner suggestions (calls into `workout_pack::generate_suggestions`).

4. Packaging:
   * Add a Podspec that builds the Rust libs via cargo-xcode or uniffi-style script.
   * Add an npm package exporting the TurboModule spec plus TS typings.

## Error Handling

* Rust functions return `Result<_, EngineError>` → convert to structured error objects (`{ code, message }`).
* JSI layer throws JS exceptions with `code/message`.

## Next Steps

* Scaffold `strata/crates/tracker_ffi` to expose C ABI for the APIs above.
* Implement the JSI host object, integrate into RN iOS template, and create TS typings.
