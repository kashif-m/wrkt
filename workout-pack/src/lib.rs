//! Workout domain crate: catalog, metrics, analytics, and tracker artifact wiring.

pub mod analytics;
pub mod catalog;
pub mod catalog_key;
pub mod import;
pub mod metrics;
mod tracker_artifact {
    include!(concat!(env!("OUT_DIR"), "/workout_tracker_compiled.rs"));
}

pub use catalog::{catalog_slugs, default_catalog, validate_exercise, ExerciseDefinition};
pub use import::{ImportBundle, ImportWarning, ImportedEvent};
pub use metrics::{
    build_pr_payload, detect_pr, estimate_one_rm, score_set, ExistingEventInfo, LoggingMode,
    PrResult, PrType, SetPayload,
};
pub use tracker_artifact::WORKOUT_METRIC_NAMES;
pub use tracker_artifact::WORKOUT_TRACKER_DSL;

pub fn compiled_workout_definition() -> tracker_ir::TrackerDefinition {
    serde_json::from_str(tracker_artifact::WORKOUT_TRACKER_JSON)
        .expect("generated workout tracker JSON must deserialize")
}

pub fn compiled_workout_view_metrics() -> std::collections::BTreeMap<String, Vec<String>> {
    serde_json::from_str(tracker_artifact::WORKOUT_VIEW_METRICS_JSON)
        .expect("generated workout view metrics JSON must deserialize")
}

pub fn compiled_workout_view_metric_config() -> serde_json::Value {
    serde_json::from_str(tracker_artifact::WORKOUT_VIEW_METRIC_CONFIG_JSON)
        .expect("generated workout view metric config JSON must deserialize")
}

pub fn compiled_workout_view_default_metrics() -> std::collections::BTreeMap<String, String> {
    serde_json::from_str(tracker_artifact::WORKOUT_VIEW_DEFAULT_METRICS_JSON)
        .expect("generated workout view default metrics JSON must deserialize")
}
