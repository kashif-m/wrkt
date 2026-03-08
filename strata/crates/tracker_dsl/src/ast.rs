//! AST types for tracker DSL.

use serde::{Deserialize, Serialize};
use tracker_ir::{
    AlertDefinition, DeriveDefinition, FieldDefinition, MetricDefinition, PlanningDefinition,
    TrackerVersion, ViewDefinition,
};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrackerAst {
    pub name: String,
    pub version: TrackerVersion,
    pub fields: Vec<FieldDefinition>,
    pub derives: Vec<DeriveDefinition>,
    pub metrics: Vec<MetricDefinition>,
    pub alerts: Vec<AlertDefinition>,
    pub planning: Option<PlanningDefinition>,
    pub views: Vec<ViewDefinition>,
}
