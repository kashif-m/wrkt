# Implementation Tasks (High-Level)

## Scope Map
- UI delivery is tracked in `llm/ui-tasks.md` (screen-by-screen + components).
- This file stays at program/architecture level only.

## Program Phases

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

- [x] Build the JSI native module exposing the Rust core (`compileTracker`, `validateEvent`, `compute`, `simulate`) and link the static library into the RN iOS target.
- [x] Re-implement the RN UI/storage layer in TypeScript (logging, history, analytics, suggestion cards) while still hitting the Strata core.
- [x] Ensure offline logging and deterministic analytics with rounding/timezone policies, replaying event history per selected grains.
- [x] Surface PRs, volume/1RM charts, and suggestion cards backed by the strategy module output.

### Phase 4 – UI/UX System (High-Level Only)
- [ ] Guided logging wizard (final polish + template parity).
- [ ] Configurable workout templates.
- [ ] UI infrastructure + reusable patterns.

### Phase 5 – Root State Machine Refactor (Haskell-ish Flow)
- [x] Inventory local states/effects and move to root context.
- [x] Define RootState + Action types + pure reducer.
- [x] Create effect runner for storage, catalog, suggestions.
- [x] Migrate Home/Calendar/Browse/Logging to context/actions.
- [x] Migrate Analytics/History/Suggestions; remove loose state.
- [x] Verify logging for past dates + PR flags + nav consistency.

### Phase 6 – Data Continuity (Backup / Restore / Import)
- [ ] Define import data model in `workout-pack/src/import/` (events, exercises, favorites, warnings).
- [ ] Implement FitNotes importer in Rust (read sqlite, map exercises/categories/training_log, preserve raw values).
- [ ] Add FFI export to surface import bundle to RN (JSON payload).
- [ ] Add RN import flow: file picker to select `.fitnotes`/sqlite file + progress + confirmation.
- [ ] Apply import: merge custom exercises + favorites + events into local storage.
- [ ] Add minimal validation + error reporting for corrupt/partial backups.
