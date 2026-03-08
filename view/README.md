# view

`view` is the React Native client app for `wrkt`.

## Responsibilities

- UI rendering, navigation, and interaction flows
- Local persistence and app state orchestration
- Calling native tracker functions through JSI/FFI bridge
- Consuming generated domain/API contracts from `workout-pack`

## Native Bridge (JSI)

JSI is implemented for both platforms:

- iOS binding: `ios/TrackerEngineBinding.mm`
- Android binding: `android/app/src/main/cpp/TrackerEngineBinding.cpp`

JSI delegates to Rust FFI exposed by `workout_ffi`/`tracker_ffi_core`.

## Generated Contracts (Do not edit)

- `src/domain/generated/workoutDslContract.ts`
- `src/domain/generated/workoutApiContract.ts`
- `src/domain/generated/workoutDomainContract.ts`

Regenerate from repo root:

```sh
just pack-sync-dsl-contract
```

## Setup

From repo root:

```sh
just pack-sync-dsl-contract
cd view && npm install
just pods
```

## Run

From repo root:

```sh
just metro
just ios
```

Android build requires Android SDK/NDK setup; native libs are built via root recipes.

## Quality Gates

From repo root:

```sh
just ts-check
just sot-check
```
