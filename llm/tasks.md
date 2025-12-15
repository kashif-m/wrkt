# Implementation Tasks

## Phase 1 – Generic Rust Core (root `strata/`)

- [x] Define crate layout (`tracker_dsl`, `tracker_ir`, `tracker_engine`, `tracker_eval`, `tracker_planning`, `tracker_catalog`, `tracker_ffi`) inside the root `strata/` workspace.
- [x] Implement public API (`compile_tracker`, `validate_event`, `compute`, `apply`, `simulate`) with deterministic pure functions.
- [x] Build expression evaluator covering arithmetic, aggregations, conditionals, grouping, and time grains.
- [x] Add strong newtypes for IDs/units, boundary-friendly errors, and stateless replay tests to prove deterministic outputs.

## Phase 2 – Workout Pack + Persistence

- [x] Create workout-specific DSL configs, strategy packs, and catalog metadata outside the core.
- [x] Design SQLite schema (`trackers`, `events`, optional `snapshots`) and storage helpers that persist raw events.
- [x] Wire persistence to the core via JSON conversions and cached compiled configs.
- [x] Implement planning-based suggestion generator that simulates candidates, scores them, and returns top recommendations.

## Phase 3 – React Native iOS Integration

- [ ] Build the JSI native module exposing the Rust core (`compileTracker`, `validateEvent`, `compute`, `simulate`) and link the static library into the RN iOS target.
- [ ] Implement RN UI flows (logging, history, analytics, suggestion cards) that call into the core for validation and metrics.
- [ ] Ensure offline logging and deterministic analytics with rounding/timezone policies, replaying event history per selected grains.
- [ ] Surface PRs, volume/1RM charts, and suggestion cards backed by the strategy module output.
