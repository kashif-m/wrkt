//! Planning engine

use super::types::*;
use super::TrackerResult;
use tracker_engine::{self, compute};
use tracker_ir::{EngineOutput, EngineOutputDelta, Query, TrackerDefinition};

/// Planning engine that runs strategies
pub struct PlanningEngine {
    strategies: Vec<Box<dyn Strategy>>,
    config: PlanningConfig,
}

impl PlanningEngine {
    pub fn new(config: PlanningConfig) -> Self {
        Self {
            strategies: Vec::new(),
            config,
        }
    }

    pub fn with_strategy(mut self, strategy: Box<dyn Strategy>) -> Self {
        self.strategies.push(strategy);
        self
    }

    /// Generate suggestions using all registered strategies
    pub fn suggest(
        &self,
        def: &TrackerDefinition,
        baseline: &[tracker_ir::NormalizedEvent],
    ) -> TrackerResult<Vec<PlanResult>> {
        if baseline.is_empty() {
            return Ok(Vec::new());
        }

        let mut all_results = Vec::new();

        for strategy in &self.strategies {
            let candidates = strategy.generate_candidates(baseline, &self.config);
            let results =
                self.evaluate_candidates(def, baseline, &candidates, strategy.as_ref())?;
            all_results.extend(results);
        }

        // Sort by score descending
        all_results.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap());

        // Take top N
        let count = all_results.len().min(self.config.max_candidates);
        all_results.truncate(count);

        Ok(all_results)
    }

    fn evaluate_candidates(
        &self,
        def: &TrackerDefinition,
        baseline: &[tracker_ir::NormalizedEvent],
        candidates: &[Candidate],
        strategy: &dyn Strategy,
    ) -> TrackerResult<Vec<PlanResult>> {
        let query = Query::default();
        let base_output = compute(def, baseline, query.clone()).map_err(|e| {
            super::TrackerError::new_simple(
                tracker_ir::error::ErrorCode::PlanningSimulationFailed,
                format!("Failed to compute baseline: {}", e),
            )
        })?;

        let mut results = Vec::new();

        for candidate in candidates {
            let mut all_events = baseline.to_vec();
            all_events.extend(candidate.events.clone());

            let hypothetical = compute(def, &all_events, query.clone()).map_err(|e| {
                super::TrackerError::new_simple(
                    tracker_ir::error::ErrorCode::PlanningSimulationFailed,
                    format!("Failed to compute hypothetical: {}", e),
                )
            })?;

            let delta = tracker_ir::metric_delta(&base_output.metrics, &hypothetical.metrics);

            let score = strategy.score(
                &base_output,
                &hypothetical,
                &EngineOutputDelta {
                    total_events_delta: candidate.events.len() as isize,
                    window_events_delta: candidate.events.len() as isize,
                    metrics: delta,
                },
            );

            if score > self.config.min_improvement {
                results.push(PlanResult {
                    candidate: candidate.clone(),
                    score,
                    explanation: strategy.explain(candidate, score),
                    delta: EngineOutputDelta {
                        total_events_delta: candidate.events.len() as isize,
                        window_events_delta: candidate.events.len() as isize,
                        metrics: tracker_ir::metric_delta(
                            &base_output.metrics,
                            &hypothetical.metrics,
                        ),
                    },
                });
            }
        }

        Ok(results)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tracker_ir::NormalizedEvent;

    struct TestStrategy;

    impl Strategy for TestStrategy {
        fn name(&self) -> &str {
            "test"
        }

        fn generate_candidates(
            &self,
            _baseline: &[NormalizedEvent],
            _config: &PlanningConfig,
        ) -> Vec<Candidate> {
            Vec::new()
        }

        fn score(
            &self,
            _baseline: &EngineOutput,
            _hypothetical: &EngineOutput,
            _delta: &EngineOutputDelta,
        ) -> f64 {
            1.0
        }

        fn explain(&self, _candidate: &Candidate, _score: f64) -> String {
            "Test suggestion".to_string()
        }
    }

    #[test]
    fn planning_engine_creation() {
        let engine =
            PlanningEngine::new(PlanningConfig::default()).with_strategy(Box::new(TestStrategy));

        // Just verify it builds
        assert!(engine.strategies.len() == 1);
    }
}
