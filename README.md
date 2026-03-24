# wrkt

`wrkt` is a fitness tracking project built around `strata`, a reusable Rust tracker engine for DSL parsing, deterministic computation, analytics, and mobile FFI integration.

## Status

Active development. Architecture and APIs can evolve while core domain boundaries remain strict.

## Why `wrkt`

`wrkt` separates product behavior from UI implementation:

- Domain logic lives in Rust (`strata` + domain pack DSL).
- App clients consume contracts and engine outputs.
- Analytics and compute remain deterministic and testable.

## Key Capabilities

- DSL-first domain modeling for tracker definitions and queries.
- Reusable Rust core (`strata`) designed to stay domain-agnostic.
- Workout-specific pack (`workout-pack`) layered on top of the core.
- React Native client (`view`) connected through native FFI/JSI boundaries.
- Contract generation pipeline from Rust domain definitions to TypeScript consumers.

## Repository Layout

- `strata/`: generic Rust tracker core crates.
- `workout-pack/`: workout domain pack, import logic, and workout FFI wrapper.
- `view/`: React Native app, local persistence, navigation, analytics views, and native bridge usage.
- `integrations/`: integration surfaces at platform boundaries.
- `docs/`: architecture, product, persistence, integration, and testing documentation.

## Architecture Boundaries

The project uses a 3-model boundary:

- Domain model: canonical schema and behavior in Rust.
- Boundary models: API/FFI and persistence interfaces.
- UI model: presentation-only state and components.

Rule: domain behavior should not be reimplemented in the UI layer.

## Quick Start

Prerequisites:

- Rust toolchain
- Node.js + npm
- Xcode (iOS) and/or Android SDK/NDK toolchain

From repo root:

```sh
just pack-sync-dsl-contract
just sot-check
```

Run the app:

```sh
just metro
just ios
```

## Development Commands

- `just sot-check`: SoT checks, boundary checks, Rust tests, and TS compile.
- `just strata-purity`: enforce domain-agnostic constraints in `strata`.
- `just core-test`: run `strata` tests.
- `just pack-test`: run `workout-pack` tests.
- `just ts-check`: TypeScript compile check.

## Generated Contracts

`workout-pack/build.rs` generates app contracts:

- `view/src/domain/generated/workoutDslContract.ts`
- `view/src/domain/generated/workoutApiContract.ts`
- `view/src/domain/generated/workoutDomainContract.ts`

Regenerate contracts:

```sh
just pack-sync-dsl-contract
```

## Documentation

- `docs/architecture-overview.md`
- `docs/architecture-notes.md`
- `docs/development-guidelines.md`
- `docs/integrations.md`
- `docs/pack-creation-guide.md`
- `docs/persistence.md`
- `docs/product-requirements.md`
- `docs/testing.md`

## Contributing

Before opening a PR, run:

```sh
just sot-check
```

Keep domain changes in Rust/domain-pack layers and keep UI changes presentation-focused.

## License

MIT. See `LICENSE`.
