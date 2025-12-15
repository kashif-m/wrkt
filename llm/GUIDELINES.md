# Development guidelines

## 1) Architectural north star

* **Core engine is pure and deterministic**: `output = f(config, events, query)`
* **Apps are thin shells**: UI + persistence + sync + orchestration
* Prefer **event-sourcing** over mutable domain tables for trackers (workout/finance/time all become “events”).

This keeps your “state machine” concept real: the engine *is* a state machine, but it remains simple because it’s just replay + optional incremental caches.

---

## 2) State machine rules

Use a state machine only when it buys you correctness or eliminates branching.

### Good use

* Workout session flow (`Idle → InSession → Review → Saved`)
* Sync state (`Offline → Syncing → Conflict → Synced`)
* Engine ingestion pipeline (`RawEvent → Validated → Normalized → Applied`)

### Bad use

* Over-modeling “every screen” or “every metric” as a state machine.

**Rule:** If you can implement it as a pure function, do that first.

---

## 3) Builder + Factory patterns (how to use without bloat)

### Builder

Use builders for:

* constructing complex domain objects safely (`TrackerDefBuilder`, `QueryBuilder`)
* incremental config assembly from DSL parse results

Avoid builders for:

* simple structs with 3–5 fields (construct directly)

### Factory

Use factories for:

* creating strategy modules (Strength/Hypertrophy) from config
* instantiating storage adapters (SQLite vs in-memory)
* instantiating engine backend (stateless vs incremental)

Keep factories **stateless** and returning **traits**.

---

## 4) “Three types of models” (Domain/DB/API): good idea, but tighten it

Your instinct is correct, but teams often overdo it and duplicate logic.

### Recommended strategy: 2.5 layers

1. **Domain**: the canonical types and invariants (the truth)
2. **Boundary models** (API/FFI + DB) as *serialization shapes* that convert into Domain

So you still get three sets, but the DB/API models are intentionally **dumb** and **thin**.

### Rule of thumb

* Domain types should be used by core logic.
* DB/API types exist only at the edges and must convert immediately.

### Conversion policy

* Conversion happens at module boundaries only.
* Exactly one canonical conversion path per boundary type:

  * `impl TryFrom<ApiEvent> for DomainEvent`
  * `impl From<DomainEvent> for DbEventRow`

### Avoid

* writing domain logic against DB structs
* having “DomainV1 / DomainV2” types proliferate without migrations

---

## 5) Type discipline

### Strong types where it matters

Use newtypes for:

* IDs (`EventId`, `TrackerId`, `SessionId`)
* Units (`Kg`, `Lb`, `CurrencyCode`, `DurationSec`)
* Time (`Ts` wrapper with timezone policy)
* Money (`Money { amount_minor: i64, currency: CurrencyCode }`)

### Don’t over-type everything

Avoid newtypes for:

* ephemeral DTO fields used only for display
* internal fields that never cross module boundaries

**Rule:** Newtype anything that prevents category errors.

---

## 6) Minimal comments policy (how to make it work)

Replace comments with:

* precise naming
* small functions
* type-level invariants
* doc tests for tricky logic (rare, but better than prose)

Allowed comments:

* only where the reasoning is non-obvious (e.g., PR definition edge cases)
* only where there’s a deliberate tradeoff

**Rule:** If you feel like adding a comment, first try to delete the need by changing the code shape.

---

## 7) Minimal code policy (enforced)

### Default rules

* No abstractions “for future”
* No traits unless there are ≥2 implementations now (or you’re isolating a boundary)
* No generic parameters unless required
* Prefer explicit over clever (but keep it short)

### “One feature = one file (initially)”

At MVP stage, keep modules small but not fragmented.

When a file grows beyond ~300–500 LOC, split by responsibility.

---

## 8) Module boundaries (core engine)

A clean minimal separation:

* `dsl` (parsing + validation) → outputs IR
* `engine` (apply + compute + simulate) → uses IR
* `storage` (app-side) → persists raw events, optional snapshots
* `api` boundary (FFI/JSI) → marshals JSON in/out

The engine should not know about SQLite, React Native, network, etc.

---

## 9) Error handling conventions (Rust)

* Use `thiserror` for error enums
* Use `Result<T, Error>`
* Errors should be:

  * boundary-friendly (serializable code + message)
  * stable (don’t leak internal debug formatting)

Use:

* `ErrorCode` enum like `DSL_PARSE_ERROR`, `SCHEMA_VALIDATION`, `METRIC_TYPE_ERROR`, `EVENT_INVALID`

No giant nested “anyhow” errors in library public surface (fine for CLI only).

---

## 10) Data flow conventions

### Canonical workflow

1. Parse DSL → `TrackerDef`
2. Validate event → `NormalizedEvent`
3. Apply/replay → outputs
4. Persist raw event, not derived state (derived can be cached)

### Determinism rules

* If you use floats for metrics (e.g., 1RM), define rounding policy (`round(2)` or use fixed-point).
* Define timezone policy up front (store UTC timestamps, render local).

---

## 11) Suggestions engine policy (keep it sane)

Do not let “suggestions” infect the metric engine.

Implement suggestions as:

* `Strategy` module that proposes hypothetical events
* calls `simulate()` to score candidates
* returns a short list (top 3) + reason string

This keeps the engine generic and the progression logic modular.

---

# How to work with gpt-5.1-codex effectively

## Prompt templates you should use

### A) “Write minimal code with my style”

* “Minimal modular Rust. No extra abstractions. Builder + factory only if needed. No comments. Strong types. Public API only.”

### B) “Refactor to reduce code”

* “Reduce LOC, keep types, eliminate unnecessary traits, keep boundaries.”

### C) “Enforce layering”

* “Domain models are canonical. DB/API models are edge-only. Provide TryFrom/From conversions.”

### D) “State machine implementation”

* “Use enum states + pure transition function. No side effects. Return next state + emitted actions.”

---

# Practical recommendation for your 3-model approach

**Best strategy:**

* Keep a single **canonical Domain model** in the Rust core (`tracker_ir` + `engine`).
* Have:

  * `Api*` models only in `tracker_ffi` / `rn_bridge`
  * `Db*` models only in the RN storage module (TS/SQLite layer) or in a small Rust “storage helper” crate if you store in Rust.

If you store events in JS/TS SQLite, keep DB models in TS and pass JSON arrays into Rust.

---

# Summary rules (your “style charter”)

1. Pure engine, deterministic outputs
2. State machines for flows, pure functions for math
3. Builders for complex construction, factories for selecting implementations
4. Domain is truth; DB/API are thin shells
5. Minimal code; no future abstractions
6. Types prevent category errors
7. Comments only for tricky reasoning

# Generic core library guidelines

## 1) Core must be domain-agnostic by construction

### What “generic” means here

The core library can only “understand” these primitives:

* **Events**: timestamped payloads
* **Schemas**: typed fields and constraints
* **Expressions**: metric/alert computation as pure math + aggregations
* **Time grains**: day/week/month/quarter/year/custom windows
* **Signals**: alert outputs (no side effects)
* **Simulation**: apply hypothetical events to produce deltas

It must **not** know:

* “reps”, “weight”, “bench press”
* “currency”, “expense”, “income”
* “project time”, “meeting”, “pomodoro”

Those are just field names in configs.

**Rule:** If a commit adds a concept that only makes sense in one app, it doesn’t belong in core.

---

## 2) Keep “meaning” outside core: use plugins/policy modules

### Split responsibilities

* **Core**: executes a tracker config + events, returns results
* **Domain policy modules** (workout/finance/time): define:

  * tracker configs (DSL)
  * strategy packs (suggestion generators)
  * catalog data (e.g., exercise → muscle groups mapping)
  * UI defaults (views, dashboards)

**Rule:** The only app-specific thing core should receive is data/config, never code branches.

---

## 3) No special-case fields, ever

You’ll be tempted to do this:

* `if field == "weight" { ... }`
* `if tracker_name == "Workout" { ... }`
* `if currency != base_currency { ... }`

Don’t.

Instead:

* express it in the DSL: `derive`, `metrics`, `alerts`
* or express it in a domain module: strategy pack uses `simulate()` + scoring

**Core rule:** no “well-known field names”.

---

## 4) Generic event model: unify all trackers

### Event shape is universal

* `tracker_id`
* `event_id`
* `ts`
* `payload` (typed via schema)
* `meta` (source, device, tags)

Everything else is derived.

**Rule:** adding a new tracker type must not require a new Rust struct shape; only a new config.

---

## 5) Generic metrics: keep expression language small and composable

The fastest way to destroy generic-ness is to keep expanding the DSL until it becomes a programming language.

### Minimal expression surface (recommended)

* arithmetic: `+ - * /`
* conditionals: `if ... then ... else ...`
* aggregations: `sum/max/min/avg/count`
* helpers: `coalesce`, `abs`, `round`
* time: `over(grain)` and `by(dimensions)`

Everything else should be implemented as:

* derived fields in `derive { ... }`, or
* domain strategy logic outside core

**Rule:** If you can’t justify a new DSL function for *at least two trackers*, it doesn’t go into core.

---

## 6) Alerts are signals, not actions

Alerts in core should only emit:

* `Signal { id, severity, payload }`

No:

* notifications
* push scheduling
* emails
* UI navigation

That’s app-level.

**Rule:** Side effects never live in core.

---

## 7) Planning mode must be generic and reusable

Planning should not encode “progressive overload”.

Planning is:

* cloning baseline state
* applying hypothetical events
* computing metric/alert deltas

Workout progression is a **policy layer** that:

* generates candidates
* runs simulate()
* scores them

Finance forecasting is the same:

* hypothetical “rent next month”
* “weekly dining budget”
* simulate to see budget impact

Time planning:

* allocate time blocks
* simulate to see overload

**Rule:** core exposes `simulate()`. Apps decide what it means.

---

## 8) “Two-layer core” strategy (to stay generic)

Split the Rust core into two conceptual tiers:

### Tier 1: Engine Kernel (ultra-generic)

* schema validation
* event normalization
* expression evaluation
* aggregation + group-by + windowing
* deterministic output + deltas

### Tier 2: Optional Packs (still generic, but higher-level)

* common functions (rolling averages, EWMA)
* common PR primitives (argmax/argmin snapshots)
* common view descriptors

Workout/Finance/Time live **outside** these tiers.

**Rule:** Tier 1 must never import Tier 2. Packs depend on kernel, not vice versa.

---

## 9) Strong generic types, but avoid domain typing leakage

Use types like:

* `FieldName`, `MetricName`, `Dimension`
* `Unit` as a stringly enum (`"kg"`, `"lb"`, `"currency"`, `"sec"`)
* `Value` as a tagged union (`Number`, `Int`, `String`, `Duration`, `Enum`, `Array`, `Object`)

Do not add:

* `WeightKg`, `Money`, `Reps` into the generic core types

Those belong in:

* domain modules, or
* configs

**Rule:** core types describe *structure*, not meaning.

---

## 10) Config-driven defaults, not app-driven hacks

If the workout app needs:

* “default metrics”
* “default charts”
* “PR definitions”

These go into tracker config (or a workout pack), not core conditionals.

**Rule:** UI and defaults are data/config, not branching logic.

---

## 11) Versioning and migrations must be first-class

Because “generic” implies you’ll change configs over time.

Core must support:

* tracker versioning (`v1`, `v2`)
* schema evolution events (optional)
* migration steps (e.g., rename field)

But it must support them generically:

* `schema_change` events
* `migrate(event)` functions derived from config

**Rule:** migrations are declarative; avoid writing migration code per tracker in core.

---

## 12) Code organization rules to enforce generic-ness

### Crate boundaries

* `tracker_engine` must not depend on `workout_*` or `finance_*`
* Domain crates depend on engine, never vice versa.

### Folder naming conventions

* `core/engine/*` = cannot reference any domain term (workout, expense, etc.)
* `packs/workout/*` = only place those terms are allowed

### CI guardrails (simple but effective)

* forbid certain strings in core crate (yes, literally):

  * “reps”, “bench”, “currency”, “expense”
* or forbid imports from domain crates

**Rule:** enforce generic-ness with tooling, not discipline alone.

---

# Quick checklist (PR gate)

Before merging a change to core, answer:

1. Does this benefit at least **two** trackers (workout + finance/time)?
2. Did we add any logic branching on tracker name/field name? (If yes, reject)
3. Is it expressible as config/DSL instead?
4. Does it add side effects to core? (If yes, reject)
5. Is the new feature purely about schema/expression/windowing/simulation? (If yes, likely OK)

---

# Pattern recommendation for your repo

## Where each concern lives

* `tracker-core` (generic):

  * DSL parsing + IR
  * engine compute/apply/simulate
  * expression + aggregation

* `tracker-packs-workout` (domain):

  * workout tracker config DSL
  * exercise catalog + muscle mapping
  * progression strategy definitions

* `tracker-packs-finance` (domain):

  * expense tracker config DSL
  * budget heuristics

* `tracker-packs-time` (domain):

  * time tracker config DSL
  * planning rules

React Native uses the pack configs and calls into the generic core.
