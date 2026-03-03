use std::collections::HashMap;

use crate::analytics::{AnalyticsInputEvent, CatalogEntryLite};
use crate::catalog::{LoggingMode, Modality};
use crate::catalog_key::normalize_catalog_key;

pub(crate) fn resolve_catalog_entry<'a>(
    event: &AnalyticsInputEvent,
    exercise_name: &str,
    catalog_map: &'a HashMap<String, CatalogEntryLite>,
) -> Option<&'a CatalogEntryLite> {
    let event_slug = event
        .payload
        .get("exercise_slug")
        .and_then(|value| value.as_str());
    if let Some(slug) = event_slug {
        if let Some(entry) = catalog_map.get(slug) {
            return Some(entry);
        }
        let normalized_slug = normalize_catalog_key(slug);
        if !normalized_slug.is_empty() {
            if let Some(entry) = catalog_map.get(&normalized_slug) {
                return Some(entry);
            }
        }
    }

    if let Some(entry) = catalog_map.get(exercise_name) {
        return Some(entry);
    }
    let normalized_name = normalize_catalog_key(exercise_name);
    if normalized_name.is_empty() {
        return None;
    }
    catalog_map.get(&normalized_name)
}

pub(crate) fn modality_label(modality: &Modality) -> String {
    match modality {
        Modality::Strength => "strength",
        Modality::Hypertrophy => "hypertrophy",
        Modality::Conditioning => "conditioning",
        Modality::Bodyweight => "bodyweight",
        Modality::Mobility => "mobility",
    }
    .to_string()
}

#[derive(Default, Debug, Clone, Copy)]
pub(crate) struct EventMetricValues {
    pub(crate) volume: f32,
    pub(crate) reps: i32,
    pub(crate) weight: f32,
    pub(crate) distance: f32,
    pub(crate) active_duration: f32,
    pub(crate) load_distance: f32,
}

pub(crate) fn extract_event_metrics(
    event: &AnalyticsInputEvent,
    exercise_name: &str,
    catalog_map: &HashMap<String, CatalogEntryLite>,
) -> EventMetricValues {
    let weight = event
        .payload
        .get("weight")
        .and_then(|v| v.as_f64())
        .map(|v| v as f32)
        .filter(|v| *v > 0.0);
    let reps = event
        .payload
        .get("reps")
        .and_then(|v| v.as_i64())
        .map(|v| v as i32)
        .filter(|v| *v > 0);
    let duration = event
        .payload
        .get("duration")
        .and_then(|v| v.as_f64())
        .map(|v| v as f32)
        .filter(|v| *v > 0.0);
    let distance = event
        .payload
        .get("distance")
        .and_then(|v| v.as_f64())
        .map(|v| v as f32)
        .filter(|v| *v > 0.0);

    let resolved_logging_mode = resolve_catalog_entry(event, exercise_name, catalog_map)
        .map(|entry| entry.logging_mode.clone())
        .unwrap_or_else(|| infer_logging_mode(weight, reps, duration, distance));

    let mut metrics = EventMetricValues {
        reps: reps.unwrap_or(0),
        ..EventMetricValues::default()
    };

    match resolved_logging_mode {
        LoggingMode::RepsWeight => {
            if let (Some(w), Some(r)) = (weight, reps) {
                metrics.weight = w;
                metrics.volume = w * r as f32;
            }
        }
        LoggingMode::Reps => {}
        LoggingMode::Time => {
            metrics.active_duration = duration.unwrap_or(0.0);
        }
        LoggingMode::Distance => {
            metrics.distance = distance.unwrap_or(0.0);
        }
        LoggingMode::TimeDistance => {
            metrics.distance = distance.unwrap_or(0.0);
            metrics.active_duration = duration.unwrap_or(0.0);
        }
        LoggingMode::DistanceWeight => {
            metrics.distance = distance.unwrap_or(0.0);
            if let (Some(d), Some(w)) = (distance, weight) {
                metrics.weight = w;
                metrics.load_distance = d * w;
            }
        }
        LoggingMode::Mixed => {
            if let (Some(w), Some(r)) = (weight, reps) {
                metrics.weight = w;
                metrics.volume = w * r as f32;
            }
            if let Some(d) = distance {
                metrics.distance = d;
                if let Some(w) = weight {
                    metrics.weight = w;
                }
            }
            if let Some(t) = duration {
                metrics.active_duration = t;
            }
            if let (Some(d), Some(w)) = (distance, weight) {
                metrics.load_distance = d * w;
            }
        }
    }

    metrics
}

fn infer_logging_mode(
    weight: Option<f32>,
    reps: Option<i32>,
    duration: Option<f32>,
    distance: Option<f32>,
) -> LoggingMode {
    if weight.is_some() && reps.is_some() {
        return LoggingMode::RepsWeight;
    }
    if distance.is_some() && weight.is_some() {
        return LoggingMode::DistanceWeight;
    }
    if distance.is_some() && duration.is_some() {
        return LoggingMode::TimeDistance;
    }
    if reps.is_some() {
        return LoggingMode::Reps;
    }
    if duration.is_some() {
        return LoggingMode::Time;
    }
    if distance.is_some() {
        return LoggingMode::Distance;
    }
    LoggingMode::Mixed
}
