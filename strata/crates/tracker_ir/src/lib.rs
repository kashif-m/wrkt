//! Core intermediate representation shared across tracker engine crates.
//!
//! The types in this crate stay domain agnostic and encode the deterministic API surface of the
//! engine: tracker definitions, normalized events, query inputs, and output envelopes.

use blake3;
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use std::collections::{BTreeMap, BTreeSet};
use std::fmt;

// Error handling modules (Phase 1)
pub mod error;
pub mod error_legacy;

/// Uniquely identifies a tracker configuration.
#[derive(Clone, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct TrackerId(String);

impl TrackerId {
    pub fn new(value: impl Into<String>) -> Self {
        Self(value.into())
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl fmt::Display for TrackerId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.as_str())
    }
}

/// Uniquely identifies an event appended to a tracker.
#[derive(Clone, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct EventId(String);

impl EventId {
    pub fn new(value: impl Into<String>) -> Self {
        Self(value.into())
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl fmt::Display for EventId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.as_str())
    }
}

/// Timestamp in milliseconds since epoch.
#[derive(Copy, Clone, Debug, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub struct Timestamp(i64);

impl Timestamp {
    pub fn new(epoch_ms: i64) -> Self {
        Self(epoch_ms)
    }

    pub fn as_millis(&self) -> i64 {
        self.0
    }
}

impl From<i64> for Timestamp {
    fn from(value: i64) -> Self {
        Timestamp::new(value)
    }
}

/// Result of compiling a tracker DSL string.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct TrackerDefinition {
    tracker_id: TrackerId,
    dsl: String,
}

impl TrackerDefinition {
    /// Builds a tracker definition directly from DSL text using a deterministic hash as the ID.
    pub fn from_dsl(dsl: &str) -> Self {
        let hash = blake3::hash(dsl.as_bytes()).to_hex();
        let tracker_id = TrackerId::new(format!("tracker_{}", &hash[..12]));
        Self {
            tracker_id,
            dsl: dsl.to_owned(),
        }
    }

    pub fn tracker_id(&self) -> &TrackerId {
        &self.tracker_id
    }

    pub fn dsl(&self) -> &str {
        &self.dsl
    }
}

/// Normalized event shape consumed by the engine.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct NormalizedEvent {
    event_id: EventId,
    tracker_id: TrackerId,
    ts: Timestamp,
    payload: Value,
    meta: Value,
}

impl NormalizedEvent {
    pub fn new(
        event_id: EventId,
        tracker_id: TrackerId,
        ts: Timestamp,
        payload: Value,
        meta: Value,
    ) -> Self {
        Self {
            event_id,
            tracker_id,
            ts,
            payload,
            meta,
        }
    }

    pub fn event_id(&self) -> &EventId {
        &self.event_id
    }

    pub fn tracker_id(&self) -> &TrackerId {
        &self.tracker_id
    }

    pub fn ts(&self) -> Timestamp {
        self.ts
    }

    pub fn payload(&self) -> &Value {
        &self.payload
    }

    pub fn meta(&self) -> &Value {
        &self.meta
    }
}

/// Time window filter applied during compute/simulate queries.
#[derive(Copy, Clone, Debug, Serialize, Deserialize)]
pub struct TimeWindow {
    pub start: Timestamp,
    pub end: Timestamp,
}

impl TimeWindow {
    pub fn contains(&self, ts: Timestamp) -> bool {
        ts >= self.start && ts <= self.end
    }
}

/// Supported time grains for aggregations.
#[derive(Clone, Copy, Debug, Serialize, Deserialize)]
pub enum TimeGrain {
    Day,
    Week,
    Month,
    Quarter,
    Year,
    AllTime,
    Custom,
}

/// Query input for compute/simulate.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct Query {
    pub time_window: Option<TimeWindow>,
    pub grains: Vec<TimeGrain>,
}

/// Mutable state container for incremental engine application.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct EngineState {
    tracker_id: TrackerId,
    events: Vec<NormalizedEvent>,
}

impl EngineState {
    pub fn new(tracker_id: TrackerId) -> Self {
        Self {
            tracker_id,
            events: Vec::new(),
        }
    }

    pub fn for_definition(def: &TrackerDefinition) -> Self {
        Self::new(def.tracker_id().clone())
    }

    pub fn tracker_id(&self) -> &TrackerId {
        &self.tracker_id
    }

    pub fn push(&mut self, event: NormalizedEvent) {
        self.events.push(event);
    }

    pub fn total_events(&self) -> usize {
        self.events.len()
    }

    pub fn events(&self) -> &[NormalizedEvent] {
        &self.events
    }
}

impl EngineState {
    pub fn from_events(tracker_id: TrackerId, events: Vec<NormalizedEvent>) -> Self {
        Self { tracker_id, events }
    }
}

/// Engine output returned by stateless compute.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct EngineOutput {
    pub total_events: usize,
    pub window_events: usize,
    pub metrics: BTreeMap<String, Value>,
    pub prs: Vec<Value>,
    pub alerts: Vec<Value>,
    pub suggestions: Vec<Value>,
}

impl Default for EngineOutput {
    fn default() -> Self {
        Self {
            total_events: 0,
            window_events: 0,
            metrics: BTreeMap::new(),
            prs: Vec::new(),
            alerts: Vec::new(),
            suggestions: Vec::new(),
        }
    }
}

/// Delta emitted by incremental apply/simulate.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct EngineOutputDelta {
    pub total_events_delta: isize,
    pub window_events_delta: isize,
    pub metrics: BTreeMap<String, Value>,
}

impl Default for EngineOutputDelta {
    fn default() -> Self {
        Self {
            total_events_delta: 0,
            window_events_delta: 0,
            metrics: BTreeMap::new(),
        }
    }
}

/// Output returned by planning simulations.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SimulationOutput {
    pub base: EngineOutput,
    pub hypothetical: EngineOutput,
    pub delta: EngineOutputDelta,
}

/// Helper for building deterministic metric maps.
pub fn empty_object() -> Value {
    Value::Object(Map::new())
}

/// Utility to compute delta metrics between two maps.
pub fn metric_delta(
    base: &BTreeMap<String, Value>,
    hypothetical: &BTreeMap<String, Value>,
) -> BTreeMap<String, Value> {
    let mut keys = BTreeSet::new();
    keys.extend(base.keys().cloned());
    keys.extend(hypothetical.keys().cloned());

    let mut delta = BTreeMap::new();
    for key in keys {
        match (base.get(&key), hypothetical.get(&key)) {
            (Some(Value::Number(lhs)), Some(Value::Number(rhs))) => {
                if let (Some(lhs), Some(rhs)) = (lhs.as_f64(), rhs.as_f64()) {
                    delta.insert(key, json!(rhs - lhs));
                }
            }
            (_, Some(value)) => {
                delta.insert(key, value.clone());
            }
            _ => {}
        }
    }
    delta
}
