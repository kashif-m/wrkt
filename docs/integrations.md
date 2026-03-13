# integrations

`integrations` contains cross-layer integration points between app surfaces and native/core runtime components.

## Responsibilities

- Hold integration-specific notes and adapters that connect `view` with Rust FFI/JSI layers.
- Keep platform bridge concerns separate from core domain logic.

## Current Focus

- Native bridge integration patterns for iOS/Android runtime calls into tracker FFI.
- Coordination points for generated contracts and runtime invocation flow.

## Related Components

- `../view/README.md`
- `../workout-pack/README.md`
- `../strata/README.md`
