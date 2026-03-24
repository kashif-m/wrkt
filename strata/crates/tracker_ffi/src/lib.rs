//! C ABI wrappers for generic Strata core APIs.

use std::os::raw::c_char;

pub use tracker_ffi_core::FfiResult;

/// Frees an allocated C string returned by Strata FFI calls.
#[no_mangle]
///
/// # Safety
/// `ptr` must be a valid pointer produced by Strata FFI and must not be freed more than once.
pub unsafe extern "C" fn strata_free_string(ptr: *mut c_char) {
    // SAFETY: Guaranteed by this function's contract.
    unsafe { tracker_ffi_core::strata_free_string(ptr) }
}

/// Compiles tracker DSL and returns a JSON payload with tracker metadata.
#[no_mangle]
pub extern "C" fn strata_compile_tracker(dsl_ptr: *const c_char) -> FfiResult {
    tracker_ffi_core::strata_compile_tracker(dsl_ptr)
}

/// Validates one event JSON object against a DSL definition.
#[no_mangle]
pub extern "C" fn strata_validate_event(
    dsl_ptr: *const c_char,
    event_json_ptr: *const c_char,
) -> FfiResult {
    tracker_ffi_core::strata_validate_event(dsl_ptr, event_json_ptr)
}

/// Computes engine output for a DSL + event list + query.
#[no_mangle]
pub extern "C" fn strata_compute(
    dsl_ptr: *const c_char,
    events_json_ptr: *const c_char,
    query_json_ptr: *const c_char,
) -> FfiResult {
    tracker_ffi_core::strata_compute(dsl_ptr, events_json_ptr, query_json_ptr)
}

/// Runs hypothetical simulation against a base event list.
#[no_mangle]
pub extern "C" fn strata_simulate(
    dsl_ptr: *const c_char,
    base_events_ptr: *const c_char,
    hypotheticals_ptr: *const c_char,
    query_json_ptr: *const c_char,
) -> FfiResult {
    tracker_ffi_core::strata_simulate(dsl_ptr, base_events_ptr, hypotheticals_ptr, query_json_ptr)
}

/// Exports normalized events into generic SQLite format.
#[no_mangle]
pub extern "C" fn strata_export_generic_sqlite(
    payload_json_ptr: *const c_char,
    output_path_ptr: *const c_char,
) -> FfiResult {
    tracker_ffi_core::strata_export_generic_sqlite(payload_json_ptr, output_path_ptr)
}

/// Imports normalized events from generic SQLite format.
#[no_mangle]
pub extern "C" fn strata_import_generic_sqlite(input_path_ptr: *const c_char) -> FfiResult {
    tracker_ffi_core::strata_import_generic_sqlite(input_path_ptr)
}
