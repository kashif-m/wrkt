use serde::Serialize;
use serde_json::{json, Value};
use tracker_engine::{self, EngineError};
use tracker_ir::{EventId, NormalizedEvent, Query, Timestamp, TrackerDefinition};

/// Structured suggestion returned to UI.
#[derive(Debug, Serialize)]
pub struct PlanSuggestion {
    pub title: String,
    pub explanation: String,
    pub delta: Value,
}

/// Trait for planners (strength, hypertrophy, conditioning).
pub trait Planner {
    fn suggestions(
        &self,
        def: &TrackerDefinition,
        baseline: &[NormalizedEvent],
    ) -> Result<Vec<PlanSuggestion>, EngineError>;
}

/// Progressive overload for strength-focused exercises.
pub struct StrengthPlanner;

pub struct HypertrophyPlanner;

pub struct ConditioningPlanner;

/// Supported planner kinds.
pub enum PlannerKind {
    Strength,
    Hypertrophy,
    Conditioning,
}

pub fn generate_suggestions(
    kind: PlannerKind,
    def: &TrackerDefinition,
    baseline: &[NormalizedEvent],
) -> Result<Vec<PlanSuggestion>, EngineError> {
    if baseline.is_empty() {
        return Ok(Vec::new());
    }

    match kind {
        PlannerKind::Strength => StrengthPlanner.suggestions(def, baseline),
        PlannerKind::Hypertrophy => HypertrophyPlanner.suggestions(def, baseline),
        PlannerKind::Conditioning => ConditioningPlanner.suggestions(def, baseline),
    }
}

impl StrengthPlanner {
    pub fn new() -> Self {
        Self
    }
}

impl HypertrophyPlanner {
    pub fn new() -> Self {
        Self
    }
}

impl ConditioningPlanner {
    pub fn new() -> Self {
        Self
    }
}

impl Planner for StrengthPlanner {
    fn suggestions(
        &self,
        def: &TrackerDefinition,
        baseline: &[NormalizedEvent],
    ) -> Result<Vec<PlanSuggestion>, EngineError> {
        let mut recs = Vec::new();
        if let Some(last) = recent_strength_event(baseline) {
            if let Some(candidate) = increase_weight_candidate(last, 2.5) {
                if let Some(s) = simulate_candidate(
                    def,
                    baseline,
                    vec![candidate],
                    "Add 2.5 kg",
                    "Small load jump keeps reps steady while nudging est. 1RM upward.",
                )? {
                    recs.push(s);
                }
            }

            if let Some(candidate) = increase_reps_candidate(last, 1) {
                if let Some(s) = simulate_candidate(
                    def,
                    baseline,
                    vec![candidate],
                    "Add 1 rep",
                    "More reps at the same load improves volume while keeping RPE manageable.",
                )? {
                    recs.push(s);
                }
            }
        }
        Ok(recs)
    }
}

impl Planner for HypertrophyPlanner {
    fn suggestions(
        &self,
        def: &TrackerDefinition,
        baseline: &[NormalizedEvent],
    ) -> Result<Vec<PlanSuggestion>, EngineError> {
        let mut recs = Vec::new();
        if let Some(last) = recent_strength_event(baseline) {
            if let Some(candidate) = duplicate_set_candidate(last) {
                if let Some(s) = simulate_candidate(
                    def,
                    baseline,
                    vec![candidate],
                    "Add a set",
                    "Increasing set count boosts weekly volume for hypertrophy.",
                )? {
                    recs.push(s);
                }
            }

            if let Some(candidate) = increase_reps_candidate(last, 2) {
                if let Some(s) = simulate_candidate(
                    def,
                    baseline,
                    vec![candidate],
                    "Stay at weight, +2 reps",
                    "Slight rep bump raises total tonnage without increasing load.",
                )? {
                    recs.push(s);
                }
            }
        }
        Ok(recs)
    }
}

impl Planner for ConditioningPlanner {
    fn suggestions(
        &self,
        def: &TrackerDefinition,
        baseline: &[NormalizedEvent],
    ) -> Result<Vec<PlanSuggestion>, EngineError> {
        let mut recs = Vec::new();
        if let Some(last) = recent_conditioning_event(baseline) {
            if let Some(candidate) = increase_duration_candidate(last, 15) {
                if let Some(s) = simulate_candidate(
                    def,
                    baseline,
                    vec![candidate],
                    "+15 sec duration",
                    "Longer work intervals improve conditioning density.",
                )? {
                    recs.push(s);
                }
            }

            if let Some(candidate) = increase_distance_candidate(last, 100.0) {
                if let Some(s) = simulate_candidate(
                    def,
                    baseline,
                    vec![candidate],
                    "+100 m distance",
                    "Expanding total distance builds endurance capacity.",
                )? {
                    recs.push(s);
                }
            }
        }
        Ok(recs)
    }
}

fn recent_strength_event(events: &[NormalizedEvent]) -> Option<&NormalizedEvent> {
    events
        .iter()
        .rev()
        .find(|event| event.payload().get("weight").is_some())
}

fn recent_conditioning_event(events: &[NormalizedEvent]) -> Option<&NormalizedEvent> {
    events.iter().rev().find(|event| {
        event.payload().get("duration_sec").is_some() || event.payload().get("distance_m").is_some()
    })
}

fn increase_weight_candidate(event: &NormalizedEvent, delta: f64) -> Option<NormalizedEvent> {
    let payload = event.payload().clone();
    let mut payload_obj = payload.as_object()?.clone();
    let weight = payload_obj.get("weight")?.as_f64()?;
    payload_obj.insert("weight".into(), json!(weight + delta));
    Some(clone_event_with_payload(event, Value::Object(payload_obj)))
}

fn increase_reps_candidate(event: &NormalizedEvent, delta: i64) -> Option<NormalizedEvent> {
    let payload = event.payload().clone();
    let mut payload_obj = payload.as_object()?.clone();
    let reps = payload_obj.get("reps")?.as_i64()?;
    payload_obj.insert("reps".into(), json!(reps + delta));
    Some(clone_event_with_payload(event, Value::Object(payload_obj)))
}

fn clone_event_with_payload(event: &NormalizedEvent, payload: Value) -> NormalizedEvent {
    NormalizedEvent::new(
        EventId::new(format!("{}-cand", event.event_id().as_str())),
        event.tracker_id().clone(),
        Timestamp::new(event.ts().as_millis()),
        payload,
        event.meta().clone(),
    )
}

fn duplicate_set_candidate(event: &NormalizedEvent) -> Option<NormalizedEvent> {
    Some(clone_event_with_payload(event, event.payload().clone()))
}

fn increase_duration_candidate(event: &NormalizedEvent, delta: i64) -> Option<NormalizedEvent> {
    let payload = event.payload().clone();
    let mut payload_obj = payload.as_object()?.clone();
    let duration = payload_obj.get("duration_sec")?.as_i64()?;
    payload_obj.insert("duration_sec".into(), json!(duration + delta));
    Some(clone_event_with_payload(event, Value::Object(payload_obj)))
}

fn increase_distance_candidate(event: &NormalizedEvent, delta: f64) -> Option<NormalizedEvent> {
    let payload = event.payload().clone();
    let mut payload_obj = payload.as_object()?.clone();
    let distance = payload_obj.get("distance_m")?.as_f64()?;
    payload_obj.insert("distance_m".into(), json!(distance + delta));
    Some(clone_event_with_payload(event, Value::Object(payload_obj)))
}

fn simulate_candidate(
    def: &TrackerDefinition,
    baseline: &[NormalizedEvent],
    hypotheticals: Vec<NormalizedEvent>,
    title: &str,
    explanation: &str,
) -> Result<Option<PlanSuggestion>, EngineError> {
    if hypotheticals.is_empty() {
        return Ok(None);
    }

    let query = Query::default();
    let sim = tracker_engine::simulate(def, baseline, &hypotheticals, query)?;
    if sim.delta.metrics.is_empty() {
        return Ok(None);
    }

    let delta = match serde_json::to_value(sim.delta.metrics) {
        Ok(value) => value,
        Err(_) => Value::Null,
    };

    Ok(Some(PlanSuggestion {
        title: title.to_string(),
        explanation: explanation.to_string(),
        delta,
    }))
}
