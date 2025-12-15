//! Deterministic tracker engine public API surface.
//!
//! The goal is to expose pure functions that can be called from native or JS runtimes through FFI.

use serde_json::{json, Map, Value};
use std::collections::BTreeMap;
use thiserror::Error;
use tracker_eval::{
    evaluate_metrics, AggregationFunc, AggregationSpec, EvalError, GroupExpr, MetricName,
    MetricSpec,
};
use tracker_ir::{
    metric_delta, EngineOutput, EngineOutputDelta, EngineState, EventId, NormalizedEvent, Query,
    SimulationOutput, TimeGrain, Timestamp, TrackerDefinition, TrackerId,
};

/// Engine-level error codes surfaced across FFI boundaries.
#[derive(Debug, Error)]
pub enum EngineError {
    #[error("DSL parse error: {0}")]
    DslParse(String),
    #[error("event validation error: {0}")]
    EventValidation(String),
    #[error("tracker mismatch (expected {expected}, found {actual})")]
    TrackerMismatch {
        expected: TrackerId,
        actual: TrackerId,
    },
    #[error("state tracker mismatch (expected {expected}, found {actual})")]
    StateMismatch {
        expected: TrackerId,
        actual: TrackerId,
    },
    #[error("evaluation error: {0}")]
    Evaluation(String),
}

/// Compiles DSL text into a deterministic tracker definition.
pub fn compile_tracker(dsl: &str) -> Result<TrackerDefinition, EngineError> {
    if dsl.trim().is_empty() {
        return Err(EngineError::DslParse("DSL cannot be empty".into()));
    }
    Ok(TrackerDefinition::from_dsl(dsl))
}

/// Validates and normalizes event JSON against the tracker definition.
pub fn validate_event(
    def: &TrackerDefinition,
    event_json: &str,
) -> Result<NormalizedEvent, EngineError> {
    let value: Value = serde_json::from_str(event_json)
        .map_err(|err| EngineError::EventValidation(err.to_string()))?;

    let event_id = value
        .get("event_id")
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty())
        .ok_or_else(|| EngineError::EventValidation("event_id is required".into()))?;

    let ts = value
        .get("ts")
        .and_then(Value::as_i64)
        .ok_or_else(|| EngineError::EventValidation("ts must be an integer timestamp".into()))?;

    let tracker_id = value
        .get("tracker_id")
        .and_then(Value::as_str)
        .map(TrackerId::new)
        .unwrap_or_else(|| def.tracker_id().clone());

    ensure_tracker(def, &tracker_id)?;

    let payload = ensure_object(value.get("payload"), "payload")?;
    let meta = ensure_object(value.get("meta"), "meta")?;

    Ok(NormalizedEvent::new(
        EventId::new(event_id),
        tracker_id,
        Timestamp::new(ts),
        payload,
        meta,
    ))
}

/// Stateless compute over the provided event slice.
pub fn compute(
    def: &TrackerDefinition,
    events: &[NormalizedEvent],
    query: Query,
) -> Result<EngineOutput, EngineError> {
    ensure_events(def, events)?;
    let relevant: Vec<NormalizedEvent> = events.to_vec();

    let total_events = relevant.len();
    let window_events = match query.time_window {
        Some(window) => relevant
            .iter()
            .filter(|event| window.contains(event.ts()))
            .count(),
        None => total_events,
    };

    let metric_specs = default_metric_specs(&query);
    let mut metrics =
        evaluate_metrics(&metric_specs, &relevant, &query).map_err(EngineError::from)?;
    if query.time_window.is_some() {
        metrics.insert("window_event_count".into(), json!(window_events));
    }

    Ok(EngineOutput {
        total_events,
        window_events,
        metrics,
        ..EngineOutput::default()
    })
}

/// Applies a new normalized event to the engine state and returns metric deltas.
pub fn apply(
    def: &TrackerDefinition,
    state: &mut EngineState,
    event: NormalizedEvent,
) -> Result<EngineOutputDelta, EngineError> {
    ensure_tracker(def, event.tracker_id())?;
    ensure_state(def, state)?;
    let prev_total = state.total_events() as isize;
    let ts = event.ts().as_millis();
    let event_id = event.event_id().as_str().to_owned();

    state.push(event);

    let mut metrics = BTreeMap::new();
    metrics.insert("last_event_ms".into(), json!(ts));
    metrics.insert("last_event_id".into(), json!(event_id));

    Ok(EngineOutputDelta {
        total_events_delta: state.total_events() as isize - prev_total,
        window_events_delta: 0,
        metrics,
    })
}

/// Simulates hypothetical events by comparing outputs for base vs. augmented logs.
pub fn simulate(
    def: &TrackerDefinition,
    base_events: &[NormalizedEvent],
    hypothetical_events: &[NormalizedEvent],
    query: Query,
) -> Result<SimulationOutput, EngineError> {
    ensure_events(def, hypothetical_events)?;
    let base_output = compute(def, base_events, query.clone())?;
    let mut future = base_events.to_vec();
    future.extend_from_slice(hypothetical_events);
    let hypothetical_output = compute(def, &future, query)?;

    let delta = EngineOutputDelta {
        total_events_delta: hypothetical_output.total_events as isize
            - base_output.total_events as isize,
        window_events_delta: hypothetical_output.window_events as isize
            - base_output.window_events as isize,
        metrics: metric_delta(&base_output.metrics, &hypothetical_output.metrics),
    };

    Ok(SimulationOutput {
        base: base_output,
        hypothetical: hypothetical_output,
        delta,
    })
}

fn ensure_tracker(def: &TrackerDefinition, tracker_id: &TrackerId) -> Result<(), EngineError> {
    if tracker_id != def.tracker_id() {
        return Err(EngineError::TrackerMismatch {
            expected: def.tracker_id().clone(),
            actual: tracker_id.clone(),
        });
    }
    Ok(())
}

fn ensure_state(def: &TrackerDefinition, state: &EngineState) -> Result<(), EngineError> {
    if state.tracker_id() != def.tracker_id() {
        return Err(EngineError::StateMismatch {
            expected: def.tracker_id().clone(),
            actual: state.tracker_id().clone(),
        });
    }
    Ok(())
}

fn ensure_events(def: &TrackerDefinition, events: &[NormalizedEvent]) -> Result<(), EngineError> {
    for event in events {
        ensure_tracker(def, event.tracker_id())?;
    }
    Ok(())
}

fn ensure_object(value: Option<&Value>, label: &str) -> Result<Value, EngineError> {
    match value {
        Some(Value::Object(map)) => Ok(Value::Object(map.clone())),
        Some(Value::Null) | None => Ok(Value::Object(Map::new())),
        _ => Err(EngineError::EventValidation(format!(
            "{label} must be a JSON object"
        ))),
    }
}

fn default_metric_specs(query: &Query) -> Vec<MetricSpec> {
    let mut specs = vec![MetricSpec {
        name: MetricName::new("event_count"),
        aggregation: AggregationSpec {
            func: AggregationFunc::Count,
            target: None,
            filter: None,
            group_by: vec![],
        },
    }];

    if let Some(grain) = query.grains.first() {
        let name = format!("events_by_{}", grain_label(*grain));
        specs.push(MetricSpec {
            name: MetricName::new(name),
            aggregation: AggregationSpec {
                func: AggregationFunc::Count,
                target: None,
                filter: None,
                group_by: vec![GroupExpr::Time(*grain)],
            },
        });
    }

    specs
}

fn grain_label(grain: TimeGrain) -> &'static str {
    match grain {
        TimeGrain::Day => "day",
        TimeGrain::Week => "week",
        TimeGrain::Month => "month",
        TimeGrain::Quarter => "quarter",
        TimeGrain::Year => "year",
        TimeGrain::AllTime => "all_time",
        TimeGrain::Custom => "custom",
    }
}

impl From<EvalError> for EngineError {
    fn from(value: EvalError) -> Self {
        EngineError::Evaluation(value.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use tracker_ir::{EventId, NormalizedEvent, Timestamp};

    fn sample_event(tracker_id: &TrackerId, ts: i64, weight: i64) -> NormalizedEvent {
        NormalizedEvent::new(
            EventId::new(format!("event-{ts}")),
            tracker_id.clone(),
            Timestamp::new(ts),
            json!({"weight": weight}),
            json!({}),
        )
    }

    fn sample_definition() -> TrackerDefinition {
        TrackerDefinition::from_dsl("tracker workout v1 { fields {} }")
    }

    #[test]
    fn compute_is_deterministic_across_runs() {
        let def = sample_definition();
        let tracker_id = def.tracker_id().clone();
        let mut events = vec![
            sample_event(&tracker_id, 1_000, 60),
            sample_event(&tracker_id, 2_000, 65),
            sample_event(&tracker_id, 3_000, 70),
        ];
        let query = Query {
            time_window: None,
            grains: vec![TimeGrain::Day],
        };

        let first = compute(&def, &events, query.clone()).expect("first compute");
        events.reverse();
        let second = compute(&def, &events, query).expect("second compute");

        assert_eq!(first.total_events, second.total_events);
        assert_eq!(first.metrics, second.metrics);
    }

    #[test]
    fn simulate_matches_direct_computation() {
        let def = sample_definition();
        let tracker_id = def.tracker_id().clone();
        let base = vec![
            sample_event(&tracker_id, 1_000, 60),
            sample_event(&tracker_id, 2_000, 65),
        ];
        let hypothetical = vec![sample_event(&tracker_id, 3_000, 70)];
        let query = Query {
            time_window: None,
            grains: vec![],
        };

        let base_output = compute(&def, &base, query.clone()).expect("base compute");
        let hypo_events = {
            let mut all = base.clone();
            all.extend_from_slice(&hypothetical);
            all
        };
        let hypo_output = compute(&def, &hypo_events, query.clone()).expect("hypo compute");

        let sim = simulate(&def, &base, &hypothetical, query).expect("simulation");

        assert_eq!(sim.base.metrics, base_output.metrics);
        assert_eq!(sim.hypothetical.metrics, hypo_output.metrics);
        assert_eq!(
            sim.delta.metrics,
            metric_delta(&base_output.metrics, &hypo_output.metrics)
        );
    }
}
