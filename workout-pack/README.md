# workout-pack

`workout-pack` is the workout domain layer built on top of `strata`.

## Responsibilities

- Define workout tracker DSL (`config/workout_v1.tracker`)
- Compile DSL at build time
- Provide workout-specific analytics orchestration and response shaping
- Own workout catalog/import/domain policies
- Expose workout FFI entry points (`crates/workout_ffi`)

## Single Source of Truth

Workout domain behavior should flow from DSL sections:

- `fields`
- `derive`
- `metrics`
- `views`

The runtime resolves metric execution through generic engine APIs, while pack code handles composition/presentation-specific shaping.

## Generated Outputs

`build.rs` compiles DSL and emits artifacts consumed by the app:

- Rust compiled tracker constants
- `view/src/domain/generated/workoutDslContract.ts`
- `view/src/domain/generated/workoutApiContract.ts`
- `view/src/domain/generated/workoutDomainContract.ts`

## Development

From `workout-pack/`:

```sh
cargo build -p workout_pack
cargo test -p workout_pack -p workout_ffi
```

From repo root:

```sh
just pack-sync-dsl-contract
just pack-test
```

## Key Files

- DSL: `config/workout_v1.tracker`
- Build generator: `build.rs`
- Analytics module: `src/analytics/mod.rs`
- Metric/query types: `src/analytics/types.rs`
