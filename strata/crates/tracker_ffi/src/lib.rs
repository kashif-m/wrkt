//! C ABI wrappers for Strata core APIs.

use serde::Serialize;
use serde_json::json;
use std::ffi::{CStr, CString};
use std::os::raw::c_char;
use tracker_engine::{self, EngineError};
use tracker_ir::{NormalizedEvent, Query, TrackerDefinition};
use workout_pack::{catalog, generate_suggestions, PlannerKind};

#[repr(C)]
pub struct FfiResult {
    pub success: bool,
    pub data: *mut c_char,
}

#[no_mangle]
pub extern "C" fn strata_free_string(ptr: *mut c_char) {
    if ptr.is_null() {
        return;
    }
    unsafe {
        drop(CString::from_raw(ptr));
    }
}

#[no_mangle]
pub extern "C" fn strata_compile_tracker(dsl_ptr: *const c_char) -> FfiResult {
    handle(|| {
        let dsl = cstr_to_str(dsl_ptr)?;
        let def = tracker_engine::compile_tracker(dsl).map_err(to_string)?;
        Ok(json!({
            "tracker_id": def.tracker_id().as_str(),
            "dsl": def.dsl(),
        }))
    })
}

#[no_mangle]
pub extern "C" fn strata_validate_event(
    dsl_ptr: *const c_char,
    event_json_ptr: *const c_char,
) -> FfiResult {
    handle(|| {
        let dsl = cstr_to_str(dsl_ptr)?;
        let event_json = cstr_to_str(event_json_ptr)?;
        let def = tracker_engine::compile_tracker(dsl).map_err(to_string)?;
        let normalized = tracker_engine::validate_event(&def, event_json).map_err(to_string)?;
        Ok(normalized)
    })
}

#[no_mangle]
pub extern "C" fn strata_compute(
    dsl_ptr: *const c_char,
    events_json_ptr: *const c_char,
    query_json_ptr: *const c_char,
) -> FfiResult {
    handle(|| {
        let def = compile_from_ptr(dsl_ptr)?;
        let events = parse_events(events_json_ptr)?;
        let query = parse_query(query_json_ptr)?;
        let output = tracker_engine::compute(&def, &events, query).map_err(to_string)?;
        Ok(output)
    })
}

#[no_mangle]
pub extern "C" fn strata_simulate(
    dsl_ptr: *const c_char,
    base_events_ptr: *const c_char,
    hypotheticals_ptr: *const c_char,
    query_json_ptr: *const c_char,
) -> FfiResult {
    handle(|| {
        let def = compile_from_ptr(dsl_ptr)?;
        let base = parse_events(base_events_ptr)?;
        let hypothetical = parse_events(hypotheticals_ptr)?;
        let query = parse_query(query_json_ptr)?;
        let output =
            tracker_engine::simulate(&def, &base, &hypothetical, query).map_err(to_string)?;
        Ok(output)
    })
}

#[no_mangle]
pub extern "C" fn strata_generate_suggestions(
    dsl_ptr: *const c_char,
    events_ptr: *const c_char,
    planner_kind_ptr: *const c_char,
) -> FfiResult {
    handle(|| {
        let def = compile_from_ptr(dsl_ptr)?;
        let events = parse_events(events_ptr)?;
        let planner_kind = parse_planner_kind(planner_kind_ptr)?;
        let suggestions = generate_suggestions(planner_kind, &def, &events).map_err(to_string)?;
        Ok(suggestions)
    })
}

fn compile_from_ptr(ptr: *const c_char) -> Result<TrackerDefinition, String> {
    let dsl = cstr_to_str(ptr)?;
    tracker_engine::compile_tracker(dsl).map_err(to_string)
}

fn parse_events(ptr: *const c_char) -> Result<Vec<NormalizedEvent>, String> {
    let events_json = cstr_to_str(ptr)?;
    serde_json::from_str(events_json).map_err(|err| err.to_string())
}

fn parse_query(ptr: *const c_char) -> Result<Query, String> {
    if ptr.is_null() {
        return Ok(Query::default());
    }
    let json = cstr_to_str(ptr)?;
    if json.trim().is_empty() {
        return Ok(Query::default());
    }
    serde_json::from_str(json).or(Ok(Query::default()))
}

fn parse_planner_kind(ptr: *const c_char) -> Result<PlannerKind, String> {
    let kind = cstr_to_str(ptr)?.to_lowercase();
    match kind.as_str() {
        "strength" => Ok(PlannerKind::Strength),
        "hypertrophy" => Ok(PlannerKind::Hypertrophy),
        "conditioning" => Ok(PlannerKind::Conditioning),
        other => Err(format!("unknown planner kind: {other}")),
    }
}

#[no_mangle]
pub extern "C" fn strata_exercise_catalog() -> FfiResult {
    handle(|| Ok(catalog::catalog_json()))
}

#[no_mangle]
pub extern "C" fn strata_import_fitnotes(path_ptr: *const c_char) -> FfiResult {
    handle(|| {
        let path = cstr_to_str(path_ptr)?;
        let bundle = workout_pack::import::fitnotes::import_fitnotes(path)
            .map_err(|err| err.to_string())?;
        Ok(bundle)
    })
}

#[no_mangle]
pub extern "C" fn strata_validate_exercise(entry_json_ptr: *const c_char) -> FfiResult {
    handle(|| {
        let entry_json = cstr_to_str(entry_json_ptr)?;
        let def: catalog::ExerciseDefinition =
            serde_json::from_str(entry_json).map_err(|err| err.to_string())?;
        catalog::validate_exercise(&def)?;
        let clean = catalog::sanitize_exercise(&def);
        Ok(clean)
    })
}

fn cstr_to_str<'a>(ptr: *const c_char) -> Result<&'a str, String> {
    if ptr.is_null() {
        return Err("null pointer".into());
    }
    unsafe { CStr::from_ptr(ptr) }
        .to_str()
        .map_err(|err| err.to_string())
}

fn handle<T>(op: impl FnOnce() -> Result<T, String>) -> FfiResult
where
    T: Serialize,
{
    match op() {
        Ok(value) => success(value),
        Err(err) => error(err),
    }
}

fn success<T: Serialize>(value: T) -> FfiResult {
    match serde_json::to_string(&value) {
        Ok(json_string) => FfiResult {
            success: true,
            data: string_to_c(json_string),
        },
        Err(err) => error(err.to_string()),
    }
}

fn error(message: String) -> FfiResult {
    FfiResult {
        success: false,
        data: string_to_c(message),
    }
}

fn string_to_c(value: String) -> *mut c_char {
    match CString::new(value) {
        Ok(cstring) => cstring.into_raw(),
        Err(_) => CString::new("string contains null bytes")
            .unwrap()
            .into_raw(),
    }
}

fn to_string(error: EngineError) -> String {
    error.to_string()
}
