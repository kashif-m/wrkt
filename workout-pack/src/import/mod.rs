use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

pub mod fitnotes;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportWarning {
    pub kind: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportedEvent {
    pub ts: i64,
    pub exercise: String,
    pub reps: Option<i32>,
    pub weight: Option<f64>,
    pub distance: Option<f64>,
    pub duration: Option<f64>,
    pub pr: Option<bool>,
    #[serde(default)]
    pub meta: BTreeMap<String, serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportBundle {
    pub source: String,
    pub exercises: Vec<crate::catalog::ExerciseDefinition>,
    pub events: Vec<ImportedEvent>,
    #[serde(default)]
    pub favorites: Vec<String>,
    #[serde(default)]
    pub warnings: Vec<ImportWarning>,
}
