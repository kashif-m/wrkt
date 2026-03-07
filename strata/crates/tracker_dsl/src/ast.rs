//! AST types for DSL

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrackerAst {
    pub name: String,
    pub version: Version,
    pub fields: Vec<FieldDef>,
    pub derives: Vec<DeriveExpr>,
    pub metrics: Vec<MetricDef>,
    pub alerts: Vec<AlertDef>,
    pub planning: Option<PlanningDef>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Version {
    pub major: u32,
    pub minor: u32,
    pub patch: u32,
}

impl Version {
    pub fn new(major: u32, minor: u32, patch: u32) -> Self {
        Self {
            major,
            minor,
            patch,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FieldDef {
    pub name: String,
    pub ty: FieldType,
    pub default: Option<Expr>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum FieldType {
    String,
    Number,
    Int,
    Bool,
    Duration,
    Timestamp,
    Enum(Vec<String>),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeriveExpr {
    pub name: String,
    pub expr: Expr,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum Expr {
    Literal(Literal),
    FieldRef(String),
    Binary(BinaryOp, Box<Expr>, Box<Expr>),
    Unary(UnaryOp, Box<Expr>),
    Conditional(Box<Condition>, Box<Expr>, Box<Expr>),
    Call(String, Vec<Expr>),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum Literal {
    String(String),
    Number(f64),
    Int(i64),
    Bool(bool),
    Null,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum BinaryOp {
    Add,
    Sub,
    Mul,
    Div,
    Mod,
    Eq,
    Neq,
    Lt,
    Lte,
    Gt,
    Gte,
    And,
    Or,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum UnaryOp {
    Neg,
    Not,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum Condition {
    True,
    False,
    Expr(Box<Expr>),
    And(Vec<Condition>),
    Or(Vec<Condition>),
    Not(Box<Condition>),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MetricDef {
    pub name: String,
    pub aggregation: Aggregation,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Aggregation {
    pub func: AggFunc,
    pub expr: Option<Expr>,
    pub group_by: Vec<GroupBy>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum AggFunc {
    Sum,
    Max,
    Min,
    Avg,
    Count,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum GroupBy {
    Field(String),
    TimeGrain(TimeGrain),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum TimeGrain {
    Day,
    Week,
    Month,
    Quarter,
    Year,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AlertDef {
    pub name: String,
    pub condition: Condition,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlanningDef {
    pub strategies: Vec<String>,
    pub planner_configs: HashMap<String, PlannerConfig>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlannerConfig {
    pub parameters: HashMap<String, Literal>,
}
