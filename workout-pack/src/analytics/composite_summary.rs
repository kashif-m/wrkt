use std::collections::HashMap;
use tracker_analytics::{
    bucket_ts, round_to_local_day, Distribution, Granularity, Heatmap, StreakCalculator,
};

use super::event_metrics::{extract_event_metrics, resolve_catalog_entry};
use super::{AnalyticsInputEvent, AnalyticsSummary, CatalogEntryLite, PersonalRecord, VolumePoint};

/// Summary is a composite read model built from DSL-backed event fields and metrics.
/// It intentionally packages multiple aggregates for dashboard presentation.
pub fn compute_summary(
    events: &[AnalyticsInputEvent],
    offset_minutes: i32,
    catalog_map: &HashMap<String, CatalogEntryLite>,
) -> AnalyticsSummary {
    let timestamps: Vec<i64> = events.iter().map(|event| event.ts).collect();
    let day_buckets: Vec<i64> = events
        .iter()
        .map(|event| {
            event
                .payload
                .get("day_bucket")
                .and_then(|value| value.as_i64())
                .unwrap_or_else(|| round_to_local_day(event.ts, offset_minutes))
        })
        .collect();

    let consistency = StreakCalculator::calculate(&timestamps, offset_minutes);
    let heatmap = Heatmap::calculate_from_day_buckets(&day_buckets, offset_minutes);

    let mut muscle_counts: HashMap<String, f32> = HashMap::new();
    let mut volume_buckets: HashMap<i64, (f32, i32)> = HashMap::new();

    struct PrTracking {
        one_rm: f32,
        max_weight: f32,
        max_reps: i32,
        best_volume: f32,
    }
    let mut pr_map: HashMap<String, PrTracking> = HashMap::new();

    for event in events {
        let exercise_name = event
            .payload
            .get("exercise")
            .and_then(|value| value.as_str())
            .unwrap_or("Unknown");

        let metrics = extract_event_metrics(event, exercise_name, catalog_map);
        let volume = metrics.volume;

        if volume > 0.0 {
            if let Some(entry) = resolve_catalog_entry(event, exercise_name, catalog_map) {
                *muscle_counts.entry(entry.muscle.clone()).or_insert(0.0) += volume;
            }
        }

        let week_bucket = bucket_ts(event.ts, Granularity::Week, offset_minutes);
        let bucket = volume_buckets.entry(week_bucket).or_insert((0.0, 0));
        bucket.0 += volume;
        bucket.1 += 1;

        if metrics.reps > 0 && metrics.weight > 0.0 {
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

    let muscle_split = Distribution::calculate(muscle_counts.into_iter().collect());

    let mut recent_volume: Vec<VolumePoint> = volume_buckets
        .into_iter()
        .map(|(bucket, (volume, count))| VolumePoint {
            label: String::new(),
            volume,
            count,
            bucket,
        })
        .collect();
    recent_volume.sort_by_key(|point| point.bucket);

    let prs: Vec<PersonalRecord> = pr_map
        .into_iter()
        .map(|(exercise, pr)| PersonalRecord {
            exercise,
            one_rm: pr.one_rm,
            max_weight: pr.max_weight,
            max_reps: pr.max_reps,
            best_volume: pr.best_volume,
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
