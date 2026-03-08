use std::collections::{HashMap, HashSet};
use std::sync::OnceLock;
use tracker_analytics::{
    bucket_ts, round_to_local_day, round_to_local_month, round_to_local_week, Distribution,
    Granularity,
};
use tracker_engine::{compute_metric_by_name, MetricComputeOptions, MetricFilter, MetricFilterOp};
use tracker_ir::{EventId, GroupByDimension, NormalizedEvent, Timestamp};

use crate::catalog_key::normalize_catalog_key;
mod composite_summary;
mod event_metrics;
mod types;

pub use types::*;

use event_metrics::{
    extract_event_metrics, modality_label, resolve_catalog_entry, EventMetricValues,
};

const MILLIS_PER_DAY: i64 = 86_400_000;

fn load_view_metric_keys() -> HashMap<String, Vec<String>> {
    crate::compiled_workout_view_metrics().into_iter().collect()
}

fn load_view_metric_config() -> serde_json::Map<String, serde_json::Value> {
    crate::compiled_workout_view_metric_config()
        .as_object()
        .cloned()
        .unwrap_or_default()
}

fn load_view_default_metrics() -> HashMap<String, String> {
    crate::compiled_workout_view_default_metrics()
        .into_iter()
        .collect()
}

fn metric_name_for(view_name: &str, metric_key: &str) -> Option<String> {
    static VIEW_METRIC_KEYS: OnceLock<HashMap<String, Vec<String>>> = OnceLock::new();
    let keys = VIEW_METRIC_KEYS
        .get_or_init(load_view_metric_keys)
        .get(view_name)?;
    if keys.iter().any(|metric| metric == metric_key) {
        Some(metric_key.to_string())
    } else {
        None
    }
}

pub fn analytics_capabilities() -> serde_json::Value {
    let metrics = load_view_metric_keys();
    let configs = load_view_metric_config();
    let defaults = load_view_default_metrics();
    let mut views = serde_json::Map::new();
    for (view_name, mut metric_names) in metrics {
        metric_names.sort();
        let metric_config = configs
            .get(&view_name)
            .cloned()
            .unwrap_or_else(|| serde_json::json!({}));
        let default_metric = defaults
            .get(&view_name)
            .cloned()
            .or_else(|| metric_names.first().cloned())
            .unwrap_or_default();
        views.insert(
            view_name,
            serde_json::json!({
                "metrics": metric_names,
                "default_metric": default_metric,
                "metric_config": metric_config,
            }),
        );
    }
    serde_json::json!({ "views": views })
}

pub fn compute_summary(
    events: &[AnalyticsInputEvent],
    offset_minutes: i32,
    catalog_map: &HashMap<String, CatalogEntryLite>, // Exercise Name -> Catalog meta
) -> AnalyticsSummary {
    composite_summary::compute_summary(events, offset_minutes, catalog_map)
}

fn muscle_title(label: &str) -> String {
    label
        .split('_')
        .filter(|segment| !segment.is_empty())
        .map(|segment| {
            let mut chars = segment.chars();
            match chars.next() {
                Some(first) => format!("{}{}", first.to_uppercase(), chars.as_str()),
                None => String::new(),
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

fn format_trimmed_number(value: f32, precision: usize) -> String {
    let rounded = format!("{value:.precision$}");
    rounded
        .trim_end_matches('0')
        .trim_end_matches('.')
        .to_string()
}

fn format_duration_minutes(seconds: f32) -> String {
    let minutes = (seconds / 60.0).max(0.0);
    if minutes >= 60.0 {
        let hours = (minutes / 60.0).floor();
        let remainder = minutes - hours * 60.0;
        if remainder <= 0.0 {
            return format!("{}h", format_trimmed_number(hours, 0));
        }
        return format!(
            "{}h {}m",
            format_trimmed_number(hours, 0),
            format_trimmed_number(remainder, 1)
        );
    }
    format!("{} min", format_trimmed_number(minutes, 1))
}

fn describe_home_set(metrics: EventMetricValues) -> String {
    if metrics.weight > 0.0 && metrics.reps > 0 {
        return format!(
            "{} kg × {} reps",
            format_trimmed_number(metrics.weight, 2),
            metrics.reps
        );
    }
    if metrics.distance > 0.0 && metrics.weight > 0.0 {
        return format!(
            "{} m × {} kg",
            format_trimmed_number(metrics.distance, 2),
            format_trimmed_number(metrics.weight, 2)
        );
    }
    if metrics.distance > 0.0 && metrics.active_duration > 0.0 {
        return format!(
            "{} m / {}",
            format_trimmed_number(metrics.distance, 2),
            format_duration_minutes(metrics.active_duration)
        );
    }
    if metrics.reps > 0 {
        return format!("{} reps", metrics.reps);
    }
    if metrics.distance > 0.0 {
        return format!("{} m", format_trimmed_number(metrics.distance, 2));
    }
    if metrics.active_duration > 0.0 {
        return format_duration_minutes(metrics.active_duration);
    }
    "Logged set".to_string()
}

fn condense_set_descriptions(descriptions: Vec<String>) -> Vec<HomeSetChunk> {
    let mut chunks: Vec<HomeSetChunk> = Vec::new();
    for description in descriptions {
        if let Some(last) = chunks.last_mut() {
            if last.description == description {
                last.count += 1;
                continue;
            }
        }
        chunks.push(HomeSetChunk {
            description,
            count: 1,
        });
    }
    chunks
}

pub fn compute_home_day_analytics(
    events: &[AnalyticsInputEvent],
    _offset_minutes: i32,
    catalog_map: &HashMap<String, CatalogEntryLite>,
    query: &HomeDayQuery,
) -> HomeDayResponse {
    let day_start = query.day_bucket;
    let day_end = day_start + MILLIS_PER_DAY;

    let mut day_events: Vec<_> = events
        .iter()
        .filter(|e| e.ts >= day_start && e.ts < day_end)
        .collect();

    day_events.sort_by_key(|event| event.ts);

    #[derive(Default)]
    struct SectionAccumulator {
        first_ts: i64,
        exercise_order: Vec<String>,
        exercise_sets: HashMap<String, Vec<String>>,
    }

    let mut sections_map: HashMap<String, SectionAccumulator> = HashMap::new();
    let mut volume_by_group: HashMap<String, f32> = HashMap::new();

    for event in day_events {
        let exercise_name = event
            .payload
            .get("exercise")
            .and_then(|value| value.as_str())
            .unwrap_or("Exercise");
        let metrics = extract_event_metrics(event, exercise_name, catalog_map);
        let set_description = describe_home_set(metrics);

        let group_key = resolve_catalog_entry(event, exercise_name, catalog_map)
            .map(|entry| normalize_catalog_key(&entry.muscle))
            .filter(|key| !key.is_empty())
            .unwrap_or_else(|| "untracked".to_string());

        let section = sections_map
            .entry(group_key.clone())
            .or_insert_with(|| SectionAccumulator {
                first_ts: event.ts,
                ..SectionAccumulator::default()
            });

        if event.ts < section.first_ts {
            section.first_ts = event.ts;
        }

        if !section.exercise_sets.contains_key(exercise_name) {
            section.exercise_order.push(exercise_name.to_string());
            section
                .exercise_sets
                .insert(exercise_name.to_string(), Vec::new());
        }

        if let Some(sets) = section.exercise_sets.get_mut(exercise_name) {
            sets.push(set_description);
        }

        if metrics.volume > 0.0 {
            *volume_by_group.entry(group_key).or_insert(0.0) += metrics.volume;
        }
    }

    let mut sections_with_ts: Vec<(i64, HomeSectionSummary)> = sections_map
        .into_iter()
        .map(|(key, section)| {
            let exercises = section
                .exercise_order
                .into_iter()
                .map(|exercise| {
                    let descriptions = section
                        .exercise_sets
                        .get(&exercise)
                        .cloned()
                        .unwrap_or_default();
                    let total_sets = descriptions.len() as i32;
                    HomeExerciseSummary {
                        exercise,
                        set_chunks: condense_set_descriptions(descriptions),
                        total_sets,
                    }
                })
                .collect::<Vec<_>>();
            (
                section.first_ts,
                HomeSectionSummary {
                    key: key.clone(),
                    label: muscle_title(&key).to_uppercase(),
                    exercises,
                },
            )
        })
        .collect();

    sections_with_ts.sort_by_key(|(first_ts, _)| *first_ts);
    let sections = sections_with_ts
        .into_iter()
        .map(|(_, section)| section)
        .collect::<Vec<_>>();

    let total_sets: i32 = sections
        .iter()
        .map(|section| {
            section
                .exercises
                .iter()
                .map(|exercise| exercise.total_sets)
                .sum::<i32>()
        })
        .sum();
    let total_exercises: i32 = sections
        .iter()
        .map(|section| section.exercises.len() as i32)
        .sum();
    let average_sets_per_exercise = if total_exercises > 0 {
        ((total_sets as f32 / total_exercises as f32).round()) as i32
    } else {
        0
    };

    let muscle_split = Distribution::calculate(
        sections
            .iter()
            .map(|section| (section.key.clone(), section.exercises.len() as f32))
            .collect(),
    );

    let volume_split = Distribution::calculate(volume_by_group.into_iter().collect());

    HomeDayResponse {
        day_bucket: query.day_bucket,
        empty_state: sections.is_empty(),
        totals: HomeDayTotals {
            total_sets,
            total_exercises,
            average_sets_per_exercise,
        },
        sections,
        muscle_split,
        volume_split,
    }
}

pub fn compute_home_days_analytics(
    events: &[AnalyticsInputEvent],
    offset_minutes: i32,
    catalog_map: &HashMap<String, CatalogEntryLite>,
    query: &HomeDaysQuery,
) -> HomeDaysResponse {
    let mut seen = HashSet::new();
    let mut days = Vec::new();
    for day_bucket in &query.day_buckets {
        if !seen.insert(*day_bucket) {
            continue;
        }
        days.push(compute_home_day_analytics(
            events,
            offset_minutes,
            catalog_map,
            &HomeDayQuery {
                day_bucket: *day_bucket,
            },
        ));
    }
    HomeDaysResponse { days }
}

fn current_timestamp_millis() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or(0)
}

fn days_in_month_from_bucket(month_bucket: i64, offset_minutes: i32) -> i32 {
    use chrono::{Datelike, Duration, TimeZone, Utc};

    let local_proxy = Utc
        .timestamp_millis_opt(month_bucket)
        .single()
        .unwrap_or_else(|| Utc::now())
        + Duration::minutes(offset_minutes as i64);

    let year = local_proxy.year();
    let month = local_proxy.month();

    let next_month = if month == 12 { 1 } else { month + 1 };
    let next_year = if month == 12 { year + 1 } else { year };
    let next_start = Utc
        .with_ymd_and_hms(next_year, next_month, 1, 0, 0, 0)
        .single()
        .unwrap_or_else(|| Utc::now());
    (next_start - Duration::days(1)).day() as i32
}

pub fn compute_calendar_month_analytics(
    events: &[AnalyticsInputEvent],
    offset_minutes: i32,
    catalog_map: &HashMap<String, CatalogEntryLite>,
    query: &CalendarMonthQuery,
) -> CalendarMonthResponse {
    let now_ts = current_timestamp_millis();
    let current_month_bucket = round_to_local_month(now_ts, offset_minutes);
    let is_future_month = query.month_bucket > current_month_bucket;

    let days_in_month = days_in_month_from_bucket(query.month_bucket, offset_minutes);
    let elapsed_days = if query.month_bucket == current_month_bucket {
        use chrono::{Datelike, Duration, TimeZone, Utc};
        let local_now = Utc
            .timestamp_millis_opt(now_ts)
            .single()
            .unwrap_or_else(|| Utc::now())
            + Duration::minutes(offset_minutes as i64);
        local_now.day() as i32
    } else {
        days_in_month
    };

    let mut session_days: HashSet<i64> = HashSet::new();
    let mut day_groups: HashMap<i64, HashSet<String>> = HashMap::new();
    let mut muscle_set_counts: HashMap<String, i32> = HashMap::new();

    for event in events {
        let month_bucket = bucket_ts(event.ts, Granularity::Month, offset_minutes);
        if month_bucket != query.month_bucket {
            continue;
        }

        let day_bucket = round_to_local_day(event.ts, offset_minutes);
        session_days.insert(day_bucket);

        let exercise_name = event
            .payload
            .get("exercise")
            .and_then(|value| value.as_str())
            .unwrap_or("Unknown");
        let maybe_group = resolve_catalog_entry(event, exercise_name, catalog_map)
            .map(|entry| normalize_catalog_key(&entry.muscle))
            .filter(|group| !group.is_empty());

        let Some(group) = maybe_group else {
            continue;
        };

        day_groups
            .entry(day_bucket)
            .or_insert_with(HashSet::new)
            .insert(group.clone());
        *muscle_set_counts.entry(group).or_insert(0) += 1;
    }

    let mut muscle_session_counts: HashMap<String, i32> = HashMap::new();
    for groups in day_groups.values() {
        for group in groups {
            *muscle_session_counts.entry(group.clone()).or_insert(0) += 1;
        }
    }

    let mut all_muscles: Vec<CalendarMuscleCount> = muscle_session_counts
        .into_iter()
        .map(|(group, count)| CalendarMuscleCount { group, count })
        .collect();
    all_muscles.sort_by(|a, b| b.count.cmp(&a.count));
    let top_muscles = all_muscles.iter().take(3).cloned().collect::<Vec<_>>();

    let pie_data = Distribution::calculate(
        muscle_set_counts
            .iter()
            .map(|(group, count)| (group.clone(), *count as f32))
            .collect(),
    );

    let sessions = session_days.len() as i32;
    let attendance_percent = if elapsed_days > 0 {
        (sessions as f32 / elapsed_days as f32) * 100.0
    } else {
        0.0
    };

    CalendarMonthResponse {
        month_bucket: query.month_bucket,
        sessions,
        attendance_percent,
        is_future_month,
        top_muscles,
        all_muscles,
        pie_data,
    }
}

fn events_for_engine(
    events: &[AnalyticsInputEvent],
    offset_minutes: i32,
    catalog_map: &HashMap<String, CatalogEntryLite>,
) -> Vec<NormalizedEvent> {
    let def = crate::compiled_workout_definition();
    events
        .iter()
        .enumerate()
        .map(|(index, event)| {
            let mut payload = event.payload.clone();
            if let Some(payload_obj) = payload.as_object_mut() {
                if payload_obj
                    .get("day_bucket")
                    .and_then(serde_json::Value::as_i64)
                    .is_none()
                {
                    payload_obj.insert(
                        "day_bucket".to_string(),
                        serde_json::json!(round_to_local_day(event.ts, offset_minutes)),
                    );
                }
                if payload_obj
                    .get("week_bucket")
                    .and_then(serde_json::Value::as_i64)
                    .is_none()
                {
                    payload_obj.insert(
                        "week_bucket".to_string(),
                        serde_json::json!(round_to_local_week(event.ts, offset_minutes)),
                    );
                }
                if payload_obj
                    .get("month_bucket")
                    .and_then(serde_json::Value::as_i64)
                    .is_none()
                {
                    payload_obj.insert(
                        "month_bucket".to_string(),
                        serde_json::json!(round_to_local_month(event.ts, offset_minutes)),
                    );
                }

                let exercise_name = payload_obj
                    .get("exercise")
                    .and_then(serde_json::Value::as_str)
                    .unwrap_or("Unknown");
                if let Some(entry) = resolve_catalog_entry(event, exercise_name, catalog_map) {
                    payload_obj.insert("muscle".to_string(), serde_json::json!(entry.muscle));
                    payload_obj.insert(
                        "category".to_string(),
                        serde_json::json!(modality_label(&entry.modality)),
                    );
                } else {
                    if payload_obj
                        .get("muscle")
                        .and_then(serde_json::Value::as_str)
                        .is_none()
                    {
                        payload_obj.insert("muscle".to_string(), serde_json::json!("Unmapped"));
                    }
                    if payload_obj
                        .get("category")
                        .and_then(serde_json::Value::as_str)
                        .is_none()
                    {
                        let fallback_category = payload_obj
                            .get("modality")
                            .and_then(serde_json::Value::as_str)
                            .map(|value| value.to_lowercase())
                            .unwrap_or_else(|| "unmapped".to_string());
                        payload_obj
                            .insert("category".to_string(), serde_json::json!(fallback_category));
                    }
                }
            }
            NormalizedEvent::new(
                EventId::new(format!("analytics-{index}-{}", event.ts)),
                def.tracker_id().clone(),
                Timestamp::new(event.ts),
                payload,
                serde_json::json!({}),
            )
        })
        .collect()
}

fn grouped_metric_values(value: serde_json::Value) -> HashMap<String, f32> {
    match value {
        serde_json::Value::Object(map) => map
            .into_iter()
            .filter_map(|(key, value)| value.as_f64().map(|number| (key, number as f32)))
            .collect(),
        serde_json::Value::Number(number) => number
            .as_f64()
            .map(|value| {
                [("__total__".to_string(), value as f32)]
                    .into_iter()
                    .collect()
            })
            .unwrap_or_default(),
        _ => HashMap::new(),
    }
}

fn grouped_metric_counts(value: serde_json::Value) -> HashMap<String, i32> {
    match value {
        serde_json::Value::Object(map) => map
            .into_iter()
            .filter_map(|(key, value)| value.as_f64().map(|number| (key, number as i32)))
            .collect(),
        serde_json::Value::Number(number) => number
            .as_f64()
            .map(|value| {
                [("__total__".to_string(), value as i32)]
                    .into_iter()
                    .collect()
            })
            .unwrap_or_default(),
        _ => HashMap::new(),
    }
}

fn workout_group_field(group_by: &WorkoutGroupBy) -> &'static str {
    match group_by {
        WorkoutGroupBy::Workout => "day_bucket",
        WorkoutGroupBy::Week => "week_bucket",
        WorkoutGroupBy::Month => "month_bucket",
    }
}

fn exercise_group_field(group_by: &ExerciseGroupBy) -> &'static str {
    match group_by {
        ExerciseGroupBy::Workout => "day_bucket",
        ExerciseGroupBy::Week => "week_bucket",
        ExerciseGroupBy::Month => "month_bucket",
    }
}

fn workout_filters(filter: &WorkoutAnalyticsFilter) -> Vec<MetricFilter> {
    match filter.kind {
        WorkoutFilterKind::None => vec![],
        WorkoutFilterKind::Exercise => filter
            .value
            .as_ref()
            .map(|value| MetricFilter {
                field: "exercise".to_string(),
                op: MetricFilterOp::Eq,
                value: serde_json::json!(value),
            })
            .into_iter()
            .collect(),
        WorkoutFilterKind::Muscle => filter
            .value
            .as_ref()
            .map(|value| MetricFilter {
                field: "muscle".to_string(),
                op: MetricFilterOp::Eq,
                value: serde_json::json!(value),
            })
            .into_iter()
            .collect(),
    }
}

fn exercise_filters(query: &ExerciseSeriesQuery) -> Vec<MetricFilter> {
    let mut filters = vec![MetricFilter {
        field: "exercise".to_string(),
        op: MetricFilterOp::Eq,
        value: serde_json::json!(query.exercise),
    }];
    if matches!(query.metric, ExerciseMetric::MaxWeightAtReps) {
        if let Some(rm_reps) = query.rm_reps.filter(|reps| *reps > 0) {
            filters.push(MetricFilter {
                field: "reps".to_string(),
                op: MetricFilterOp::Eq,
                value: serde_json::json!(rm_reps),
            });
        }
    }
    filters
}

fn as_total_number(value: serde_json::Value) -> f32 {
    value.as_f64().unwrap_or(0.0) as f32
}

fn parse_bucket_key(key: &str) -> Option<i64> {
    if let Ok(value) = key.parse::<i64>() {
        return Some(value);
    }
    key.parse::<f64>()
        .ok()
        .filter(|value| value.is_finite())
        .map(|value| value.round() as i64)
}

fn finalize_series(
    metric: WorkoutMetric,
    group_by: WorkoutGroupBy,
    buckets: HashMap<i64, (f32, i32)>,
) -> WorkoutMetricsSeries {
    let mut points: Vec<WorkoutMetricPoint> = buckets
        .into_iter()
        .map(|(bucket, (value, count))| WorkoutMetricPoint {
            label: String::new(),
            value,
            count,
            bucket,
        })
        .collect();
    points.sort_by_key(|point| point.bucket);
    WorkoutMetricsSeries {
        metric,
        group_by,
        points,
    }
}

pub fn compute_workout_metrics(
    events: &[AnalyticsInputEvent],
    offset_minutes: i32,
    catalog_map: &HashMap<String, CatalogEntryLite>,
    query: &WorkoutAnalyticsQuery,
) -> WorkoutMetricsSeries {
    let def = crate::compiled_workout_definition();
    let engine_events = events_for_engine(events, offset_minutes, catalog_map);
    let Some(metric_name) = metric_name_for("workouts", query.metric.as_key()) else {
        return finalize_series(query.metric.clone(), query.group_by.clone(), HashMap::new());
    };
    let group_field = workout_group_field(&query.group_by).to_string();
    let filters = workout_filters(&query.filter);

    let values = compute_metric_by_name(
        &def,
        &engine_events,
        &metric_name,
        MetricComputeOptions {
            group_by: Some(vec![GroupByDimension::Field(group_field.clone())]),
            time_window: None,
            filters: filters.clone(),
        },
    )
    .unwrap_or(serde_json::Value::Object(serde_json::Map::new()));

    let counts = compute_metric_by_name(
        &def,
        &engine_events,
        "total_sets",
        MetricComputeOptions {
            group_by: Some(vec![GroupByDimension::Field(group_field)]),
            time_window: None,
            filters,
        },
    )
    .unwrap_or(serde_json::Value::Object(serde_json::Map::new()));

    let value_map = grouped_metric_values(values);
    let count_map = grouped_metric_counts(counts);
    let mut buckets: HashMap<i64, (f32, i32)> = HashMap::new();
    for (key, value) in value_map {
        if value <= 0.0 {
            continue;
        }
        let Some(bucket) = parse_bucket_key(&key) else {
            continue;
        };
        let count = *count_map.get(&key).unwrap_or(&0);
        buckets.insert(bucket, (value, count));
    }

    finalize_series(query.metric.clone(), query.group_by.clone(), buckets)
}

pub fn compute_breakdown(
    events: &[AnalyticsInputEvent],
    offset_minutes: i32,
    catalog_map: &HashMap<String, CatalogEntryLite>,
    query: &BreakdownQuery,
) -> BreakdownResponse {
    let def = crate::compiled_workout_definition();
    let engine_events = events_for_engine(events, offset_minutes, catalog_map);
    let Some(metric_name) = metric_name_for("breakdown", query.metric.as_key()) else {
        return BreakdownResponse {
            metric: query.metric.clone(),
            group_by: query.group_by.clone(),
            items: Vec::new(),
            totals: BreakdownTotals {
                workouts: 0,
                sets: 0,
                reps: 0,
                volume: 0.0,
                distance: 0.0,
                active_duration: 0.0,
                load_distance: 0.0,
            },
            qa_unmapped_events: 0,
        };
    };
    let group_field = match query.group_by {
        BreakdownGroupBy::Muscle => "muscle",
        BreakdownGroupBy::Exercise => "exercise",
        BreakdownGroupBy::Category => "category",
    };

    let grouped = compute_metric_by_name(
        &def,
        &engine_events,
        &metric_name,
        MetricComputeOptions {
            group_by: Some(vec![GroupByDimension::Field(group_field.to_string())]),
            time_window: None,
            filters: vec![],
        },
    )
    .unwrap_or(serde_json::Value::Object(serde_json::Map::new()));
    let buckets = grouped_metric_values(grouped)
        .into_iter()
        .filter(|(_, value)| *value > 0.0)
        .collect::<Vec<_>>();
    let items = Distribution::calculate(buckets);

    let mut workouts: HashSet<i64> = HashSet::new();
    let mut qa_unmapped_events = 0;
    for event in events {
        workouts.insert(round_to_local_day(event.ts, offset_minutes));
        let exercise_name = event
            .payload
            .get("exercise")
            .and_then(|v| v.as_str())
            .unwrap_or("Unknown");
        if resolve_catalog_entry(event, exercise_name, catalog_map).is_none() {
            qa_unmapped_events += 1;
        }
    }

    let totals_sets = as_total_number(
        compute_metric_by_name(
            &def,
            &engine_events,
            "total_sets",
            MetricComputeOptions::default(),
        )
        .unwrap_or(serde_json::json!(0.0)),
    ) as i32;
    let totals_reps = as_total_number(
        compute_metric_by_name(
            &def,
            &engine_events,
            "total_reps",
            MetricComputeOptions::default(),
        )
        .unwrap_or(serde_json::json!(0.0)),
    ) as i32;
    let totals_volume = as_total_number(
        compute_metric_by_name(
            &def,
            &engine_events,
            "total_volume",
            MetricComputeOptions::default(),
        )
        .unwrap_or(serde_json::json!(0.0)),
    );
    let totals_distance = as_total_number(
        compute_metric_by_name(
            &def,
            &engine_events,
            "total_distance",
            MetricComputeOptions::default(),
        )
        .unwrap_or(serde_json::json!(0.0)),
    );
    let totals_active_duration = as_total_number(
        compute_metric_by_name(
            &def,
            &engine_events,
            "total_active_duration",
            MetricComputeOptions::default(),
        )
        .unwrap_or(serde_json::json!(0.0)),
    );
    let totals_load_distance = as_total_number(
        compute_metric_by_name(
            &def,
            &engine_events,
            "total_load_distance",
            MetricComputeOptions::default(),
        )
        .unwrap_or(serde_json::json!(0.0)),
    );

    BreakdownResponse {
        metric: query.metric.clone(),
        group_by: query.group_by.clone(),
        items,
        totals: BreakdownTotals {
            workouts: workouts.len() as i32,
            sets: totals_sets,
            reps: totals_reps,
            volume: totals_volume,
            distance: totals_distance,
            active_duration: totals_active_duration,
            load_distance: totals_load_distance,
        },
        qa_unmapped_events,
    }
}

pub fn compute_exercise_series(
    events: &[AnalyticsInputEvent],
    offset_minutes: i32,
    catalog_map: &HashMap<String, CatalogEntryLite>,
    query: &ExerciseSeriesQuery,
) -> ExerciseSeries {
    let def = crate::compiled_workout_definition();
    let engine_events = events_for_engine(events, offset_minutes, catalog_map);
    let Some(metric_name) = metric_name_for("exercise_series", query.metric.as_key()) else {
        return ExerciseSeries {
            exercise: query.exercise.clone(),
            metric: query.metric.clone(),
            group_by: query.group_by.clone(),
            points: Vec::new(),
        };
    };
    let group_field = exercise_group_field(&query.group_by).to_string();
    let metric_filters = exercise_filters(query);
    let count_filters = vec![MetricFilter {
        field: "exercise".to_string(),
        op: MetricFilterOp::Eq,
        value: serde_json::json!(query.exercise),
    }];

    let values = compute_metric_by_name(
        &def,
        &engine_events,
        &metric_name,
        MetricComputeOptions {
            group_by: Some(vec![GroupByDimension::Field(group_field.clone())]),
            time_window: None,
            filters: metric_filters,
        },
    )
    .unwrap_or(serde_json::Value::Object(serde_json::Map::new()));

    let counts = compute_metric_by_name(
        &def,
        &engine_events,
        "total_sets",
        MetricComputeOptions {
            group_by: Some(vec![GroupByDimension::Field(group_field)]),
            time_window: None,
            filters: count_filters,
        },
    )
    .unwrap_or(serde_json::Value::Object(serde_json::Map::new()));

    let value_map = grouped_metric_values(values);
    let count_map = grouped_metric_counts(counts);
    let mut points = value_map
        .into_iter()
        .filter_map(|(key, value)| {
            if value <= 0.0 {
                return None;
            }
            let bucket = parse_bucket_key(&key)?;
            let count = *count_map.get(&key).unwrap_or(&0);
            Some(ExerciseSeriesPoint {
                label: String::new(),
                value,
                count,
                bucket,
            })
        })
        .collect::<Vec<_>>();
    points.sort_by_key(|point| point.bucket);

    ExerciseSeries {
        exercise: query.exercise.clone(),
        metric: query.metric.clone(),
        group_by: query.group_by.clone(),
        points,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::catalog::{LoggingMode, Modality};
    use serde_json::json;
    use std::collections::HashMap;
    use std::time::Instant;

    fn make_event(ts: i64, exercise: &str, reps: i32, weight: f32) -> AnalyticsInputEvent {
        AnalyticsInputEvent {
            ts,
            payload: json!({
                "exercise": exercise,
                "reps": reps,
                "weight": weight,
            }),
        }
    }

    fn make_payload_event(ts: i64, payload: serde_json::Value) -> AnalyticsInputEvent {
        AnalyticsInputEvent { ts, payload }
    }

    fn catalog_entry(
        muscle: &str,
        logging_mode: LoggingMode,
        modality: Modality,
    ) -> CatalogEntryLite {
        CatalogEntryLite {
            muscle: muscle.to_string(),
            logging_mode,
            modality,
        }
    }

    fn strength_entry(muscle: &str) -> CatalogEntryLite {
        catalog_entry(muscle, LoggingMode::RepsWeight, Modality::Strength)
    }

    #[test]
    fn workout_metrics_groups_by_week_and_applies_muscle_filter() {
        let base = 1_704_067_200_000; // 2024-01-01 UTC
        let events = vec![
            make_event(base, "Barbell Squat", 5, 100.0), // 500
            make_event(base + 86_400_000, "Barbell Row", 8, 60.0), // 480
            make_event(base + 8 * 86_400_000, "Barbell Squat", 3, 120.0), // 360
        ];

        let mut catalog = HashMap::new();
        catalog.insert("Barbell Squat".into(), strength_entry("legs"));
        catalog.insert("barbell_squat".into(), strength_entry("legs"));
        catalog.insert("Barbell Row".into(), strength_entry("back"));
        catalog.insert("barbell_row".into(), strength_entry("back"));

        let all_query = WorkoutAnalyticsQuery {
            metric: WorkoutMetric::TotalVolume,
            group_by: WorkoutGroupBy::Week,
            filter: WorkoutAnalyticsFilter {
                kind: WorkoutFilterKind::None,
                value: None,
            },
        };
        let all_series = compute_workout_metrics(&events, 0, &catalog, &all_query);
        assert_eq!(all_series.points.len(), 2);
        assert!((all_series.points[0].value - 980.0).abs() < 0.001);
        assert!((all_series.points[1].value - 360.0).abs() < 0.001);

        let legs_query = WorkoutAnalyticsQuery {
            metric: WorkoutMetric::TotalVolume,
            group_by: WorkoutGroupBy::Week,
            filter: WorkoutAnalyticsFilter {
                kind: WorkoutFilterKind::Muscle,
                value: Some("legs".to_string()),
            },
        };
        let legs_series = compute_workout_metrics(&events, 0, &catalog, &legs_query);
        assert_eq!(legs_series.points.len(), 2);
        assert!((legs_series.points[0].value - 500.0).abs() < 0.001);
        assert!((legs_series.points[1].value - 360.0).abs() < 0.001);
    }

    #[test]
    fn breakdown_resolves_normalized_catalog_keys_and_tracks_unmapped_rows() {
        let base = 1_704_067_200_000; // 2024-01-01 UTC
        let events = vec![
            make_event(base, "Custom Lunge", 10, 40.0), // 400
            make_event(base + 86_400_000, "Mystery Move", 5, 30.0), // 150
        ];

        let mut catalog = HashMap::new();
        // Only slug-like key is present; lookup should normalize event name and still match.
        catalog.insert("custom_lunge".into(), strength_entry("legs"));

        let response = compute_breakdown(
            &events,
            0,
            &catalog,
            &BreakdownQuery {
                metric: BreakdownMetric::TotalVolume,
                group_by: BreakdownGroupBy::Muscle,
            },
        );

        assert_eq!(response.totals.sets, 2);
        assert_eq!(response.qa_unmapped_events, 1);
        assert!(response.items.iter().any(|item| item.label == "legs"));
        assert!(response.items.iter().any(|item| item.label == "Unmapped"));
    }

    #[test]
    fn volume_excludes_time_distance_events_while_distance_surfaces_them() {
        let base = 1_704_067_200_000; // 2024-01-01 UTC
        let events = vec![
            make_event(base, "Barbell Squat", 5, 100.0), // volume 500
            make_payload_event(
                base + 60_000,
                json!({
                    "exercise": "Rowing Ergometer",
                    "distance": 1800.0,
                    "duration": 420.0,
                }),
            ),
        ];

        let mut catalog = HashMap::new();
        catalog.insert("Barbell Squat".into(), strength_entry("legs"));
        catalog.insert(
            "Rowing Ergometer".into(),
            catalog_entry("cardio", LoggingMode::TimeDistance, Modality::Conditioning),
        );

        let volume_breakdown = compute_breakdown(
            &events,
            0,
            &catalog,
            &BreakdownQuery {
                metric: BreakdownMetric::TotalVolume,
                group_by: BreakdownGroupBy::Muscle,
            },
        );
        assert!(volume_breakdown
            .items
            .iter()
            .any(|item| item.label == "legs"));
        assert!(!volume_breakdown
            .items
            .iter()
            .any(|item| item.label == "cardio"));

        let distance_breakdown = compute_breakdown(
            &events,
            0,
            &catalog,
            &BreakdownQuery {
                metric: BreakdownMetric::TotalDistance,
                group_by: BreakdownGroupBy::Muscle,
            },
        );
        assert!(distance_breakdown
            .items
            .iter()
            .any(|item| item.label == "cardio" && (item.value - 1_800.0).abs() < 0.001));
    }

    #[test]
    fn workout_load_distance_metric_aggregates_distance_weight_only() {
        let base = 1_704_067_200_000; // 2024-01-01 UTC
        let events = vec![
            make_payload_event(
                base,
                json!({
                    "exercise": "Farmer Carry",
                    "distance": 40.0,
                    "weight": 50.0,
                }),
            ), // load_distance 2000
            make_event(base + 1_000, "Barbell Squat", 5, 100.0), // ignored for load_distance
        ];

        let mut catalog = HashMap::new();
        catalog.insert(
            "Farmer Carry".into(),
            catalog_entry("core", LoggingMode::DistanceWeight, Modality::Hypertrophy),
        );
        catalog.insert("Barbell Squat".into(), strength_entry("legs"));

        let series = compute_workout_metrics(
            &events,
            0,
            &catalog,
            &WorkoutAnalyticsQuery {
                metric: WorkoutMetric::TotalLoadDistance,
                group_by: WorkoutGroupBy::Workout,
                filter: WorkoutAnalyticsFilter {
                    kind: WorkoutFilterKind::None,
                    value: None,
                },
            },
        );
        assert_eq!(series.points.len(), 1);
        assert!((series.points[0].value - 2_000.0).abs() < 0.001);
    }

    #[test]
    fn exercise_series_uses_max_for_max_metrics_and_sum_for_totals() {
        let base = 1_704_067_200_000; // 2024-01-01 UTC
        let events = vec![
            make_event(base, "Bench Press", 5, 100.0), // volume 500
            make_event(base + 1_000, "Bench Press", 8, 90.0), // volume 720
        ];

        let mut catalog = HashMap::new();
        catalog.insert("Bench Press".into(), strength_entry("chest"));
        catalog.insert("bench_press".into(), strength_entry("chest"));

        let max_volume = compute_exercise_series(
            &events,
            0,
            &catalog,
            &ExerciseSeriesQuery {
                exercise: "Bench Press".to_string(),
                metric: ExerciseMetric::MaxSetVolume,
                group_by: ExerciseGroupBy::Workout,
                rm_reps: None,
            },
        );
        assert_eq!(max_volume.points.len(), 1);
        assert!((max_volume.points[0].value - 720.0).abs() < 0.001);

        let workout_volume = compute_exercise_series(
            &events,
            0,
            &catalog,
            &ExerciseSeriesQuery {
                exercise: "Bench Press".to_string(),
                metric: ExerciseMetric::TotalVolume,
                group_by: ExerciseGroupBy::Workout,
                rm_reps: None,
            },
        );
        assert_eq!(workout_volume.points.len(), 1);
        assert!((workout_volume.points[0].value - 1_220.0).abs() < 0.001);

        let max_reps = compute_exercise_series(
            &events,
            0,
            &catalog,
            &ExerciseSeriesQuery {
                exercise: "Bench Press".to_string(),
                metric: ExerciseMetric::MaxReps,
                group_by: ExerciseGroupBy::Workout,
                rm_reps: None,
            },
        );
        assert_eq!(max_reps.points.len(), 1);
        assert!((max_reps.points[0].value - 8.0).abs() < 0.001);

        let one_rm = compute_exercise_series(
            &events,
            0,
            &catalog,
            &ExerciseSeriesQuery {
                exercise: "Bench Press".to_string(),
                metric: ExerciseMetric::MaxEst1rm,
                group_by: ExerciseGroupBy::Workout,
                rm_reps: None,
            },
        );
        assert_eq!(one_rm.points.len(), 1);
        assert!((one_rm.points[0].value - 116.666_664).abs() < 0.01);
    }

    #[test]
    fn exercise_series_pr_by_rm_uses_exact_reps_only() {
        let base = 1_704_067_200_000; // 2024-01-01 UTC
        let events = vec![
            make_event(base, "Bench Press", 5, 100.0),
            make_event(base + 1_000, "Bench Press", 5, 105.0),
            make_event(base + 2_000, "Bench Press", 8, 90.0),
        ];

        let mut catalog = HashMap::new();
        catalog.insert("Bench Press".into(), strength_entry("chest"));
        catalog.insert("bench_press".into(), strength_entry("chest"));

        let series_five_rm = compute_exercise_series(
            &events,
            0,
            &catalog,
            &ExerciseSeriesQuery {
                exercise: "Bench Press".to_string(),
                metric: ExerciseMetric::MaxWeightAtReps,
                group_by: ExerciseGroupBy::Workout,
                rm_reps: Some(5),
            },
        );
        assert_eq!(series_five_rm.points.len(), 1);
        assert!((series_five_rm.points[0].value - 105.0).abs() < 0.001);

        let series_six_rm = compute_exercise_series(
            &events,
            0,
            &catalog,
            &ExerciseSeriesQuery {
                exercise: "Bench Press".to_string(),
                metric: ExerciseMetric::MaxWeightAtReps,
                group_by: ExerciseGroupBy::Workout,
                rm_reps: Some(6),
            },
        );
        assert_eq!(series_six_rm.points.len(), 0);
    }

    #[test]
    fn exercise_series_supports_distance_duration_and_load_distance_metrics() {
        let base = 1_704_067_200_000; // 2024-01-01 UTC
        let events = vec![
            make_payload_event(
                base,
                json!({
                    "exercise": "Rowing Ergometer",
                    "distance": 1_200.0,
                    "duration": 300.0,
                }),
            ),
            make_payload_event(
                base + 60_000,
                json!({
                    "exercise": "Rowing Ergometer",
                    "distance": 800.0,
                    "duration": 240.0,
                }),
            ),
            make_payload_event(
                base + 120_000,
                json!({
                    "exercise": "Farmer Carry",
                    "distance": 30.0,
                    "weight": 40.0,
                }),
            ),
            make_payload_event(
                base + 180_000,
                json!({
                    "exercise": "Farmer Carry",
                    "distance": 20.0,
                    "weight": 50.0,
                }),
            ),
        ];

        let mut catalog = HashMap::new();
        catalog.insert(
            "Rowing Ergometer".into(),
            catalog_entry("cardio", LoggingMode::TimeDistance, Modality::Conditioning),
        );
        catalog.insert(
            "Farmer Carry".into(),
            catalog_entry("core", LoggingMode::DistanceWeight, Modality::Hypertrophy),
        );

        let rowing_distance_max = compute_exercise_series(
            &events,
            0,
            &catalog,
            &ExerciseSeriesQuery {
                exercise: "Rowing Ergometer".to_string(),
                metric: ExerciseMetric::MaxDistance,
                group_by: ExerciseGroupBy::Workout,
                rm_reps: None,
            },
        );
        assert_eq!(rowing_distance_max.points.len(), 1);
        assert!((rowing_distance_max.points[0].value - 1_200.0).abs() < 0.001);

        let rowing_distance_total = compute_exercise_series(
            &events,
            0,
            &catalog,
            &ExerciseSeriesQuery {
                exercise: "Rowing Ergometer".to_string(),
                metric: ExerciseMetric::TotalDistance,
                group_by: ExerciseGroupBy::Workout,
                rm_reps: None,
            },
        );
        assert_eq!(rowing_distance_total.points.len(), 1);
        assert!((rowing_distance_total.points[0].value - 2_000.0).abs() < 0.001);

        let rowing_duration_max = compute_exercise_series(
            &events,
            0,
            &catalog,
            &ExerciseSeriesQuery {
                exercise: "Rowing Ergometer".to_string(),
                metric: ExerciseMetric::MaxActiveDuration,
                group_by: ExerciseGroupBy::Workout,
                rm_reps: None,
            },
        );
        assert_eq!(rowing_duration_max.points.len(), 1);
        assert!((rowing_duration_max.points[0].value - 300.0).abs() < 0.001);

        let rowing_duration_total = compute_exercise_series(
            &events,
            0,
            &catalog,
            &ExerciseSeriesQuery {
                exercise: "Rowing Ergometer".to_string(),
                metric: ExerciseMetric::TotalActiveDuration,
                group_by: ExerciseGroupBy::Workout,
                rm_reps: None,
            },
        );
        assert_eq!(rowing_duration_total.points.len(), 1);
        assert!((rowing_duration_total.points[0].value - 540.0).abs() < 0.001);

        let carry_load_distance_max = compute_exercise_series(
            &events,
            0,
            &catalog,
            &ExerciseSeriesQuery {
                exercise: "Farmer Carry".to_string(),
                metric: ExerciseMetric::MaxLoadDistance,
                group_by: ExerciseGroupBy::Workout,
                rm_reps: None,
            },
        );
        assert_eq!(carry_load_distance_max.points.len(), 1);
        assert!((carry_load_distance_max.points[0].value - 1_200.0).abs() < 0.001);

        let carry_load_distance_total = compute_exercise_series(
            &events,
            0,
            &catalog,
            &ExerciseSeriesQuery {
                exercise: "Farmer Carry".to_string(),
                metric: ExerciseMetric::TotalLoadDistance,
                group_by: ExerciseGroupBy::Workout,
                rm_reps: None,
            },
        );
        assert_eq!(carry_load_distance_total.points.len(), 1);
        assert!((carry_load_distance_total.points[0].value - 2_200.0).abs() < 0.001);

        let carry_max_weight = compute_exercise_series(
            &events,
            0,
            &catalog,
            &ExerciseSeriesQuery {
                exercise: "Farmer Carry".to_string(),
                metric: ExerciseMetric::MaxWeight,
                group_by: ExerciseGroupBy::Workout,
                rm_reps: None,
            },
        );
        assert_eq!(carry_max_weight.points.len(), 1);
        assert!((carry_max_weight.points[0].value - 50.0).abs() < 0.001);

        let carry_total_weight = compute_exercise_series(
            &events,
            0,
            &catalog,
            &ExerciseSeriesQuery {
                exercise: "Farmer Carry".to_string(),
                metric: ExerciseMetric::TotalWeight,
                group_by: ExerciseGroupBy::Workout,
                rm_reps: None,
            },
        );
        assert_eq!(carry_total_weight.points.len(), 1);
        assert!((carry_total_weight.points[0].value - 90.0).abs() < 0.001);
    }

    #[test]
    fn workout_volume_falls_back_to_payload_when_catalog_is_missing() {
        let base = 1_704_067_200_000; // 2024-01-01 UTC
        let events = vec![make_event(base, "Unknown Lift", 6, 90.0)];
        let catalog = HashMap::new();

        let series = compute_workout_metrics(
            &events,
            0,
            &catalog,
            &WorkoutAnalyticsQuery {
                metric: WorkoutMetric::TotalVolume,
                group_by: WorkoutGroupBy::Workout,
                filter: WorkoutAnalyticsFilter {
                    kind: WorkoutFilterKind::None,
                    value: None,
                },
            },
        );
        assert_eq!(series.points.len(), 1);
        assert!((series.points[0].value - 540.0).abs() < 0.001);
    }

    #[test]
    fn home_day_analytics_groups_sets_into_sections_and_chunks() {
        let base = 1_704_067_200_000; // 2024-01-01 UTC
        let next_day = base + 86_400_000;
        let events = vec![
            make_event(base, "Bench Press", 8, 60.0),
            make_event(base + 1_000, "Bench Press", 8, 60.0),
            make_event(base + 2_000, "Back Squat", 5, 100.0),
            make_event(next_day, "Bench Press", 10, 50.0),
        ];

        let mut catalog = HashMap::new();
        catalog.insert("Bench Press".into(), strength_entry("chest"));
        catalog.insert("bench_press".into(), strength_entry("chest"));
        catalog.insert("Back Squat".into(), strength_entry("legs"));
        catalog.insert("back_squat".into(), strength_entry("legs"));

        let response =
            compute_home_day_analytics(&events, 0, &catalog, &HomeDayQuery { day_bucket: base });

        assert!(!response.empty_state);
        assert_eq!(response.totals.total_sets, 3);
        assert_eq!(response.totals.total_exercises, 2);
        assert_eq!(response.sections.len(), 2);
        assert_eq!(response.sections[0].key, "chest");
        assert_eq!(response.sections[0].exercises[0].exercise, "Bench Press");
        assert_eq!(response.sections[0].exercises[0].set_chunks.len(), 1);
        assert_eq!(response.sections[0].exercises[0].set_chunks[0].count, 2);
        assert_eq!(response.sections[1].key, "legs");
    }

    #[test]
    fn home_days_analytics_batches_multiple_days_in_single_response() {
        let base = 1_704_067_200_000; // 2024-01-01 UTC
        let day_two = base + 86_400_000;
        let events = vec![
            make_event(base, "Bench Press", 8, 60.0),
            make_event(day_two, "Back Squat", 5, 100.0),
        ];

        let mut catalog = HashMap::new();
        catalog.insert("Bench Press".into(), strength_entry("chest"));
        catalog.insert("Back Squat".into(), strength_entry("legs"));

        let response = compute_home_days_analytics(
            &events,
            0,
            &catalog,
            &HomeDaysQuery {
                day_buckets: vec![base, day_two, base],
            },
        );

        assert_eq!(response.days.len(), 2);
        assert_eq!(response.days[0].day_bucket, base);
        assert_eq!(response.days[1].day_bucket, day_two);
        assert_eq!(response.days[0].totals.total_sets, 1);
        assert_eq!(response.days[1].totals.total_sets, 1);
    }

    #[test]
    fn calendar_month_analytics_computes_sessions_attendance_and_distribution() {
        let base = 1_704_067_200_000; // 2024-01-01 UTC
        let events = vec![
            make_event(base, "Bench Press", 8, 60.0),
            make_event(base + 86_401_000, "Barbell Row", 8, 70.0),
            make_event(base + 2 * 86_400_000, "Barbell Row", 6, 80.0),
        ];

        let mut catalog = HashMap::new();
        catalog.insert("Bench Press".into(), strength_entry("chest"));
        catalog.insert("bench_press".into(), strength_entry("chest"));
        catalog.insert("Barbell Row".into(), strength_entry("back"));
        catalog.insert("barbell_row".into(), strength_entry("back"));

        let response = compute_calendar_month_analytics(
            &events,
            0,
            &catalog,
            &CalendarMonthQuery {
                month_bucket: bucket_ts(base, Granularity::Month, 0),
            },
        );

        assert_eq!(response.sessions, 3);
        assert!(!response.is_future_month);
        assert!(
            (response.attendance_percent - ((3.0 / 31.0) * 100.0)).abs() < 0.01,
            "attendance_percent={}",
            response.attendance_percent
        );
        assert_eq!(response.all_muscles.len(), 2);
        assert_eq!(response.all_muscles[0].group, "back");
        assert_eq!(response.all_muscles[0].count, 2);
        assert_eq!(response.all_muscles[1].group, "chest");
        assert_eq!(response.pie_data.len(), 2);
        assert!(response
            .pie_data
            .iter()
            .any(|item| item.label == "back" && (item.percentage - 66.666664).abs() < 0.05));
    }

    #[test]
    #[ignore = "Perf smoke test; run manually on target hardware"]
    fn perf_smoke_workout_analytics_for_5000_events() {
        let base = 1_704_067_200_000; // 2024-01-01 UTC
        let mut events = Vec::with_capacity(5_000);
        for index in 0..5_000 {
            events.push(make_event(
                base + (index as i64 * 60_000),
                "Barbell Squat",
                (5 + (index % 6)) as i32,
                80.0 + (index % 40) as f32,
            ));
        }

        let mut catalog = HashMap::new();
        catalog.insert("Barbell Squat".into(), strength_entry("legs"));
        catalog.insert("barbell_squat".into(), strength_entry("legs"));

        let query = WorkoutAnalyticsQuery {
            metric: WorkoutMetric::TotalVolume,
            group_by: WorkoutGroupBy::Week,
            filter: WorkoutAnalyticsFilter {
                kind: WorkoutFilterKind::None,
                value: None,
            },
        };

        let start = Instant::now();
        let series = compute_workout_metrics(&events, 0, &catalog, &query);
        let elapsed_ms = start.elapsed().as_millis();

        assert!(!series.points.is_empty());
        assert!(
            elapsed_ms < 300,
            "Expected <300ms for 5000 events, got {elapsed_ms}ms"
        );
    }
}
