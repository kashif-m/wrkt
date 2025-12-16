use serde::{Deserialize, Serialize};
use std::collections::HashSet;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExerciseDefinition {
    pub slug: String,
    pub display_name: String,
    pub primary_muscle_group: String,
    pub secondary_groups: Vec<String>,
    pub modality: Modality,
    pub logging_mode: LoggingMode,
    pub suggested_load_range: LoadRange,
    #[serde(default)]
    pub tags: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Modality {
    Strength,
    Hypertrophy,
    Conditioning,
    Bodyweight,
    Mobility,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LoggingMode {
    Reps,
    RepsWeight,
    TimeDistance,
    DistanceTime,
    Mixed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoadRange {
    pub min: i32,
    pub max: i32,
}

const EXERCISE_CATALOG: &str = include_str!("../config/exercise_catalog.json");

pub fn default_catalog() -> Vec<ExerciseDefinition> {
    serde_json::from_str(EXERCISE_CATALOG).unwrap_or_default()
}

pub fn validate_exercise(entry: &ExerciseDefinition) -> Result<(), String> {
    if entry.slug.trim().is_empty() {
        return Err("slug cannot be empty".into());
    }
    if entry.display_name.trim().is_empty() {
        return Err("display_name cannot be empty".into());
    }
    if entry.suggested_load_range.min < 0 || entry.suggested_load_range.max < 0 {
        return Err("load range must be zero or positive".into());
    }
    if entry.suggested_load_range.min > entry.suggested_load_range.max {
        return Err("load range min cannot exceed max".into());
    }
    if entry.secondary_groups.iter().any(|g| g.trim().is_empty()) {
        return Err("secondary muscle groups cannot be empty".into());
    }
    Ok(())
}

pub fn sanitize_exercise(entry: &ExerciseDefinition) -> ExerciseDefinition {
    let mut clean = entry.clone();
    clean.slug = clean.slug.trim().to_lowercase().replace(' ', "_");
    clean.display_name = clean.display_name.trim().to_string();
    clean
}

pub fn catalog_slugs(entries: &[ExerciseDefinition]) -> HashSet<String> {
    entries.iter().map(|entry| entry.slug.clone()).collect()
}

pub fn catalog_json() -> String {
    serde_json::to_string(&default_catalog()).unwrap_or_else(|_| "[]".into())
}
