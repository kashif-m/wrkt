# wrkt

`wrkt` is a React Native app backed by a Rust analytics engine with a DSL-first domain model.

## Repository Layout

- `strata/`: Generic, domain-agnostic Rust core (DSL parser, IR, evaluator, engine, analytics primitives, FFI core).
- `workout-pack/`: Workout domain pack (workout DSL, analytics orchestration, catalog/import logic, workout FFI wrapper).
- `view/`: React Native app (UI, local persistence, navigation, native JSI bindings).
- `integrations/`: Platform integration surfaces (for example JSI/native boundary).
- `docs/`: Shared project documentation (architecture, testing, product, and guidelines).

## The 3-model boundary

- Domain model: canonical logic and schema in Rust (`strata` + pack DSL).
- Boundary models: API/FFI and DB/persistence shapes at module edges.
- UI model: presentation-only state and component props.

Rule: domain behavior must be defined in DSL/pack/core, not reimplemented in UI.

## Quick Start

Prerequisites:

- Rust toolchain
- Node + npm
- Xcode (iOS) and/or Android toolchain

From repo root:

```sh
just pack-sync-dsl-contract
just sot-check
```

Run app:

```sh
just metro
just ios
```

## Common Commands

- `just sot-check`: purity + SoT checks + Rust tests + TypeScript compile
- `just strata-purity`: blocks domain leakage into `strata`
- `just pack-test`: workout pack tests
- `just core-test`: strata tests
- `just ts-check`: TypeScript compile check

## Build Artifacts

`workout-pack/build.rs` generates contracts consumed by the app:

- `view/src/domain/generated/workoutDslContract.ts`
- `view/src/domain/generated/workoutApiContract.ts`
- `view/src/domain/generated/workoutDomainContract.ts`

Regenerate with:

```sh
just pack-sync-dsl-contract
```

## Shared Docs

- `docs/architecture-overview.md`
- `docs/architecture-notes.md`
- `docs/development-guidelines.md`
- `docs/integrations.md`
- `docs/pack-creation-guide.md`
- `docs/persistence.md`
- `docs/product-requirements.md`
- `docs/testing.md`
