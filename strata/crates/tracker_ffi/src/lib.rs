//! C ABI wrappers for generic Strata core APIs.

use std::os::raw::c_char;

pub use tracker_ffi_core::FfiResult;

#[no_mangle]
pub extern "C" fn strata_free_string(ptr: *mut c_char) {
    tracker_ffi_core::strata_free_string(ptr)
}

#[no_mangle]
pub extern "C" fn strata_compile_tracker(dsl_ptr: *const c_char) -> FfiResult {
    tracker_ffi_core::strata_compile_tracker(dsl_ptr)
}

#[no_mangle]
pub extern "C" fn strata_validate_event(
    dsl_ptr: *const c_char,
    event_json_ptr: *const c_char,
) -> FfiResult {
    tracker_ffi_core::strata_validate_event(dsl_ptr, event_json_ptr)
}

#[no_mangle]
pub extern "C" fn strata_compute(
    dsl_ptr: *const c_char,
    events_json_ptr: *const c_char,
    query_json_ptr: *const c_char,
) -> FfiResult {
    tracker_ffi_core::strata_compute(dsl_ptr, events_json_ptr, query_json_ptr)
}

#[no_mangle]
pub extern "C" fn strata_simulate(
    dsl_ptr: *const c_char,
    base_events_ptr: *const c_char,
    hypotheticals_ptr: *const c_char,
    query_json_ptr: *const c_char,
) -> FfiResult {
    tracker_ffi_core::strata_simulate(dsl_ptr, base_events_ptr, hypotheticals_ptr, query_json_ptr)
}

#[no_mangle]
pub extern "C" fn strata_export_generic_sqlite(
    payload_json_ptr: *const c_char,
    output_path_ptr: *const c_char,
) -> FfiResult {
    tracker_ffi_core::strata_export_generic_sqlite(payload_json_ptr, output_path_ptr)
}

#[no_mangle]
pub extern "C" fn strata_import_generic_sqlite(input_path_ptr: *const c_char) -> FfiResult {
    tracker_ffi_core::strata_import_generic_sqlite(input_path_ptr)
}
