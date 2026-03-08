//! C ABI wrappers for Strata core APIs.

use serde::de::DeserializeOwned;
use std::collections::HashMap;
use std::os::raw::c_char;
use workout_pack::catalog;

pub use tracker_ffi_core::FfiResult;
use tracker_ffi_core::{cstr_to_str, handle, parse_events, parse_query, to_engine_error_string};
use tracker_ir::error::{ErrorCode, TrackerError};
use tracker_ir::{EventId, NormalizedEvent, Timestamp};

#[no_mangle]
pub extern "C" fn strata_free_string(ptr: *mut c_char) {
    tracker_ffi_core::strata_free_string(ptr)
}

#[no_mangle]
pub extern "C" fn strata_compile_tracker(dsl_ptr: *const c_char) -> FfiResult {
    tracker_ffi_core::strata_compile_tracker(dsl_ptr)
}

#[no_mangle]
pub extern "C" fn strata_compile_workout_tracker() -> FfiResult {
    handle(|| {
        let def = workout_pack::compiled_workout_definition();
        Ok(serde_json::json!({
            "tracker_id": def.tracker_id().as_str(),
            "dsl": workout_pack::WORKOUT_TRACKER_DSL,
        }))
    })
}

#[no_mangle]
pub extern "C" fn strata_validate_event(
    dsl_ptr: *const c_char,
    event_json_ptr: *const c_char,
) -> FfiResult {
    tracker_ffi_core::strata_validate_event(dsl_ptr, event_json_ptr)
}

#[no_mangle]
pub extern "C" fn strata_validate_workout_event(event_json_ptr: *const c_char) -> FfiResult {
    handle(|| {
        let event_json = cstr_to_str(event_json_ptr)?;
        let def = workout_pack::compiled_workout_definition();
        let normalized =
            tracker_engine::validate_event(&def, event_json).map_err(to_engine_error_string)?;
        Ok(normalized)
    })
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
pub extern "C" fn strata_compute_workout_tracker(
    events_json_ptr: *const c_char,
    query_json_ptr: *const c_char,
) -> FfiResult {
    handle(|| {
        let def = workout_pack::compiled_workout_definition();
        let events = parse_events(events_json_ptr)?;
        let query = parse_query(query_json_ptr)?;
        let output =
            tracker_engine::compute(&def, &events, query).map_err(to_engine_error_string)?;
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
    tracker_ffi_core::strata_simulate(dsl_ptr, base_events_ptr, hypotheticals_ptr, query_json_ptr)
}

#[no_mangle]
pub extern "C" fn strata_simulate_workout_tracker(
    base_events_ptr: *const c_char,
    hypotheticals_ptr: *const c_char,
    query_json_ptr: *const c_char,
) -> FfiResult {
    handle(|| {
        let def = workout_pack::compiled_workout_definition();
        let base = parse_events(base_events_ptr)?;
        let hypothetical = parse_events(hypotheticals_ptr)?;
        let query = parse_query(query_json_ptr)?;
        let output = tracker_engine::simulate(&def, &base, &hypothetical, query)
            .map_err(to_engine_error_string)?;
        Ok(output)
    })
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

#[no_mangle]
pub extern "C" fn strata_exercise_catalog() -> FfiResult {
    handle(|| Ok(catalog::catalog_json()))
}

#[no_mangle]
pub extern "C" fn strata_import_fitnotes(path_ptr: *const c_char) -> FfiResult {
    handle(|| {
        let path = cstr_to_str(path_ptr)?;
        let bundle = workout_pack::import::fitnotes::import_fitnotes(path).map_err(|err| {
            TrackerError::new_simple(
                ErrorCode::FileIoError,
                format!("fitnotes import failed: {err}"),
            )
            .to_json()
        })?;
        Ok(bundle)
    })
}

#[no_mangle]
pub extern "C" fn strata_validate_exercise(entry_json_ptr: *const c_char) -> FfiResult {
    handle(|| {
        let entry_json = cstr_to_str(entry_json_ptr)?;
        let def: catalog::ExerciseDefinition = parse_json(entry_json, "exercise definition")?;
        catalog::validate_exercise(&def).map_err(|err| {
            TrackerError::new_simple(
                ErrorCode::CatalogValidationFailed,
                format!("exercise validation failed: {err}"),
            )
            .to_json()
        })?;
        let clean = catalog::sanitize_exercise(&def);
        Ok(clean)
    })
}

// --- Time Policy FFI ---

#[no_mangle]
pub extern "C" fn strata_round_to_local_day(ts_ms: i64, offset_minutes: i32) -> i64 {
    tracker_analytics::round_to_local_day(ts_ms, offset_minutes)
}

#[no_mangle]
pub extern "C" fn strata_round_to_local_week(ts_ms: i64, offset_minutes: i32) -> i64 {
    tracker_analytics::round_to_local_week(ts_ms, offset_minutes)
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
        let events: Vec<serde_json::Value> = parse_json(events_json, "detect_pr events")?;

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
    let mode = workout_pack::LoggingMode::from_str(mode_str)
        .unwrap_or(workout_pack::LoggingMode::RepsWeight);

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

        let payload: workout_pack::SetPayload = parse_json(payload_json, "set payload")?;
        let events: Vec<serde_json::Value> = parse_json(events_json, "set events")?;

        // Parse existing event if provided (for updates)
        let existing_event: Option<workout_pack::ExistingEventInfo> =
            if existing_event_json_ptr.is_null() {
                None
            } else {
                let existing_json = cstr_to_str(existing_event_json_ptr)?;
                if existing_json.is_empty() || existing_json == "null" {
                    None
                } else {
                    Some(parse_json(existing_json, "existing set event")?)
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
        let events = parse_analytics_events_with_derives(events_json_ptr)?;

        let catalog_json = cstr_to_str(catalog_json_ptr)?;
        let entries: Vec<workout_pack::ExerciseDefinition> =
            parse_json(catalog_json, "analytics catalog")?;

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
        let events = parse_analytics_events_with_derives(events_json_ptr)?;

        let catalog_json = cstr_to_str(catalog_json_ptr)?;
        let entries: Vec<workout_pack::ExerciseDefinition> =
            parse_json(catalog_json, "workout analytics catalog")?;

        let query_json = cstr_to_str(query_json_ptr)?;
        let query: workout_pack::analytics::WorkoutAnalyticsQuery =
            parse_metric_query(query_json, "workouts")?;

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
        let events = parse_analytics_events_with_derives(events_json_ptr)?;

        let catalog_json = cstr_to_str(catalog_json_ptr)?;
        let entries: Vec<workout_pack::ExerciseDefinition> =
            parse_json(catalog_json, "breakdown analytics catalog")?;

        let query_json = cstr_to_str(query_json_ptr)?;
        let query: workout_pack::analytics::BreakdownQuery =
            parse_metric_query(query_json, "breakdown")?;

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
        let events = parse_analytics_events_with_derives(events_json_ptr)?;

        let catalog_json = cstr_to_str(catalog_json_ptr)?;
        let entries: Vec<workout_pack::ExerciseDefinition> =
            parse_json(catalog_json, "exercise analytics catalog")?;

        let query_json = cstr_to_str(query_json_ptr)?;
        let query: workout_pack::analytics::ExerciseSeriesQuery =
            parse_metric_query(query_json, "exercise_series")?;

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
        let events = parse_analytics_events_with_derives(events_json_ptr)?;

        let catalog_json = cstr_to_str(catalog_json_ptr)?;
        let entries: Vec<workout_pack::ExerciseDefinition> =
            parse_json(catalog_json, "home-day analytics catalog")?;

        let query_json = cstr_to_str(query_json_ptr)?;
        let query: workout_pack::analytics::HomeDayQuery =
            parse_json(query_json, "home-day analytics query")?;

        let map = build_catalog_map(entries);

        let response = workout_pack::analytics::compute_home_day_analytics(
            &events,
            offset_minutes,
            &map,
            &query,
        );
        Ok(response)
    })
}

#[no_mangle]
pub extern "C" fn strata_compute_home_days_analytics(
    events_json_ptr: *const c_char,
    offset_minutes: i32,
    catalog_json_ptr: *const c_char,
    query_json_ptr: *const c_char,
) -> FfiResult {
    handle(|| {
        let events = parse_analytics_events_with_derives(events_json_ptr)?;

        let catalog_json = cstr_to_str(catalog_json_ptr)?;
        let entries: Vec<workout_pack::ExerciseDefinition> =
            parse_json(catalog_json, "home-days analytics catalog")?;

        let query_json = cstr_to_str(query_json_ptr)?;
        let query: workout_pack::analytics::HomeDaysQuery =
            parse_json(query_json, "home-days analytics query")?;

        let map = build_catalog_map(entries);

        let response = workout_pack::analytics::compute_home_days_analytics(
            &events,
            offset_minutes,
            &map,
            &query,
        );
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
        let events = parse_analytics_events_with_derives(events_json_ptr)?;

        let catalog_json = cstr_to_str(catalog_json_ptr)?;
        let entries: Vec<workout_pack::ExerciseDefinition> =
            parse_json(catalog_json, "calendar analytics catalog")?;

        let query_json = cstr_to_str(query_json_ptr)?;
        let query: workout_pack::analytics::CalendarMonthQuery =
            parse_json(query_json, "calendar analytics query")?;

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

#[no_mangle]
pub extern "C" fn strata_workout_analytics_capabilities() -> FfiResult {
    handle(|| Ok(workout_pack::analytics::analytics_capabilities()))
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

fn parse_metric_query<T: DeserializeOwned>(query_json: &str, view_name: &str) -> Result<T, String> {
    let query_value: serde_json::Value = parse_json(query_json, "metric query")?;
    if let Some(metric) = query_value.get("metric").and_then(|value| value.as_str()) {
        let allowed = workout_pack::compiled_workout_view_metrics()
            .remove(view_name)
            .unwrap_or_default();
        if !allowed.iter().any(|candidate| candidate == metric) {
            return Err(TrackerError::new_simple(
                ErrorCode::MetricEvaluationFailed,
                format!(
                    "unknown metric '{}', expected one of [{}]",
                    metric,
                    allowed.join(", ")
                ),
            )
            .to_json());
        }
    }
    serde_json::from_value(query_value).map_err(|err| {
        TrackerError::new_simple(
            ErrorCode::DeserializationFailed,
            format!("failed to deserialize metric query: {err}"),
        )
        .to_json()
    })
}

fn parse_analytics_events_with_derives(
    events_json_ptr: *const c_char,
) -> Result<Vec<workout_pack::analytics::AnalyticsInputEvent>, String> {
    let events_json = cstr_to_str(events_json_ptr)?;
    let events: Vec<workout_pack::analytics::AnalyticsInputEvent> =
        parse_json(events_json, "analytics events")?;
    let def = workout_pack::compiled_workout_definition();
    events
        .into_iter()
        .enumerate()
        .map(|(index, event)| {
            let mut normalized = NormalizedEvent::new(
                EventId::new(format!("analytics-{index}-{}", event.ts)),
                def.tracker_id().clone(),
                Timestamp::new(event.ts),
                event.payload,
                serde_json::json!({}),
            );
            tracker_engine::derive_event(&def, &mut normalized).map_err(to_engine_error_string)?;
            Ok(workout_pack::analytics::AnalyticsInputEvent {
                ts: event.ts,
                payload: normalized.payload().clone(),
            })
        })
        .collect()
}

fn parse_json<T: DeserializeOwned>(input: &str, context: &str) -> Result<T, String> {
    serde_json::from_str(input).map_err(|err| {
        TrackerError::new_simple(
            ErrorCode::DeserializationFailed,
            format!("failed to parse {context}: {err}"),
        )
        .to_json()
    })
}

#[cfg(test)]
mod tests {
    use super::parse_metric_query;

    #[test]
    fn parse_metric_query_accepts_canonical_metric_keys() {
        let query = r#"{
            "metric":"total_volume",
            "group_by":"week",
            "filter":{"kind":"exercise","value":"Bench Press"}
        }"#;

        let parsed: workout_pack::analytics::WorkoutAnalyticsQuery =
            parse_metric_query(query, "workouts").expect("canonical workout metric should parse");
        assert_eq!(parsed.metric.as_key(), "total_volume");
    }

    #[test]
    fn parse_metric_query_rejects_legacy_metric_keys() {
        let query = r#"{
            "metric":"volume",
            "group_by":"week",
            "filter":{"kind":"exercise","value":"Bench Press"}
        }"#;

        let error =
            parse_metric_query::<workout_pack::analytics::WorkoutAnalyticsQuery>(query, "workouts")
                .expect_err("legacy workout metric should be rejected");
        assert!(error.contains("unknown metric 'volume'"));
        assert!(error.contains("total_volume"));
    }
}
