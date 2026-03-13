# persistence

`persistence` documents the local data storage model used by the `view` app.

## Responsibilities

- Define local storage boundaries for tracker definitions and event logs.
- Keep persistence edge models separate from Rust domain models.
- Support deterministic analytics by storing raw events and replaying through the core engine.

## Design Principles

- Offline-first writes: events are persisted immediately on-device.
- Append-only event history for recomputable analytics.
- Boundary conversion at the edge: DB/API row types convert into domain-safe shapes before compute.

## Data Model (Reference)

- `trackers`: tracker metadata and DSL/version references.
- `events`: normalized event log indexed by tracker and timestamp.
- `snapshots` (optional): cached analytics results for performance-sensitive queries.

## Integration Notes

- Event validation should run through the native tracker engine boundary before persistence.
- Reads should load ordered events and delegate metric computation to Rust via JSI/FFI.
- Keep timezone/timestamp policy explicit (UTC storage, local rendering).

## Related Docs

- `../docs/development-guidelines.md`
- `../docs/architecture-overview.md`
- `../view/README.md`
