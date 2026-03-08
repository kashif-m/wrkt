# Pack Creation Guide (Strata + `<domain>-pack`)

This guide defines the canonical path to add a new domain pack (example: `expense-pack`) on top of `strata`.

## 1. Create the pack crate

1. Create a new Rust workspace crate at project root: `<domain>-pack/`.
2. Add dependencies:
   - `tracker_ir`
   - `tracker_dsl`
   - `tracker_engine`
   - `tracker_ffi_core` (for FFI wrapper crates)
3. Keep all domain logic inside the pack. Do not add domain terms to `strata`.

## 2. Define tracker DSL

1. Add `config/<domain>_v1.tracker` in the pack.
2. Define sections:
   - `fields` (event schema)
   - `derive` (derived fields)
   - `metrics` (aggregations)
   - `alerts` (signal rules)
   - `planning` (strategy params, if suggestions are needed)
3. Keep DSL declarative. If logic is not reusable across at least two trackers, keep it in pack code, not core DSL.

## 3. Compile DSL at build time

1. Add `build.rs` in the pack.
2. In `build.rs`:
   - read DSL file
   - run `tracker_dsl::compile`
   - emit generated artifact with:
     - raw DSL string constant
     - compiled `TrackerDefinition` JSON constant
3. In pack `src/lib.rs`, expose:
   - `pub const <DOMAIN>_TRACKER_DSL: &str`
   - `pub fn compiled_<domain>_definition() -> tracker_ir::TrackerDefinition`

## 4. Implement pack-specific behavior

1. Add domain analytics/planning/catalog modules in the pack.
2. Planning must read `TrackerDefinition::planning()` strategy params, not hardcode tuning values only in Rust.
3. Keep payload UI formatting out of Rust core responses unless it is truly domain computation output.

## 5. Expose FFI surface

1. Keep generic FFI APIs (`strata_compile_tracker`, `strata_compute`, etc.) DSL-driven through `tracker_ffi_core`.
2. Add optional built-in pack endpoints (`strata_compute_<domain>_tracker`) for app convenience/perf.
3. Built-in endpoints must use compile-time compiled definition from the pack artifact.

## 6. Wire app layer

1. Add app wrappers for built-in methods.
2. Route domain flows to built-in pack methods.
3. Keep generic methods available for future dynamic tracker usage.

## 7. Validation checklist

1. `cargo check` in `strata`.
2. `cargo check` and `cargo test` in pack.
3. `npx tsc --noEmit` in app.
4. Manual parity check:
   - create/update/delete events
   - analytics parity
   - planning/suggestions parity

## 8. Cutover and cleanup

1. Do drop-in replacement first.
2. After parity confirmation:
   - remove fallback paths
   - remove transitional adapters/feature flags
   - keep one canonical runtime path.
