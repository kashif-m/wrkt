//! Workout-specific planning strategies and catalog helpers.

pub mod strategy;
pub use strategy::{generate_suggestions, PlanSuggestion, Planner, PlannerKind, StrengthPlanner};
