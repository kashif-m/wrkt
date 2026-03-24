//! Core intermediate representation shared across tracker engine crates.
//!
//! The types in this crate stay domain agnostic and encode the deterministic API surface of the
//! engine: tracker definitions, normalized events, query inputs, and output envelopes.

use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use std::collections::{BTreeMap, BTreeSet};
use std::fmt;

// Error handling modules (Phase 1)
pub mod error;

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

/// Semantic version attached to tracker definitions.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct TrackerVersion {
    pub major: u32,
    pub minor: u32,
    pub patch: u32,
}

impl TrackerVersion {
    pub const fn new(major: u32, minor: u32, patch: u32) -> Self {
        Self {
            major,
            minor,
            patch,
        }
    }
}

impl Default for TrackerVersion {
    fn default() -> Self {
        Self::new(1, 0, 0)
    }
}

/// Schema field type supported by tracker payloads.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub enum FieldType {
    Text,
    Float,
    Int,
    Bool,
    Duration,
    Timestamp,
    Enum(Vec<String>),
}

/// Field specification declared in DSL schema.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct FieldDefinition {
    pub name: String,
    pub field_type: FieldType,
    pub optional: bool,
    pub default_value: Option<Value>,
}

/// Scalar and conditional expression model used by derives/metrics/alerts.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub enum Expression {
    Number(f64),
    Int(i64),
    Bool(bool),
    Text(String),
    Null,
    Field(String),
    Binary {
        op: BinaryOperator,
        left: Box<Expression>,
        right: Box<Expression>,
    },
    Conditional {
        condition: Box<Condition>,
        then_expr: Box<Expression>,
        else_expr: Box<Expression>,
    },
    Function {
        name: String,
        args: Vec<Expression>,
    },
}

#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
pub enum BinaryOperator {
    Add,
    Sub,
    Mul,
    Div,
    Mod,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub enum Condition {
    True,
    False,
    Comparison {
        op: ComparisonOperator,
        left: Box<Expression>,
        right: Box<Expression>,
    },
    And(Vec<Condition>),
    Or(Vec<Condition>),
    Not(Box<Condition>),
}

#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
pub enum ComparisonOperator {
    Eq,
    Neq,
    Gt,
    Gte,
    Lt,
    Lte,
}

/// Derived field declaration.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct DeriveDefinition {
    pub name: String,
    pub expr: Expression,
}

/// Supported time grains for aggregations.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum TimeGrain {
    Day,
    Week,
    Month,
    Quarter,
    Year,
    AllTime,
    Custom,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum AggregationFunc {
    Sum,
    Max,
    Min,
    Avg,
    Count,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub enum GroupByDimension {
    Field(String),
    Time(TimeGrain),
}

/// Aggregation declared for one metric.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct AggregationDefinition {
    pub func: AggregationFunc,
    pub target: Option<Expression>,
    pub group_by: Vec<GroupByDimension>,
    pub over: Option<TimeGrain>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct MetricDefinition {
    pub name: String,
    pub aggregation: AggregationDefinition,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct AlertDefinition {
    pub name: String,
    pub expr: Expression,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct PlanningStrategyDefinition {
    pub name: String,
    pub params: BTreeMap<String, Value>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, Default)]
pub struct PlanningDefinition {
    pub strategies: Vec<PlanningStrategyDefinition>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct ViewDefinition {
    pub name: String,
    pub params: BTreeMap<String, Value>,
}

/// Result of compiling tracker DSL into validated IR.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct TrackerDefinition {
    tracker_id: TrackerId,
    tracker_name: String,
    version: TrackerVersion,
    dsl: String,
    fields: Vec<FieldDefinition>,
    derives: Vec<DeriveDefinition>,
    metrics: Vec<MetricDefinition>,
    alerts: Vec<AlertDefinition>,
    planning: Option<PlanningDefinition>,
    #[serde(default)]
    views: Vec<ViewDefinition>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct TrackerDefinitionInput {
    pub tracker_name: String,
    pub version: TrackerVersion,
    pub dsl: String,
    pub fields: Vec<FieldDefinition>,
    pub derives: Vec<DeriveDefinition>,
    pub metrics: Vec<MetricDefinition>,
    pub alerts: Vec<AlertDefinition>,
    pub planning: Option<PlanningDefinition>,
    #[serde(default)]
    pub views: Vec<ViewDefinition>,
}

impl TrackerDefinition {
    pub fn new(input: TrackerDefinitionInput) -> Self {
        let TrackerDefinitionInput {
            tracker_name,
            version,
            dsl,
            fields,
            derives,
            metrics,
            alerts,
            planning,
            views,
        } = input;
        let tracker_id = build_tracker_id(&tracker_name, version, &dsl);
        Self {
            tracker_id,
            tracker_name,
            version,
            dsl,
            fields,
            derives,
            metrics,
            alerts,
            planning,
            views,
        }
    }

    pub fn tracker_id(&self) -> &TrackerId {
        &self.tracker_id
    }

    pub fn tracker_name(&self) -> &str {
        &self.tracker_name
    }

    pub fn version(&self) -> TrackerVersion {
        self.version
    }

    pub fn dsl(&self) -> &str {
        &self.dsl
    }

    pub fn fields(&self) -> &[FieldDefinition] {
        &self.fields
    }

    pub fn derives(&self) -> &[DeriveDefinition] {
        &self.derives
    }

    pub fn metrics(&self) -> &[MetricDefinition] {
        &self.metrics
    }

    pub fn alerts(&self) -> &[AlertDefinition] {
        &self.alerts
    }

    pub fn planning(&self) -> Option<&PlanningDefinition> {
        self.planning.as_ref()
    }

    pub fn views(&self) -> &[ViewDefinition] {
        &self.views
    }
}

fn build_tracker_id(name: &str, version: TrackerVersion, dsl: &str) -> TrackerId {
    let hash = blake3::hash(dsl.as_bytes()).to_hex();
    let normalized = name
        .chars()
        .map(|ch| if ch.is_ascii_alphanumeric() { ch } else { '_' })
        .collect::<String>()
        .to_lowercase();
    TrackerId::new(format!("{}_v{}_{}", normalized, version.major, &hash[..8]))
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

    pub fn payload_mut(&mut self) -> &mut Value {
        &mut self.payload
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

/// Engine output returned by stateless compute.
#[derive(Clone, Debug, Serialize, Deserialize, Default)]
pub struct EngineOutput {
    pub total_events: usize,
    pub window_events: usize,
    pub metrics: BTreeMap<String, Value>,
    pub alerts: Vec<Value>,
}

/// Delta emitted by incremental apply/simulate.
#[derive(Clone, Debug, Serialize, Deserialize, Default)]
pub struct EngineOutputDelta {
    pub total_events_delta: isize,
    pub metrics: BTreeMap<String, Value>,
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
