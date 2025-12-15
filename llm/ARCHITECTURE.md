* **iOS first**
* **React Native UI**
* **Rust core engine** that stays **generic** (Workout now, Finance/Time later)
* You *can* keep a “WASM state machine” end-goal, but for iOS-first you’ll get a much cleaner architecture if you ship **Rust as a native library first**, while keeping the engine **pure/deterministic** so it can be compiled to WASM later.

---

# 1) Big decision: Rust Core as WASM vs Native

## Option A: Rust → WASM inside React Native

**Pros**

* Same binary across platforms
* Conceptually clean “portable state machine”

**Cons (especially iOS-first)**

* Running WASM inside RN reliably means you need a WASM runtime accessible from RN (JS engine + WASM support + bridging). This adds operational complexity and performance overhead.
* JSI + native is usually faster and simpler than JS/WASM embedding for a heavy metric engine.

## Option B (recommended): Rust → native iOS library + JSI bridge

**Pros**

* Fastest path to a stable iOS app
* Best performance
* Best debugging story (crash logs, profiling)
* Still *portable*: the core is pure Rust, so later you can also compile it to WASM if you still want.

**Cons**

* Separate build artifacts per platform (iOS now, Android later) — but RN already has platform builds, so it’s fine.

**Recommendation**
Ship **Rust native engine on iOS via JSI**, while designing the Rust core to be **WASM-compatible** (no OS calls, deterministic, pure logic). Later you can decide whether Android uses the same pattern (Rust native), or you add WASM.

---

# 2) Whole system at a glance

## Components

### Client (React Native – iOS first)

* UI screens (logging, history, analytics, PRs)
* Local persistence (SQLite)
* Calls into Rust Core for:

  * validation
  * metrics & PR computation
  * suggestions
  * “planning mode” simulations

### Rust Core (generic tracker engine)

* Loads tracker config (DSL → IR)
* Accepts events (records)
* Computes:

  * derived fields
  * metrics (by grain/day/week/month)
  * PRs / alerts
  * suggestions
  * planning simulations

### Persistence layer

* iOS device: SQLite (via native module or RN library)
* Store:

  * raw events
  * materialized metric snapshots (optional cache)
  * tracker configs (versioned)

### Sync layer (later)

* Optional cloud sync
* CRDT/event-log-based sync, or “append-only event upload”
* Not required for MVP

---

# 3) Data model (universal)

## Event-sourced base (works for workout/finance/time)

Everything the user does becomes an append-only event.

### Event (record)

```json
{
  "event_id": "uuid",
  "tracker_id": "workout_v1",
  "ts": "2025-12-15T20:10:00+05:30",
  "payload": { "exercise": "Bench Press", "reps": 8, "weight": 60, "set": 1 },
  "meta": { "source": "manual", "device_id": "ios_x" }
}
```

### Tracker config

* Stored versioned
* Parsed DSL -> validated IR -> used to interpret events

### Derived outputs

* `metrics` per grain
* `prs`
* `alerts`
* `suggestions`

---

# 4) Rust Core Library Design (generic engine)

## Crate layout

```
strata/
  crates/
    tracker_dsl/          # parser: DSL -> AST
    tracker_ir/           # validated IR structs (serde)
    tracker_engine/       # apply(events) -> state + metrics + alerts + suggestions
    tracker_eval/         # expression engine for metrics/alerts
    tracker_planning/     # simulation engine (what-if)
    tracker_catalog/      # optional: shared exercise metadata (muscle groups)
    tracker_ffi/          # iOS bridge: JSI / C ABI / uniffi
```

## The “public API” of the core

The core should look like a **deterministic calculator**, not an app.

### Key objects

* `TrackerDefinition` (compiled config)
* `EngineState` (optional cached state)
* `Event` (user record)
* `EngineOutput` (metrics/prs/alerts/suggestions)

### Core API

```rust
/// 1) Compile config once
fn compile_tracker(dsl: &str) -> Result<TrackerDefinition>;

/// 2) Validate + normalize an event
fn validate_event(def: &TrackerDefinition, event_json: &str) -> Result<NormalizedEvent>;

/// 3) Compute outputs from events (stateless mode)
fn compute(def: &TrackerDefinition, events: &[NormalizedEvent], query: Query) -> EngineOutput;

/// 4) Incremental mode (optional)
fn apply(def: &TrackerDefinition, state: &mut EngineState, event: NormalizedEvent) -> EngineOutputDelta;

/// 5) Planning / what-if simulations
fn simulate(def: &TrackerDefinition, base_events: &[NormalizedEvent], hypothetical: &[NormalizedEvent], query: Query) -> SimulationOutput;
```

### Why both stateless + incremental?

* **Stateless** is simplest and easiest for correctness (recompute from event log).
* **Incremental** gives speed for large histories (update materialized metrics quickly).
  You can ship stateless first, add incremental later.

---

# 5) DSL: Fields, Metrics, Alerts, Planning (generic)

This is the “one DSL to rule them all”.

## DSL skeleton

```
tracker "<name>" v<version> {
  fields { ... }
  derive { ... }         // computed fields
  metrics { ... }        // analytics outputs
  alerts { ... }         // signal rules
  planning { ... }       // what-if & recommendation hooks
}
```

### Expression rules (engine)

Support a small set that compiles well:

* arithmetic: `+ - * /`
* aggregations: `sum/max/min/avg/count`
* conditionals: `if (...) then ... else ...`
* grouping: `by (...)`
* time: `over [day, week, month, quarter, year, all_time]`

---

# 6) System design for iOS-first React Native

## Runtime architecture inside the app

### React Native layer

* Screens + navigation
* Calls into native module `TrackerEngine`
* Stores/retrieves events from SQLite
* Requests outputs from `TrackerEngine`

### Native module (JSI)

* JSI binding gives near-zero overhead vs classic bridge
* Exposes functions like:

  * `compileTracker(dsl) -> trackerId`
  * `validateEvent(trackerId, eventJson)`
  * `compute(trackerId, eventsJson, queryJson) -> outputJson`
  * `simulate(trackerId, baseEvents, hypotheticalEvents, query)`

### Rust core in iOS

* Built as `staticlib` for iOS
* Linked into the RN iOS target
* JSI C++ wrapper calls Rust FFI

**Reason:** This is the most stable “iOS first” route.

---

# 7) Local storage design (SQLite)

Tables (minimum viable):

## `trackers`

* `tracker_id` TEXT PK
* `name` TEXT
* `version` INT
* `dsl` TEXT
* `compiled_ir_json` TEXT (optional cache)
* `created_at` TS

## `events`

* `event_id` TEXT PK
* `tracker_id` TEXT (index)
* `ts` TS (index)
* `payload_json` TEXT
* `meta_json` TEXT

## `snapshots` (optional, later)

* metric caches by grain/time window for faster charts

For MVP you can skip snapshots and compute on demand for the selected time range.

---

# 8) App screens and flows (Workout MVP)

## Logging

* Choose session date
* Add exercise
* Add sets:

  * reps/weight OR time depending on exercise type
* Save -> events appended

## History

* Timeline of sessions
* Tap session -> detailed set list

## Analytics

* Select exercise / muscle group
* Choose grain (week/month/year)
* Chart: volume, max weight, est 1RM
* PR highlights

## Suggestions

* “Next session suggestion” card per exercise
* Backed by `planning` simulation + heuristics

---

# 9) Suggestions & Planning mode design

This is where your “strategies” plug in without hardcoding per-app logic.

## Planning mode = simulate hypothetical events

Example: user did 3×8×60 last time.
We try:

* +1 rep per set
* +2.5kg same reps
* +1 extra set

For each candidate:

* simulate -> compute deltas in metrics
* score candidate based on strategy (strength/hypertrophy etc.)
* return top suggestions with explanation

### Strategy packs (configurable)

You can model strategies as presets:

* Strength: prioritize max weight / est 1RM
* Hypertrophy: prioritize weekly volume and rep ranges
* Endurance: prioritize time/density improvements

These are “policy modules” that sit **outside** the generic metric engine, but still run in Rust as pure logic so results are deterministic.

---

# 10) How this stays generic for Finance + Time

Because your core engine doesn’t know what “reps” or “amount” means.

It only knows:

* fields exist
* types exist
* metrics are expressions
* alerts are predicates
* planning simulates events

### Finance tracker on same system

* events: “expense added”
* metrics: spend by month/category/mode
* alerts: budget exceeded
* planning: “what if I spend ₹X weekly” or “add rent next month”

### Time tracker on same system

* events: “activity block logged”
* metrics: total time per day/week per category
* alerts: exceeded 10h/day
* planning: weekly allocation targets

Same engine. Different DSL.

---

# 11) Deployment and phased roadmap

## Phase 1 (iOS MVP)

* RN iOS app
* Rust core native + JSI binding
* SQLite event storage
* Workout tracker config baked in (DSL)
* Compute: volume/max weight/1RM/PRs
* Basic suggestions (3 candidates)

## Phase 2 (polish + correctness)

* Exercise catalog (muscle groups)
* Better PR definitions
* Metric caching or incremental apply
* Export/import (CSV/JSON)

## Phase 3 (Android)

* Reuse same Rust core
* Android JSI binding + NDK build
* Same RN UI code, platform modules

## Phase 4 (Sync, optional)

* Cloud event log
* Conflict resolution
* Multi-device reliability

---

# 12) What I need from you (to lock the design)

I won’t ask questions unless necessary, but here are “default decisions” I’d take:

* iOS first = **Rust native via JSI**
* Storage = SQLite
* No cloud sync in MVP
* Stateless compute initially (recompute from events for selected window)
* Tracker configs embedded as DSL files in the app bundle
