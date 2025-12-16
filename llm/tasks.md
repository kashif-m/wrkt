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

- [x] Build the JSI native module exposing the Rust core (`compileTracker`, `validateEvent`, `compute`, `simulate`) and link the static library into the RN iOS target.
- [x] Re-implement the RN UI/storage layer in TypeScript (logging, history, analytics, suggestion cards) while still hitting the Strata core.
- [x] Ensure offline logging and deterministic analytics with rounding/timezone policies, replaying event history per selected grains.
- [ ] Surface PRs, volume/1RM charts, and suggestion cards backed by the strategy module output.

## Phase 4 – UI/UX System for Workout Tracker

- [ ] **Exercise Catalog & DSL Alignment**
  - Model domain-specific exercises outside `strata/` (e.g., `workout-pack/config/exercise_catalog.json`) with fields: `slug`, `display_name`, `primary_muscle_group`, `secondary_groups`, `modality` (strength, hypertrophy, conditioning, bodyweight, mobility), `logging_mode` (reps/weight, time, distance, mixed), and metadata for suggested loading ranges.
  - Provide a default bundle of exercises covering major muscle groups (push/pull/legs/core/cardio) so UI pickers feel complete on first launch.
  - Keep this catalog versioned and ingestible by Rust (`workout-pack`) so planners can reason about modality and muscles; surface the same metadata to RN via JSON.

- [ ] **Exercise CRUD Flow**
  - Build simple forms (React Native) for adding/editing exercises outside the default catalog. Persist user-defined entries in storage (AsyncStorage → eventually SQLite) with the same JSON schema.
  - Expose a Rust helper (e.g., `tracker_catalog` API) for validating custom exercises—ensuring modality + logging fields make sense—so the UI only submits sanitized payloads.
  - Support soft-delete or archive to keep history intact while hiding discontinued movements.

- [ ] **Guided Logging Wizard**
  - Step 1: Choose muscle group (grid of cards, e.g., Chest, Back, Legs, Shoulders, Arms, Core, Conditioning). Each choice filters the exercise catalog.
  - Step 2: Select exercise type/modality (Strength vs Conditioning) to further narrow recommendations.
  - Step 3: Show filtered exercise list with search + favorites. Tapping one opens the logging screen.
  - Step 4: Exercise logging screen adapts inputs to `logging_mode` (e.g., weight+reps, time+distance, RPE only). Pre-fill last session data from Strata compute for quick entry.
    - Display contextual date header (Today / Yesterday / Tomorrow / explicit date) so the user knows which day they are logging for.
    - Surface two inline tabs: `Today` (live list of sets recorded for the current day) and `History` (per-exercise timeline/trends).
  - All steps should be powered by data coming from `workout-pack` (muscle / modality definitions) to stay generic.

- [ ] **Configurable Workout Templates**
  - Allow users to save “routines” referencing exercise IDs and target set/rep schemes. Store these templates next to exercises (domain layer) and let Rust scoring/planning reference them when suggesting future sets.
  - Templates should serialize into JSON that Strata can ingest for planning heuristics.

- [ ] **UI Infrastructure**
  - Build reusable wizard components (progress indicator, cards, pill selectors) using the shared theme from Phase 3.
  - Ensure screens can be reused for future domains (e.g., nutrition) by keeping copy/layout generic where possible.

- [ ] **Open Questions for Brainstorm**
  - How do custom exercises sync with planning logic? (Potential answer: `workout-pack` reads a merged catalog file generated on-device and hashed for deterministic IDs.)
  - Should the DSL expand with attachment metadata (video cues, equipment) loaded from the catalog?
  - What minimal TypeScript glue is required vs Rust (ideally, Rust outputs next-step suggestions so TS just renders).
