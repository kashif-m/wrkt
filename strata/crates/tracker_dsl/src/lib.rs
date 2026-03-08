//! tracker_dsl - parser and semantic validator for tracker DSL.

use serde::Deserialize;
use tracker_ir::error::{ErrorCode, TrackerError, TrackerResult};
use tracker_ir::TrackerDefinition;

pub mod ast;
pub mod parser;

pub use ast::*;

/// Parse DSL string and compile to validated TrackerDefinition.
pub fn compile(input: &str) -> TrackerResult<TrackerDefinition> {
    let ast = parser::parse_tracker(input)?;
    validate_semantics(&ast)?;

    Ok(TrackerDefinition::new(
        ast.name,
        ast.version,
        input,
        ast.fields,
        ast.derives,
        ast.metrics,
        ast.alerts,
        ast.planning,
        ast.views,
    ))
}

/// Parse DSL into AST (without full semantic validation).
pub fn parse(input: &str) -> TrackerResult<TrackerAst> {
    parser::parse_tracker(input)
}

fn validate_semantics(ast: &TrackerAst) -> TrackerResult<()> {
    // Field uniqueness.
    let mut field_names = std::collections::BTreeSet::new();
    for field in &ast.fields {
        if !field_names.insert(field.name.clone()) {
            return Err(TrackerError::new_simple(
                ErrorCode::DslInvalidExpression,
                format!("duplicate field definition: {}", field.name),
            ));
        }
    }

    // Derive uniqueness and cycles (simple self-reference guard).
    let mut derive_names = std::collections::BTreeSet::new();
    for derive in &ast.derives {
        if !derive_names.insert(derive.name.clone()) {
            return Err(TrackerError::new_simple(
                ErrorCode::DslInvalidExpression,
                format!("duplicate derive definition: {}", derive.name),
            ));
        }
        if references_ident(&derive.expr, &derive.name) {
            return Err(TrackerError::new_simple(
                ErrorCode::CircularDependency,
                format!("derive '{}' references itself", derive.name),
            ));
        }
    }

    // Metric uniqueness.
    let mut metric_names = std::collections::BTreeSet::new();
    for metric in &ast.metrics {
        if !metric_names.insert(metric.name.clone()) {
            return Err(TrackerError::new_simple(
                ErrorCode::DslInvalidExpression,
                format!("duplicate metric definition: {}", metric.name),
            ));
        }
    }

    // View uniqueness.
    let mut view_names = std::collections::BTreeSet::new();
    for view in &ast.views {
        if !view_names.insert(view.name.clone()) {
            return Err(TrackerError::new_simple(
                ErrorCode::DslInvalidExpression,
                format!("duplicate view definition: {}", view.name),
            ));
        }
    }

    // View config must reference existing metrics by name.
    #[derive(Debug, Deserialize)]
    struct ViewConfig {
        #[serde(default)]
        metrics: std::collections::BTreeMap<String, ViewMetricConfig>,
    }

    #[derive(Debug, Deserialize)]
    struct ViewMetricConfig {
        metric: String,
    }

    let metric_names = ast
        .metrics
        .iter()
        .map(|metric| metric.name.as_str())
        .collect::<std::collections::BTreeSet<_>>();

    for view in &ast.views {
        let Some(config_value) = view.params.get("config") else {
            continue;
        };
        let config: ViewConfig = serde_json::from_value(config_value.clone()).map_err(|err| {
            TrackerError::new_simple(
                ErrorCode::DslInvalidExpression,
                format!("view '{}' has invalid config payload: {}", view.name, err),
            )
        })?;
        for (key, metric) in &config.metrics {
            if !metric_names.contains(metric.metric.as_str()) {
                return Err(TrackerError::new_simple(
                    ErrorCode::DslInvalidExpression,
                    format!(
                        "view '{}' metric key '{}' references unknown metric '{}'",
                        view.name, key, metric.metric
                    ),
                ));
            }
        }
    }

    Ok(())
}

fn references_ident(expr: &tracker_ir::Expression, ident: &str) -> bool {
    use tracker_ir::Expression;
    match expr {
        Expression::Field(name) => name == ident,
        Expression::Binary { left, right, .. } => {
            references_ident(left, ident) || references_ident(right, ident)
        }
        Expression::Conditional {
            condition,
            then_expr,
            else_expr,
        } => {
            references_ident_in_condition(condition, ident)
                || references_ident(then_expr, ident)
                || references_ident(else_expr, ident)
        }
        Expression::Function { args, .. } => args.iter().any(|arg| references_ident(arg, ident)),
        Expression::Number(_)
        | Expression::Int(_)
        | Expression::Bool(_)
        | Expression::Text(_)
        | Expression::Null => false,
    }
}

fn references_ident_in_condition(condition: &tracker_ir::Condition, ident: &str) -> bool {
    use tracker_ir::Condition;
    match condition {
        Condition::Comparison { left, right, .. } => {
            references_ident(left, ident) || references_ident(right, ident)
        }
        Condition::And(parts) | Condition::Or(parts) => parts
            .iter()
            .any(|part| references_ident_in_condition(part, ident)),
        Condition::Not(inner) => references_ident_in_condition(inner, ident),
        Condition::True | Condition::False => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn compile_sample_tracker() {
        let dsl = r#"
        tracker "sample" v1 {
          fields {
            group_key: text
            value_a: float optional
          }
          metrics {
            total_value = sum(value_a) over all_time
          }
          views {
            view "summary" {
              config = {"metrics":{"total_value":{"metric":"total_value"}}}
            }
          }
        }
        "#;
        let def = compile(dsl).expect("compile sample dsl");
        assert_eq!(def.tracker_name(), "sample");
        assert!(!def.fields().is_empty());
        assert!(!def.metrics().is_empty());
        assert!(!def.views().is_empty());
    }

    #[test]
    fn reject_duplicate_fields() {
        let dsl = r#"
        tracker "x" v1 {
          fields {
            value_a: int
            value_a: int
          }
        }
        "#;
        assert!(compile(dsl).is_err());
    }

    #[test]
    fn reject_unknown_view_metric_reference() {
        let dsl = r#"
        tracker "x" v1 {
          fields { value_a: int optional }
          metrics { total_value = sum(value_a) over all_time }
          views {
            view "summary" {
              config = {"metrics":{"foo":{"metric":"missing_metric"}}}
            }
          }
        }
        "#;
        assert!(compile(dsl).is_err());
    }
}
