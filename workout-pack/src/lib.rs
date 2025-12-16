//! Workout-specific planning strategies and catalog helpers.

pub mod catalog;
pub mod strategy;

pub use catalog::{catalog_slugs, default_catalog, validate_exercise, ExerciseDefinition};
pub use strategy::{generate_suggestions, PlanSuggestion, Planner, PlannerKind, StrengthPlanner};
