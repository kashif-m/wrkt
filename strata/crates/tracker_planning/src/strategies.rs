//! Built-in planning strategies

use super::types::*;
use tracker_ir::{metric_delta, EngineOutput, EngineOutputDelta, NormalizedEvent};

/// Strategy for strength-focused training
pub struct StrengthStrategy {
    pub weight_increment: f64,
    pub rep_increment: i32,
}

impl Default for StrengthStrategy {
    fn default() -> Self {
        Self {
            weight_increment: 2.5,
            rep_increment: 1,
        }
    }
}

impl Strategy for StrengthStrategy {
    fn name(&self) -> &str {
        "strength"
    }

    fn generate_candidates(
        &self,
        baseline: &[NormalizedEvent],
        _config: &PlanningConfig,
    ) -> Vec<Candidate> {
        // Simplified: just duplicate last event with modifications
        if let Some(last) = baseline.last() {
            vec![Candidate::new(vec![last.clone()]).with_metadata("type", "maintain")]
        } else {
            Vec::new()
        }
    }

    fn score(
        &self,
        _baseline: &EngineOutput,
        hypothetical: &EngineOutput,
        _delta: &EngineOutputDelta,
    ) -> f64 {
        // Prioritize max weight
        hypothetical
            .metrics
            .get("max_weight")
            .and_then(|v| v.as_f64())
            .unwrap_or(0.0)
    }

    fn explain(&self, _candidate: &Candidate, score: f64) -> String {
        format!("Increases max weight to {:.1}kg", score)
    }
}

/// Strategy for hypertrophy-focused training  
pub struct HypertrophyStrategy {
    pub set_increment: i32,
    pub rep_range: (i32, i32),
}

impl Default for HypertrophyStrategy {
    fn default() -> Self {
        Self {
            set_increment: 1,
            rep_range: (8, 12),
        }
    }
}

impl Strategy for HypertrophyStrategy {
    fn name(&self) -> &str {
        "hypertrophy"
    }

    fn generate_candidates(
        &self,
        baseline: &[NormalizedEvent],
        _config: &PlanningConfig,
    ) -> Vec<Candidate> {
        // Simplified implementation
        if let Some(last) = baseline.last() {
            vec![Candidate::new(vec![last.clone()])]
        } else {
            Vec::new()
        }
    }

    fn score(
        &self,
        _baseline: &EngineOutput,
        hypothetical: &EngineOutput,
        _delta: &EngineOutputDelta,
    ) -> f64 {
        // Prioritize volume
        hypothetical
            .metrics
            .get("total_volume")
            .and_then(|v| v.as_f64())
            .unwrap_or(0.0)
    }

    fn explain(&self, _candidate: &Candidate, score: f64) -> String {
        format!("Increases total volume by {:.0}", score)
    }
}

/// Strategy for endurance/conditioning training
pub struct EnduranceStrategy {
    pub duration_increment: i32, // seconds
}

impl Default for EnduranceStrategy {
    fn default() -> Self {
        Self {
            duration_increment: 30,
        }
    }
}

impl Strategy for EnduranceStrategy {
    fn name(&self) -> &str {
        "endurance"
    }

    fn generate_candidates(
        &self,
        baseline: &[NormalizedEvent],
        _config: &PlanningConfig,
    ) -> Vec<Candidate> {
        if let Some(last) = baseline.last() {
            vec![Candidate::new(vec![last.clone()])]
        } else {
            Vec::new()
        }
    }

    fn score(
        &self,
        _baseline: &EngineOutput,
        hypothetical: &EngineOutput,
        _delta: &EngineOutputDelta,
    ) -> f64 {
        // Prioritize duration
        hypothetical
            .metrics
            .get("total_duration")
            .and_then(|v| v.as_f64())
            .unwrap_or(0.0)
    }

    fn explain(&self, _candidate: &Candidate, score: f64) -> String {
        format!("Increases duration by {:.0} seconds", score)
    }
}
