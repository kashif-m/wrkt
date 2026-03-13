# Testing

## Goals

- Protect deterministic compute behavior.
- Guard DSL-to-runtime contract integrity.
- Validate FFI boundary correctness.

## Test Layers

1. Unit tests
- `tracker_dsl`: parser + compile validation
- `tracker_engine`: compute/validate/apply/simulate primitives
- `tracker_eval`: expression + aggregation semantics
- `tracker_analytics`: generic time/distribution helpers
- `workout-pack`: domain analytics + metric parsing

2. Integration tests
- `tracker_ffi`: FFI roundtrip tests (`tests/ffi_integration.rs`)

3. Type safety checks
- TypeScript compile in `view`

## Local Commands

```sh
just sot-check
```

Targeted:

```sh
cd strata && cargo test -p tracker_dsl -p tracker_engine -p tracker_ffi -p tracker_ffi_core
cd workout-pack && cargo test -p workout_pack -p workout_ffi
cd view && npx tsc --noEmit
```

## Coverage

A core coverage gate is provided:

```sh
just coverage-core
```

Notes:
- Requires `cargo-llvm-cov` installed.
- Current threshold is configured in `justfile`.

## Test Patterns

- Prefer deterministic fixtures (no wall-clock dependence unless isolated).
- Assert structured errors (`code`, `message`, `context`) at FFI edges.
- Add parser diagnostics assertions for invalid DSL line context.
