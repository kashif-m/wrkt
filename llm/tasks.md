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
- [x] Surface PRs, volume/1RM charts, and suggestion cards backed by the strategy module output.

## Phase 4 – UI/UX System for Workout Tracker

- ### FitNotes UI Blitz (current focus)
- [x] **Home / Day view parity**
    - Rebuild `App` shell around a FitNotes-style home screen with date header, prev/next arrows, calendar CTA, and “Workout log empty” copy.
    - Surface `Start New Workout` / `Copy Previous Workout` CTAs plus a vertical list of completed exercises for the selected date.
- [x] **Wizard entry point**
    - Launch the existing `ExerciseBrowser` as a modal/stack from the home CTA and return an exercise selection that opens `LoggingScreen` in Track tab.
    - Tapping a logged exercise should deep-link into the same `LoggingScreen` with History tab active.
- [x] **Calendar loop**
    - Implement a month grid with colored dots per muscle group; selecting a day updates `selectedDate` in the home shell and dismisses the calendar.
  - [x] **Logging polish + defaults**
    - Align steppers, segmented tabs, and set table spacing with the provided screenshots.
    - Prefill weight/reps from the last logged set for that exercise.
    - Show inline toast/status banners (Training saved, etc.).
  - [x] **Graph / analytics parity**
    - Expand the Trends tab into the FitNotes-style Graph view with quick filters (1m/3m/6m/1y/all) and a metric selector.
    - Mirror the History tab layout (date headers, per-set rows) and prep for analytics cards once the home + calendar loops land.

- [ ] **Exercise Catalog & DSL Alignment**
  - Model domain-specific exercises outside `strata/` (e.g., `workout-pack/config/exercise_catalog.json`) with fields: `slug`, `display_name`, `primary_muscle_group`, `secondary_groups`, `modality` (strength, hypertrophy, conditioning, bodyweight, mobility), `logging_mode` (reps/weight, time, distance, mixed), and metadata for suggested loading ranges.
  - Provide a default bundle of exercises covering major muscle groups (push/pull/legs/core/cardio) so UI pickers feel complete on first launch.
  - Keep this catalog versioned and ingestible by Rust (`workout-pack`) so planners can reason about modality and muscles; surface the same metadata to RN via JSON.

- [x] **Exercise CRUD Flow**
  - Build simple forms (React Native) for adding/editing exercises outside the default catalog. Persist user-defined entries in storage (AsyncStorage → eventually SQLite) with the same JSON schema.
  - Expose a Rust helper (e.g., `tracker_catalog` API) for validating custom exercises—ensuring modality + logging fields make sense—so the UI only submits sanitized payloads.
  - Support soft-delete or archive to keep history intact while hiding discontinued movements.

- [ ] **Guided Logging Wizard**
  - [x] Step 1: Choose muscle group via a color-coded card grid; each choice filters the catalog.
  - [x] Step 2: Select exercise modality to refine the list.
  - [x] Step 3: Present the filtered list with contextual tags (search/favorites still pending).
  - [x] Step 4: Exercise logging screen enhancements
    - Adapt inputs to `logging_mode` with weight/reps/time/distance steppers.
    - Show contextual date header + Track/History/Trends tabs (Today list + grouped history + inline chart).
    - Pre-fill default values from last session + add search/favorite affordances.
  - All steps pull data from `workout-pack` catalogs to remain domain-agnostic.

- [ ] **Chart + history polish**
  - Add animated bar-style “volume vs week” charts and per-exercise history tables to the analytics tab (Phase 3 bonus) so we can mark the charts done.
  - Display the live set list and history tabs per exercise on the logging screen per the Phase 4 guided wizard spec.

- [ ] **Modern UI revamp**
  - Refresh logging/analytics/calendar screens to match a clean, colorful FitNotes-inspired aesthetic (cards per workout, segmented controls, color-coded muscle groups).
  - Add tabs per exercise (Track / History / Graph) with contextual widgets: numeric steppers for weight/reps, timeline table, and chart view.
  - Introduce calendar overview with colored dots per muscle group to spot trends.

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
