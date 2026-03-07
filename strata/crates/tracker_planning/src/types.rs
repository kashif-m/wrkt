//! Planning types

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tracker_ir::{EngineOutput, EngineOutputDelta, NormalizedEvent};

/// A candidate plan (set of hypothetical events)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Candidate {
    pub events: Vec<NormalizedEvent>,
    pub metadata: HashMap<String, serde_json::Value>,
}

impl Candidate {
    pub fn new(events: Vec<NormalizedEvent>) -> Self {
        Self {
            events,
            metadata: HashMap::new(),
        }
    }

    pub fn with_metadata(mut self, key: impl Into<String>, value: impl Serialize) -> Self {
        if let Ok(value) = serde_json::to_value(value) {
            self.metadata.insert(key.into(), value);
        }
        self
    }
}

/// Result of a planning operation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlanResult {
    pub candidate: Candidate,
    pub score: f64,
    pub explanation: String,
    pub delta: EngineOutputDelta,
}

/// Planning configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlanningConfig {
    pub max_candidates: usize,
    pub max_depth: u32,
    pub min_improvement: f64,
}

impl Default for PlanningConfig {
    fn default() -> Self {
        Self {
            max_candidates: 5,
            max_depth: 3,
            min_improvement: 0.01,
        }
    }
}

/// Strategy trait for pluggable planning logic
pub trait Strategy: Send + Sync {
    /// Strategy name
    fn name(&self) -> &str;

    /// Generate candidate events
    fn generate_candidates(
        &self,
        baseline: &[NormalizedEvent],
        config: &PlanningConfig,
    ) -> Vec<Candidate>;

    /// Score a candidate
    fn score(
        &self,
        baseline: &EngineOutput,
        hypothetical: &EngineOutput,
        delta: &EngineOutputDelta,
    ) -> f64;

    /// Generate explanation
    fn explain(&self, candidate: &Candidate, score: f64) -> String;
}
