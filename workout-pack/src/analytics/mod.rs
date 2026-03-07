use std::collections::{HashMap, HashSet};
use tracker_analytics::{
    bucket_ts, round_to_local_day, round_to_local_month, Distribution, Granularity, Heatmap,
    StreakCalculator,
};

use crate::catalog_key::normalize_catalog_key;
use crate::metrics::estimate_one_rm;

mod event_metrics;
mod types;

pub use types::*;

use event_metrics::{
    extract_event_metrics, modality_label, resolve_catalog_entry, EventMetricValues,
};

pub fn compute_summary(
    events: &[AnalyticsInputEvent],
    offset_minutes: i32,
    catalog_map: &HashMap<String, CatalogEntryLite>, // Exercise Name -> Catalog meta
) -> AnalyticsSummary {
    // DEBUG: Log input
    eprintln!(
        "[analytics::compute_summary] Called with {} events",
        events.len()
    );
    eprintln!(
        "[analytics::compute_summary] offset_minutes: {}",
        offset_minutes
    );
    eprintln!(
        "[analytics::compute_summary] catalog_map has {} entries",
        catalog_map.len()
    );

    // 1. Consistency & Heatmap
    // Filter for valid completion events (assuming all saved events are valid)
    let timestamps: Vec<i64> = events.iter().map(|e| e.ts).collect();
    eprintln!(
        "[analytics::compute_summary] Extracted {} timestamps",
        timestamps.len()
    );

    let consistency = StreakCalculator::calculate(&timestamps, offset_minutes);
    let heatmap = Heatmap::calculate(&timestamps, offset_minutes);

    eprintln!(
        "[analytics::compute_summary] Consistency: current_streak={}, longest_streak={}",
        consistency.current_streak, consistency.longest_streak
    );

    // 2. Muscle Split
    let mut muscle_counts: HashMap<String, f32> = HashMap::new();

    // 3. Volume Trend (Last 12 weeks)
    let mut volume_buckets: HashMap<i64, (f32, i32)> = HashMap::new(); // bucket -> (volume, count)

    // 4. PRs
    struct PrTracking {
        one_rm: f32,
        max_weight: f32,
        max_reps: i32,
        best_volume: f32,
    }
    let mut pr_map: HashMap<String, PrTracking> = HashMap::new();

    for event in events {
        // Parse Payload
        let exercise_name = event
            .payload
            .get("exercise")
            .and_then(|v| v.as_str())
            .unwrap_or("Unknown");

        let metrics = extract_event_metrics(event, exercise_name, catalog_map);
        let volume = metrics.volume;

        // Muscle Split - accumulate volume per muscle group
        if volume > 0.0 {
            if let Some(entry) = resolve_catalog_entry(event, exercise_name, catalog_map) {
                *muscle_counts.entry(entry.muscle.clone()).or_insert(0.0) += volume;
            }
        }

        // Volume Trend (Weekly)
        let week_bucket = bucket_ts(event.ts, Granularity::Week, offset_minutes);
        // Only keep if within last 6 months? Or return all and let UI slice?
        // Returning all is fine for now, robust.
        let entry = volume_buckets.entry(week_bucket).or_insert((0.0, 0));
        entry.0 += volume;
        entry.1 += 1; // Set count

        // PRs
        if metrics.reps > 0 && metrics.weight > 0.0 {
            // Epley Formula
            let est_1rm = metrics.weight * (1.0 + metrics.reps as f32 / 30.0);

            let tracker = pr_map
                .entry(exercise_name.to_string())
                .or_insert(PrTracking {
                    one_rm: 0.0,
                    max_weight: 0.0,
                    max_reps: 0,
                    best_volume: 0.0,
                });

            if est_1rm > tracker.one_rm {
                tracker.one_rm = est_1rm;
            }
            if metrics.weight > tracker.max_weight {
                tracker.max_weight = metrics.weight;
            }
            if metrics.reps > tracker.max_reps {
                tracker.max_reps = metrics.reps;
            }
            if volume > tracker.best_volume {
                tracker.best_volume = volume;
            }
        }
    }

    // Finalize Muscle Split
    let muscle_split = Distribution::calculate(muscle_counts.into_iter().collect());

    // Finalize Volume
    let mut recent_volume: Vec<VolumePoint> = volume_buckets
        .into_iter()
        .map(|(ts, (vol, cnt))| {
            // Need a Label function?
            // We'll return just TS, UI formats it. But VolumePoint struct has label.
            // We can format simple YYYY-MM-DD for debug/label.
            VolumePoint {
                label: "".to_string(), // TODO: Format date if needed, or leave empty for UI
                volume: vol,
                count: cnt,
                bucket: ts,
            }
        })
        .collect();
    recent_volume.sort_by_key(|p| p.bucket);

    // Finalize PRs
    let prs: Vec<PersonalRecord> = pr_map
        .into_iter()
        .map(|(name, t)| PersonalRecord {
            exercise: name,
            one_rm: t.one_rm,
            max_weight: t.max_weight,
            max_reps: t.max_reps,
            best_volume: t.best_volume,
        })
        .collect();

    AnalyticsSummary {
        consistency,
        heatmap,
        muscle_split,
        recent_volume,
        prs,
    }
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
    offset_minutes: i32,
    catalog_map: &HashMap<String, CatalogEntryLite>,
    query: &HomeDayQuery,
) -> HomeDayResponse {
    eprintln!(
        "[analytics::compute_home_day_analytics] Called with {} events for day_bucket={}",
        events.len(),
        query.day_bucket
    );

    let day_start = query.day_bucket;
    let day_end = day_start + 24 * 60 * 60 * 1000; // Add 24 hours in ms

    let mut day_events: Vec<_> = events
        .iter()
        .filter(|e| e.ts >= day_start && e.ts < day_end)
        .collect();

    eprintln!(
        "[analytics::compute_home_day_analytics] Filtered to {} events for this day",
        day_events.len()
    );
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

fn matches_filter(
    event: &AnalyticsInputEvent,
    exercise_name: &str,
    filter: &WorkoutAnalyticsFilter,
    catalog_map: &HashMap<String, CatalogEntryLite>,
) -> bool {
    match filter.kind {
        WorkoutFilterKind::None => true,
        WorkoutFilterKind::Exercise => filter
            .value
            .as_deref()
            .map(|value| value == exercise_name)
            .unwrap_or(true),
        WorkoutFilterKind::Muscle => {
            let target = match filter.value.as_deref() {
                Some(value) => value,
                None => return true,
            };
            match resolve_catalog_entry(event, exercise_name, catalog_map) {
                Some(entry) => entry.muscle == target,
                None => false,
            }
        }
    }
}

fn group_bucket(ts: i64, group_by: WorkoutGroupBy, offset_minutes: i32) -> i64 {
    match group_by {
        WorkoutGroupBy::Workout => bucket_ts(ts, Granularity::Day, offset_minutes),
        WorkoutGroupBy::Week => bucket_ts(ts, Granularity::Week, offset_minutes),
        WorkoutGroupBy::Month => bucket_ts(ts, Granularity::Month, offset_minutes),
    }
}

fn exercise_group_bucket(ts: i64, group_by: ExerciseGroupBy, offset_minutes: i32) -> i64 {
    match group_by {
        ExerciseGroupBy::Workout => bucket_ts(ts, Granularity::Day, offset_minutes),
        ExerciseGroupBy::Week => bucket_ts(ts, Granularity::Week, offset_minutes),
        ExerciseGroupBy::Month => bucket_ts(ts, Granularity::Month, offset_minutes),
    }
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
    match query.metric {
        WorkoutMetric::Duration => {
            let mut spans: HashMap<i64, (i64, i64)> = HashMap::new();
            for event in events {
                let exercise_name = event
                    .payload
                    .get("exercise")
                    .and_then(|v| v.as_str())
                    .unwrap_or("Unknown");

                if !matches_filter(event, exercise_name, &query.filter, catalog_map) {
                    continue;
                }

                let day_bucket = bucket_ts(event.ts, Granularity::Day, offset_minutes);
                let entry = spans.entry(day_bucket).or_insert((event.ts, event.ts));
                if event.ts < entry.0 {
                    entry.0 = event.ts;
                }
                if event.ts > entry.1 {
                    entry.1 = event.ts;
                }
            }

            let mut buckets: HashMap<i64, (f32, i32)> = HashMap::new();
            for (day_bucket, (min_ts, max_ts)) in spans {
                let duration_seconds = ((max_ts - min_ts) as f32 / 1000.0).max(0.0);
                let bucket = group_bucket(day_bucket, query.group_by.clone(), offset_minutes);
                let entry = buckets.entry(bucket).or_insert((0.0, 0));
                entry.0 += duration_seconds;
                entry.1 += 1;
            }

            finalize_series(query.metric.clone(), query.group_by.clone(), buckets)
        }
        _ => {
            let mut buckets: HashMap<i64, (f32, i32)> = HashMap::new();
            for event in events {
                let exercise_name = event
                    .payload
                    .get("exercise")
                    .and_then(|v| v.as_str())
                    .unwrap_or("Unknown");

                if !matches_filter(event, exercise_name, &query.filter, catalog_map) {
                    continue;
                }

                let metrics = extract_event_metrics(event, exercise_name, catalog_map);
                let value = match query.metric {
                    WorkoutMetric::Volume => metrics.volume,
                    WorkoutMetric::Sets => 1.0,
                    WorkoutMetric::Reps => metrics.reps as f32,
                    WorkoutMetric::Duration => 0.0,
                    WorkoutMetric::Distance => metrics.distance,
                    WorkoutMetric::ActiveDuration => metrics.active_duration,
                    WorkoutMetric::LoadDistance => metrics.load_distance,
                };

                let bucket = group_bucket(event.ts, query.group_by.clone(), offset_minutes);
                let entry = buckets.entry(bucket).or_insert((0.0, 0));
                entry.0 += value;
                entry.1 += 1;
            }

            finalize_series(query.metric.clone(), query.group_by.clone(), buckets)
        }
    }
}

pub fn compute_breakdown(
    events: &[AnalyticsInputEvent],
    offset_minutes: i32,
    catalog_map: &HashMap<String, CatalogEntryLite>,
    query: &BreakdownQuery,
) -> BreakdownResponse {
    let mut buckets: HashMap<String, f32> = HashMap::new();
    let mut workouts: HashSet<i64> = HashSet::new();
    let mut totals_sets = 0;
    let mut totals_reps = 0;
    let mut totals_volume = 0.0;
    let mut totals_distance = 0.0;
    let mut totals_active_duration = 0.0;
    let mut totals_load_distance = 0.0;
    let mut qa_unmapped_events = 0;

    for event in events {
        let exercise_name = event
            .payload
            .get("exercise")
            .and_then(|v| v.as_str())
            .unwrap_or("Unknown");
        let metrics = extract_event_metrics(event, exercise_name, catalog_map);

        totals_sets += 1;
        totals_reps += metrics.reps;
        totals_volume += metrics.volume;
        totals_distance += metrics.distance;
        totals_active_duration += metrics.active_duration;
        totals_load_distance += metrics.load_distance;

        let day_bucket = bucket_ts(event.ts, Granularity::Day, offset_minutes);
        workouts.insert(day_bucket);

        let catalog_entry = resolve_catalog_entry(event, exercise_name, catalog_map);
        if catalog_entry.is_none() {
            qa_unmapped_events += 1;
        }

        let label = match query.group_by {
            BreakdownGroupBy::Muscle => catalog_entry
                .map(|entry| entry.muscle.clone())
                .unwrap_or_else(|| "Unmapped".to_string()),
            BreakdownGroupBy::Exercise => exercise_name.to_string(),
            BreakdownGroupBy::Category => catalog_entry
                .map(|entry| modality_label(&entry.modality))
                .unwrap_or_else(|| "other".to_string()),
        };

        let value = match query.metric {
            BreakdownMetric::Volume => metrics.volume,
            BreakdownMetric::Sets => 1.0,
            BreakdownMetric::Reps => metrics.reps as f32,
            BreakdownMetric::Distance => metrics.distance,
            BreakdownMetric::ActiveDuration => metrics.active_duration,
            BreakdownMetric::LoadDistance => metrics.load_distance,
        };

        if value <= 0.0 {
            continue;
        }

        *buckets.entry(label).or_insert(0.0) += value;
    }

    let items = Distribution::calculate(buckets.into_iter().collect());
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

#[derive(Default, Debug, Clone)]
struct ExerciseBucketStats {
    count: i32,
    sum_weight: f32,
    sum_reps: i32,
    sum_volume: f32,
    sum_distance: f32,
    sum_active_duration: f32,
    sum_load_distance: f32,
    max_weight: f32,
    max_reps: i32,
    max_volume: f32,
    max_distance: f32,
    max_active_duration: f32,
    max_load_distance: f32,
    max_1rm: f32,
    max_weight_for_rm: f32,
}

pub fn compute_exercise_series(
    events: &[AnalyticsInputEvent],
    offset_minutes: i32,
    catalog_map: &HashMap<String, CatalogEntryLite>,
    query: &ExerciseSeriesQuery,
) -> ExerciseSeries {
    let mut buckets: HashMap<i64, ExerciseBucketStats> = HashMap::new();
    let target_rm = query.rm_reps.unwrap_or(1).max(1);

    for event in events {
        let exercise_name = event
            .payload
            .get("exercise")
            .and_then(|v| v.as_str())
            .unwrap_or("Unknown");

        if exercise_name != query.exercise {
            continue;
        }

        let metrics = extract_event_metrics(event, exercise_name, catalog_map);
        let bucket = exercise_group_bucket(event.ts, query.group_by.clone(), offset_minutes);
        let stats = buckets.entry(bucket).or_default();

        stats.count += 1;
        if metrics.reps > 0 {
            stats.sum_reps += metrics.reps;
            if metrics.reps > stats.max_reps {
                stats.max_reps = metrics.reps;
            }
        }
        if metrics.weight > 0.0 {
            stats.sum_weight += metrics.weight;
            if metrics.weight > stats.max_weight {
                stats.max_weight = metrics.weight;
            }
        }
        if metrics.volume > 0.0 {
            stats.sum_volume += metrics.volume;
            if metrics.volume > stats.max_volume {
                stats.max_volume = metrics.volume;
            }
        }
        if metrics.distance > 0.0 {
            stats.sum_distance += metrics.distance;
            if metrics.distance > stats.max_distance {
                stats.max_distance = metrics.distance;
            }
        }
        if metrics.active_duration > 0.0 {
            stats.sum_active_duration += metrics.active_duration;
            if metrics.active_duration > stats.max_active_duration {
                stats.max_active_duration = metrics.active_duration;
            }
        }
        if metrics.load_distance > 0.0 {
            stats.sum_load_distance += metrics.load_distance;
            if metrics.load_distance > stats.max_load_distance {
                stats.max_load_distance = metrics.load_distance;
            }
        }
        if metrics.weight > 0.0 && metrics.reps > 0 {
            let est = estimate_one_rm(metrics.weight as f64, metrics.reps) as f32;
            if est > stats.max_1rm {
                stats.max_1rm = est;
            }
        }
        if metrics.weight > 0.0 && metrics.reps == target_rm {
            if metrics.weight > stats.max_weight_for_rm {
                stats.max_weight_for_rm = metrics.weight;
            }
        }
    }

    let mut points: Vec<ExerciseSeriesPoint> = buckets
        .into_iter()
        .filter_map(|(bucket, stats)| {
            let value = match query.metric {
                ExerciseMetric::EstimatedOneRm => stats.max_1rm,
                ExerciseMetric::MaxWeight => stats.max_weight,
                ExerciseMetric::WorkoutWeight => stats.sum_weight,
                ExerciseMetric::PrByRm => stats.max_weight_for_rm,
                ExerciseMetric::MaxReps => stats.max_reps as f32,
                ExerciseMetric::MaxVolume => stats.max_volume,
                ExerciseMetric::WorkoutVolume => stats.sum_volume,
                ExerciseMetric::WorkoutReps => stats.sum_reps as f32,
                ExerciseMetric::MaxDistance => stats.max_distance,
                ExerciseMetric::WorkoutDistance => stats.sum_distance,
                ExerciseMetric::MaxActiveDuration => stats.max_active_duration,
                ExerciseMetric::WorkoutActiveDuration => stats.sum_active_duration,
                ExerciseMetric::MaxLoadDistance => stats.max_load_distance,
                ExerciseMetric::WorkoutLoadDistance => stats.sum_load_distance,
            };
            if value <= 0.0 {
                return None;
            }
            Some(ExerciseSeriesPoint {
                label: String::new(),
                value,
                count: stats.count,
                bucket,
            })
        })
        .collect();
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
            metric: WorkoutMetric::Volume,
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
            metric: WorkoutMetric::Volume,
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
                metric: BreakdownMetric::Volume,
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
                metric: BreakdownMetric::Volume,
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
                metric: BreakdownMetric::Distance,
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
                metric: WorkoutMetric::LoadDistance,
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
                metric: ExerciseMetric::MaxVolume,
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
                metric: ExerciseMetric::WorkoutVolume,
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
                metric: ExerciseMetric::EstimatedOneRm,
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
                metric: ExerciseMetric::PrByRm,
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
                metric: ExerciseMetric::PrByRm,
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
                metric: ExerciseMetric::WorkoutDistance,
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
                metric: ExerciseMetric::WorkoutActiveDuration,
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
                metric: ExerciseMetric::WorkoutLoadDistance,
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
                metric: ExerciseMetric::WorkoutWeight,
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
                metric: WorkoutMetric::Volume,
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
            metric: WorkoutMetric::Volume,
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
