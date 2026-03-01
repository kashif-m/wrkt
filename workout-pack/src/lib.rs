//! Workout-specific planning strategies and catalog helpers.

pub mod analytics;
pub mod catalog;
pub mod import;
pub mod metrics;
pub mod strategy;
pub mod time_policy;

pub use catalog::{catalog_slugs, default_catalog, validate_exercise, ExerciseDefinition};
pub use import::{ImportBundle, ImportWarning, ImportedEvent};
pub use metrics::{
    build_pr_payload, detect_pr, estimate_one_rm, score_set, ExistingEventInfo, LoggingMode,
    PrResult, PrType, SetPayload,
};
pub use strategy::{generate_suggestions, PlanSuggestion, Planner, PlannerKind, StrengthPlanner};
pub use time_policy::{round_to_local_day, round_to_local_week};
