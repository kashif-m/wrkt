//! Deterministic tracker engine public API surface.
//!
//! The goal is to expose pure functions that can be called from native or JS runtimes through FFI.

use serde_json::{json, Map, Value};
use std::collections::BTreeMap;
use thiserror::Error;
use tracker_ir::{
    metric_delta, EngineOutput, EngineOutputDelta, EngineState, EventId, NormalizedEvent, Query,
    SimulationOutput, Timestamp, TrackerDefinition, TrackerId,
};

/// Engine-level error codes surfaced across FFI boundaries.
#[derive(Debug, Error)]
pub enum EngineError {
    #[error("DSL parse error: {0}")]
    DslParse(String),
    #[error("event validation error: {0}")]
    EventValidation(String),
    #[error("tracker mismatch (expected {expected}, found {actual})")]
    TrackerMismatch { expected: TrackerId, actual: TrackerId },
    #[error("state tracker mismatch (expected {expected}, found {actual})")]
    StateMismatch { expected: TrackerId, actual: TrackerId },
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
    let value: Value =
        serde_json::from_str(event_json).map_err(|err| EngineError::EventValidation(err.to_string()))?;

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
    let relevant: Vec<&NormalizedEvent> = events
        .iter()
        .filter(|event| event.tracker_id() == def.tracker_id())
        .collect();

    let total_events = relevant.len();
    let window_events = match query.time_window {
        Some(window) => relevant
            .iter()
            .filter(|event| window.contains(event.ts()))
            .count(),
        None => total_events,
    };

    let mut metrics = BTreeMap::new();
    metrics.insert("event_count".into(), json!(total_events));
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

fn ensure_tracker(
    def: &TrackerDefinition,
    tracker_id: &TrackerId,
) -> Result<(), EngineError> {
    if tracker_id != def.tracker_id() {
        return Err(EngineError::TrackerMismatch {
            expected: def.tracker_id().clone(),
            actual: tracker_id.clone(),
        });
    }
    Ok(())
}

fn ensure_state(
    def: &TrackerDefinition,
    state: &EngineState,
) -> Result<(), EngineError> {
    if state.tracker_id() != def.tracker_id() {
        return Err(EngineError::StateMismatch {
            expected: def.tracker_id().clone(),
            actual: state.tracker_id().clone(),
        });
    }
    Ok(())
}

fn ensure_events(
    def: &TrackerDefinition,
    events: &[NormalizedEvent],
) -> Result<(), EngineError> {
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
