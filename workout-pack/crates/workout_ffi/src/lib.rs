//! C ABI wrappers for Strata core APIs.

use serde::Serialize;
use serde_json::json;
use std::collections::HashMap;
use std::ffi::{CStr, CString};
use std::os::raw::c_char;
use tracker_engine::{self, EngineError};
use tracker_export::{export_generic_sqlite, import_generic_sqlite, GenericExportPayload};
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
pub extern "C" fn strata_export_generic_sqlite(
    payload_json_ptr: *const c_char,
    output_path_ptr: *const c_char,
) -> FfiResult {
    handle(|| {
        let payload_json = cstr_to_str(payload_json_ptr)?;
        let payload: GenericExportPayload =
            serde_json::from_str(payload_json).map_err(|err| err.to_string())?;
        let output_path = if output_path_ptr.is_null() {
            None
        } else {
            Some(cstr_to_str(output_path_ptr)?)
        };
        let summary = export_generic_sqlite(&payload, output_path)?;
        Ok(summary)
    })
}

#[no_mangle]
pub extern "C" fn strata_import_generic_sqlite(input_path_ptr: *const c_char) -> FfiResult {
    handle(|| {
        let path = cstr_to_str(input_path_ptr)?;
        let bundle = import_generic_sqlite(path)?;
        Ok(bundle)
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
        let bundle =
            workout_pack::import::fitnotes::import_fitnotes(path).map_err(|err| err.to_string())?;
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

// --- Time Policy FFI ---

#[no_mangle]
pub extern "C" fn strata_round_to_local_day(ts_ms: i64, offset_minutes: i32) -> i64 {
    workout_pack::round_to_local_day(ts_ms, offset_minutes)
}

#[no_mangle]
pub extern "C" fn strata_round_to_local_week(ts_ms: i64, offset_minutes: i32) -> i64 {
    workout_pack::round_to_local_week(ts_ms, offset_minutes)
}

// --- Metrics FFI ---

#[no_mangle]
pub extern "C" fn strata_estimate_one_rm(weight: f64, reps: i32) -> f64 {
    workout_pack::estimate_one_rm(weight, reps)
}

#[no_mangle]
pub extern "C" fn strata_detect_pr(
    exercise_ptr: *const c_char,
    events_json_ptr: *const c_char,
    new_weight: f64,
    new_reps: i32,
) -> FfiResult {
    handle(|| {
        let exercise = cstr_to_str(exercise_ptr)?;
        let events_json = cstr_to_str(events_json_ptr)?;
        let events: Vec<serde_json::Value> =
            serde_json::from_str(events_json).map_err(|e| e.to_string())?;

        let weight = if new_weight > 0.0 {
            Some(new_weight)
        } else {
            None
        };
        let reps = if new_reps > 0 { Some(new_reps) } else { None };

        let result = workout_pack::detect_pr(exercise, &events, weight, reps);
        Ok(result)
    })
}

#[no_mangle]
pub extern "C" fn strata_score_set(
    weight: f64,
    reps: i32,
    duration: f64,
    distance: f64,
    logging_mode_ptr: *const c_char,
) -> f64 {
    let mode_str = match cstr_to_str(logging_mode_ptr) {
        Ok(s) => s,
        Err(_) => "reps_weight",
    };
    let mode = workout_pack::LoggingMode::from_str(mode_str);

    let weight_opt = if weight > 0.0 { Some(weight) } else { None };
    let reps_opt = if reps > 0 { Some(reps) } else { None };
    let duration_opt = if duration > 0.0 { Some(duration) } else { None };
    let distance_opt = if distance > 0.0 { Some(distance) } else { None };

    workout_pack::score_set(weight_opt, reps_opt, duration_opt, distance_opt, mode)
}

/// Build PR payload - single FFI call to process all events and return payload with PR flags
#[no_mangle]
pub extern "C" fn strata_build_pr_payload(
    payload_json_ptr: *const c_char,
    event_ts: i64,
    events_json_ptr: *const c_char,
    existing_event_json_ptr: *const c_char, // Can be null or empty for new events
    logging_mode_ptr: *const c_char,
) -> FfiResult {
    handle(|| {
        let payload_json = cstr_to_str(payload_json_ptr)?;
        let events_json = cstr_to_str(events_json_ptr)?;
        let logging_mode = cstr_to_str(logging_mode_ptr)?;

        let payload: workout_pack::SetPayload =
            serde_json::from_str(payload_json).map_err(|e| e.to_string())?;
        let events: Vec<serde_json::Value> =
            serde_json::from_str(events_json).map_err(|e| e.to_string())?;

        // Parse existing event if provided (for updates)
        let existing_event: Option<workout_pack::ExistingEventInfo> =
            if existing_event_json_ptr.is_null() {
                None
            } else {
                let existing_json = cstr_to_str(existing_event_json_ptr)?;
                if existing_json.is_empty() || existing_json == "null" {
                    None
                } else {
                    Some(serde_json::from_str(existing_json).map_err(|e| e.to_string())?)
                }
            };

        let result = workout_pack::build_pr_payload(
            payload,
            event_ts,
            &events,
            existing_event.as_ref(),
            logging_mode,
        );

        Ok(result)
    })
}

#[no_mangle]
pub extern "C" fn strata_compute_analytics(
    events_json_ptr: *const c_char,
    offset_minutes: i32,
    catalog_json_ptr: *const c_char,
) -> FfiResult {
    handle(|| {
        let events_json = cstr_to_str(events_json_ptr)?;
        // Parse into our local struct list
        let events: Vec<workout_pack::analytics::AnalyticsInputEvent> =
            serde_json::from_str(events_json).map_err(|e| e.to_string())?;

        let catalog_json = cstr_to_str(catalog_json_ptr)?;
        let entries: Vec<workout_pack::ExerciseDefinition> =
            serde_json::from_str(catalog_json).map_err(|e| e.to_string())?;

        let map = build_catalog_map(entries);

        let summary = workout_pack::analytics::compute_summary(&events, offset_minutes, &map);
        Ok(summary)
    })
}

#[no_mangle]
pub extern "C" fn strata_compute_workout_analytics(
    events_json_ptr: *const c_char,
    offset_minutes: i32,
    catalog_json_ptr: *const c_char,
    query_json_ptr: *const c_char,
) -> FfiResult {
    handle(|| {
        let events_json = cstr_to_str(events_json_ptr)?;
        let events: Vec<workout_pack::analytics::AnalyticsInputEvent> =
            serde_json::from_str(events_json).map_err(|e| e.to_string())?;

        let catalog_json = cstr_to_str(catalog_json_ptr)?;
        let entries: Vec<workout_pack::ExerciseDefinition> =
            serde_json::from_str(catalog_json).map_err(|e| e.to_string())?;

        let query_json = cstr_to_str(query_json_ptr)?;
        let query: workout_pack::analytics::WorkoutAnalyticsQuery =
            serde_json::from_str(query_json).map_err(|e| e.to_string())?;

        let map = build_catalog_map(entries);

        let series =
            workout_pack::analytics::compute_workout_metrics(&events, offset_minutes, &map, &query);
        Ok(series)
    })
}

#[no_mangle]
pub extern "C" fn strata_compute_breakdown_analytics(
    events_json_ptr: *const c_char,
    offset_minutes: i32,
    catalog_json_ptr: *const c_char,
    query_json_ptr: *const c_char,
) -> FfiResult {
    handle(|| {
        let events_json = cstr_to_str(events_json_ptr)?;
        let events: Vec<workout_pack::analytics::AnalyticsInputEvent> =
            serde_json::from_str(events_json).map_err(|e| e.to_string())?;

        let catalog_json = cstr_to_str(catalog_json_ptr)?;
        let entries: Vec<workout_pack::ExerciseDefinition> =
            serde_json::from_str(catalog_json).map_err(|e| e.to_string())?;

        let query_json = cstr_to_str(query_json_ptr)?;
        let query: workout_pack::analytics::BreakdownQuery =
            serde_json::from_str(query_json).map_err(|e| e.to_string())?;

        let map = build_catalog_map(entries);

        let response =
            workout_pack::analytics::compute_breakdown(&events, offset_minutes, &map, &query);
        Ok(response)
    })
}

#[no_mangle]
pub extern "C" fn strata_compute_exercise_analytics(
    events_json_ptr: *const c_char,
    offset_minutes: i32,
    catalog_json_ptr: *const c_char,
    query_json_ptr: *const c_char,
) -> FfiResult {
    handle(|| {
        let events_json = cstr_to_str(events_json_ptr)?;
        let events: Vec<workout_pack::analytics::AnalyticsInputEvent> =
            serde_json::from_str(events_json).map_err(|e| e.to_string())?;

        let catalog_json = cstr_to_str(catalog_json_ptr)?;
        let entries: Vec<workout_pack::ExerciseDefinition> =
            serde_json::from_str(catalog_json).map_err(|e| e.to_string())?;

        let query_json = cstr_to_str(query_json_ptr)?;
        let query: workout_pack::analytics::ExerciseSeriesQuery =
            serde_json::from_str(query_json).map_err(|e| e.to_string())?;

        let map = build_catalog_map(entries);

        let response =
            workout_pack::analytics::compute_exercise_series(&events, offset_minutes, &map, &query);
        Ok(response)
    })
}

#[no_mangle]
pub extern "C" fn strata_compute_home_day_analytics(
    events_json_ptr: *const c_char,
    offset_minutes: i32,
    catalog_json_ptr: *const c_char,
    query_json_ptr: *const c_char,
) -> FfiResult {
    handle(|| {
        let events_json = cstr_to_str(events_json_ptr)?;
        let events: Vec<workout_pack::analytics::AnalyticsInputEvent> =
            serde_json::from_str(events_json).map_err(|e| e.to_string())?;

        let catalog_json = cstr_to_str(catalog_json_ptr)?;
        let entries: Vec<workout_pack::ExerciseDefinition> =
            serde_json::from_str(catalog_json).map_err(|e| e.to_string())?;

        let query_json = cstr_to_str(query_json_ptr)?;
        let query: workout_pack::analytics::HomeDayQuery =
            serde_json::from_str(query_json).map_err(|e| e.to_string())?;

        let map = build_catalog_map(entries);

        let response =
            workout_pack::analytics::compute_home_day_analytics(&events, offset_minutes, &map, &query);
        Ok(response)
    })
}

#[no_mangle]
pub extern "C" fn strata_compute_calendar_month_analytics(
    events_json_ptr: *const c_char,
    offset_minutes: i32,
    catalog_json_ptr: *const c_char,
    query_json_ptr: *const c_char,
) -> FfiResult {
    handle(|| {
        let events_json = cstr_to_str(events_json_ptr)?;
        let events: Vec<workout_pack::analytics::AnalyticsInputEvent> =
            serde_json::from_str(events_json).map_err(|e| e.to_string())?;

        let catalog_json = cstr_to_str(catalog_json_ptr)?;
        let entries: Vec<workout_pack::ExerciseDefinition> =
            serde_json::from_str(catalog_json).map_err(|e| e.to_string())?;

        let query_json = cstr_to_str(query_json_ptr)?;
        let query: workout_pack::analytics::CalendarMonthQuery =
            serde_json::from_str(query_json).map_err(|e| e.to_string())?;

        let map = build_catalog_map(entries);

        let response = workout_pack::analytics::compute_calendar_month_analytics(
            &events,
            offset_minutes,
            &map,
            &query,
        );
        Ok(response)
    })
}

fn build_catalog_map(
    entries: Vec<workout_pack::ExerciseDefinition>,
) -> HashMap<String, workout_pack::analytics::CatalogEntryLite> {
    let mut map = HashMap::new();
    for entry in entries {
        let entry_lite = workout_pack::analytics::CatalogEntryLite {
            muscle: entry.primary_muscle_group,
            logging_mode: entry.logging_mode,
            modality: entry.modality,
        };

        let raw_name = entry.display_name;
        let raw_slug = entry.slug;
        let normalized_name = workout_pack::catalog_key::normalize_catalog_key(&raw_name);
        let normalized_slug = workout_pack::catalog_key::normalize_catalog_key(&raw_slug);

        if !raw_name.is_empty() {
            map.entry(raw_name).or_insert_with(|| entry_lite.clone());
        }
        if !raw_slug.is_empty() {
            map.entry(raw_slug).or_insert_with(|| entry_lite.clone());
        }
        if !normalized_name.is_empty() {
            map.entry(normalized_name)
                .or_insert_with(|| entry_lite.clone());
        }
        if !normalized_slug.is_empty() {
            map.entry(normalized_slug)
                .or_insert_with(|| entry_lite.clone());
        }
    }
    map
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
