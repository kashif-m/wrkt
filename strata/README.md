# strata

`strata` is the generic Rust tracker core intended to be reusable across domains (workout, expense, time, etc.).

## Scope

`strata` owns:

- DSL parsing and compilation (`tracker_dsl`)
- Canonical IR and errors (`tracker_ir`)
- Expression evaluation and deterministic aggregation (`tracker_eval`)
- Generic compute/simulate engine (`tracker_engine`)
- Generic analytics utilities (`tracker_analytics`)
- FFI core and wrapper crates (`tracker_ffi_core`, `tracker_ffi`)

`strata` must not contain domain-specific behavior.

## Crates

- `crates/tracker_dsl`
- `crates/tracker_ir`
- `crates/tracker_eval`
- `crates/tracker_engine`
- `crates/tracker_analytics`
- `crates/tracker_catalog`
- `crates/tracker_export`
- `crates/tracker_ffi_core`
- `crates/tracker_ffi`

## Design Rules

- Pure deterministic compute: `output = f(definition, events, query)`
- No workout/expense/time hardcoded terms in core logic
- Boundary-safe structured errors
- No dependency on `workout-pack` or `view`

## Development

From `strata/`:

```sh
cargo test
cargo test -p tracker_dsl -p tracker_engine
```

From repo root:

```sh
just strata-purity
just sot-check
```

## Publish Readiness

Local packageability check (offline):

```sh
just strata-publish-check
```

Before actual crates.io publish, run online dry-runs with a clean tree.

## Integration Surface

`strata` is consumed by domain packs (for example `workout-pack`) and exposed to RN via FFI wrappers.
