//! tracker_dsl - DSL parser for tracker configurations
//!
//! Minimal implementation for now - full pest grammar later

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tracker_ir::error::{ErrorCode, TrackerError, TrackerResult};
use tracker_ir::TrackerDefinition;

pub mod ast;
pub mod parser;

pub use ast::*;
pub use parser::*;

/// Parse DSL string and compile to TrackerDefinition
/// For now, accepts JSON format as interim solution
pub fn compile(input: &str) -> TrackerResult<TrackerDefinition> {
    // Try to parse as JSON first (interim solution)
    if input.trim().starts_with('{') || input.trim().starts_with('[') {
        // JSON input - use existing TrackerDefinition::from_dsl
        return Ok(TrackerDefinition::from_dsl(input));
    }
    
    // Try minimal DSL parsing
    if input.trim().starts_with("tracker") {
        // Basic DSL parsing would go here
        // For now, just create a definition from the raw input
        return Ok(TrackerDefinition::from_dsl(input));
    }
    
    Err(TrackerError::new_simple(
        ErrorCode::DslParseError,
        "Invalid DSL input. Expected 'tracker' keyword or JSON object",
    ))
}

/// Parse only (for testing)
pub fn parse(input: &str) -> TrackerResult<TrackerAst> {
    let def = compile(input)?;
    
    // Create minimal AST
    Ok(TrackerAst {
        name: "tracker".to_string(),
        version: Version::new(1, 0, 0),
        fields: Vec::new(),
        derives: Vec::new(),
        metrics: Vec::new(),
        alerts: Vec::new(),
        planning: None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_compile_json() {
        let json = r#"{"tracker_id": "workout", "version": 1}"#;
        let result = compile(json);
        assert!(result.is_ok());
    }

    #[test]
    fn test_compile_dsl_stub() {
        let dsl = "tracker workout v1 { }";
        let result = compile(dsl);
        assert!(result.is_ok());
    }
}
