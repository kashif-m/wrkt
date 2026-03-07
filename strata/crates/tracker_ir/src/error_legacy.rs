//! Legacy error adapter for backward compatibility during transition
//!
//! This module provides adapters to convert between old string-based errors
//! and new structured errors. This is temporary and will be removed in Phase 7.
//!
//! # Usage
//! ```
//! use tracker_ir::error_legacy::LegacyErrorAdapter;
//! use tracker_ir::error::TrackerError;
//!
//! // Convert old string error to new structured error
//! let old_error = "DSL parse error: invalid syntax at line 5";
//! let new_error = LegacyErrorAdapter::adapt(old_error);
//!
//! // Convert back to string for legacy consumers
//! let string_form = LegacyErrorAdapter::to_legacy_string(&new_error);
//! ```

use super::error::{ErrorCode, ErrorSeverity, TrackerError};
use serde_json::json;

/// Adapter for converting between legacy string errors and structured errors
pub struct LegacyErrorAdapter;

impl LegacyErrorAdapter {
    /// Convert a legacy string error to a structured TrackerError
    ///
    /// This uses pattern matching to infer the appropriate error code from
    /// common error message patterns. It's a best-effort conversion.
    pub fn adapt(error_string: &str) -> TrackerError {
        let lower = error_string.to_lowercase();

        // Pattern matching for engine errors
        if lower.contains("dsl parse") {
            TrackerError::new_simple(ErrorCode::DslParseError, error_string).with_context(json!({
                "legacy": true,
                "pattern_matched": "dsl_parse"
            }))
        } else if lower.contains("syntax error") || lower.contains("invalid syntax") {
            TrackerError::new_simple(ErrorCode::DslSyntaxError, error_string).with_context(json!({
                "legacy": true,
                "pattern_matched": "syntax"
            }))
        } else if lower.contains("unknown type") {
            TrackerError::new_simple(ErrorCode::DslUnknownType, error_string).with_context(json!({
                "legacy": true,
                "pattern_matched": "unknown_type"
            }))
        } else if lower.contains("invalid expression") || lower.contains("expression error") {
            TrackerError::new_simple(ErrorCode::DslInvalidExpression, error_string).with_context(
                json!({
                    "legacy": true,
                    "pattern_matched": "expression"
                }),
            )
        } else if lower.contains("event validation") || lower.contains("validation error") {
            TrackerError::new_simple(ErrorCode::EventValidationFailed, error_string).with_context(
                json!({
                    "legacy": true,
                    "pattern_matched": "validation"
                }),
            )
        } else if lower.contains("tracker mismatch") {
            TrackerError::new_simple(ErrorCode::TrackerMismatch, error_string).with_context(json!({
                "legacy": true,
                "pattern_matched": "tracker_mismatch"
            }))
        } else if lower.contains("state mismatch") || lower.contains("state tracker mismatch") {
            TrackerError::new_simple(ErrorCode::StateMismatch, error_string).with_context(json!({
                "legacy": true,
                "pattern_matched": "state_mismatch"
            }))
        } else if lower.contains("field not found") {
            TrackerError::new_simple(ErrorCode::FieldNotFound, error_string).with_context(json!({
                "legacy": true,
                "pattern_matched": "field_not_found"
            }))
        } else if lower.contains("type mismatch") {
            TrackerError::new_simple(ErrorCode::TypeMismatch, error_string).with_context(json!({
                "legacy": true,
                "pattern_matched": "type_mismatch"
            }))
        } else if lower.contains("division by zero") {
            TrackerError::new_simple(ErrorCode::DivisionByZero, error_string).with_context(json!({
                "legacy": true,
                "pattern_matched": "division_by_zero"
            }))
        } else if lower.contains("evaluation error") || lower.contains("evaluation") {
            TrackerError::new_simple(ErrorCode::MetricEvaluationFailed, error_string).with_context(
                json!({
                    "legacy": true,
                    "pattern_matched": "evaluation"
                }),
            )
        } else if lower.contains("aggregation") {
            TrackerError::new_simple(ErrorCode::AggregationError, error_string).with_context(
                json!({
                    "legacy": true,
                    "pattern_matched": "aggregation"
                }),
            )
        } else if lower.contains("catalog") && lower.contains("not found") {
            TrackerError::new_simple(ErrorCode::CatalogEntryNotFound, error_string).with_context(
                json!({
                    "legacy": true,
                    "pattern_matched": "catalog_not_found"
                }),
            )
        } else if lower.contains("catalog") && lower.contains("exists") {
            TrackerError::new_simple(ErrorCode::CatalogEntryExists, error_string).with_context(
                json!({
                    "legacy": true,
                    "pattern_matched": "catalog_exists"
                }),
            )
        } else if lower.contains("serialization") || lower.contains("serialize") {
            TrackerError::new_simple(ErrorCode::SerializationFailed, error_string).with_context(
                json!({
                    "legacy": true,
                    "pattern_matched": "serialization"
                }),
            )
        } else if lower.contains("deserialization") || lower.contains("deserialize") {
            TrackerError::new_simple(ErrorCode::DeserializationFailed, error_string).with_context(
                json!({
                    "legacy": true,
                    "pattern_matched": "deserialization"
                }),
            )
        } else if lower.contains("planning") && lower.contains("baseline") {
            TrackerError::new_simple(ErrorCode::PlanningNoBaseline, error_string).with_context(
                json!({
                    "legacy": true,
                    "pattern_matched": "planning_baseline"
                }),
            )
        } else if lower.contains("planning") && lower.contains("strategy") {
            TrackerError::new_simple(ErrorCode::PlanningInvalidStrategy, error_string).with_context(
                json!({
                    "legacy": true,
                    "pattern_matched": "planning_strategy"
                }),
            )
        } else if lower.contains("sqlite") || lower.contains("database") {
            TrackerError::new_simple(ErrorCode::SqliteError, error_string)
                .with_severity(ErrorSeverity::Fatal)
                .with_context(json!({
                    "legacy": true,
                    "pattern_matched": "sqlite"
                }))
        } else if lower.contains("io error") || lower.contains("file") {
            TrackerError::new_simple(ErrorCode::FileIoError, error_string)
                .with_severity(ErrorSeverity::Fatal)
                .with_context(json!({
                    "legacy": true,
                    "pattern_matched": "io"
                }))
        } else {
            // Unknown error pattern
            TrackerError::new_simple(ErrorCode::Unknown, error_string).with_context(json!({
                "legacy": true,
                "pattern_matched": null,
                "unmapped": true
            }))
        }
    }

    /// Convert a structured TrackerError to legacy string format
    ///
    /// Format: "[CODE] message" or just "message" for simple compatibility
    pub fn to_legacy_string(error: &TrackerError) -> String {
        // Include code in brackets for better debugging, but keep message clear
        format!("[{}] {}", error.code as u16, error.message)
    }

    /// Convert to minimal legacy format (just message, no code)
    pub fn to_legacy_string_minimal(error: &TrackerError) -> String {
        error.message.clone()
    }

    /// Check if a string looks like a legacy error (not JSON)
    pub fn is_legacy_error(s: &str) -> bool {
        let trimmed = s.trim_start();
        // Legacy errors don't start with { (JSON)
        !trimmed.starts_with('{')
    }

    /// Check if a string looks like a new structured error (JSON)
    pub fn is_structured_error(s: &str) -> bool {
        let trimmed = s.trim_start();
        trimmed.starts_with('{') && trimmed.contains("code")
    }

    /// Attempt to parse either format
    pub fn parse_any(s: &str) -> Result<TrackerError, String> {
        if Self::is_structured_error(s) {
            TrackerError::from_json(s).map_err(|e| format!("JSON parse error: {}", e))
        } else if Self::is_legacy_error(s) {
            Ok(Self::adapt(s))
        } else {
            Err("Unrecognized error format".to_string())
        }
    }

    /// Convert EvalError patterns to TrackerError
    ///
    /// This is specifically for tracker_eval crate errors
    pub fn from_eval_error(error: &str) -> TrackerError {
        let lower = error.to_lowercase();

        if lower.contains("field not found") {
            TrackerError::new_simple(ErrorCode::FieldNotFound, error).with_context(json!({
                "legacy": true,
                "source": "eval"
            }))
        } else if lower.contains("type mismatch") {
            TrackerError::new_simple(ErrorCode::TypeMismatch, error).with_context(json!({
                "legacy": true,
                "source": "eval"
            }))
        } else if lower.contains("division by zero") {
            TrackerError::new_simple(ErrorCode::DivisionByZero, error).with_context(json!({
                "legacy": true,
                "source": "eval"
            }))
        } else {
            TrackerError::new_simple(ErrorCode::ExpressionError, error).with_context(json!({
                "legacy": true,
                "source": "eval",
                "unmapped": true
            }))
        }
    }
}

/// Convenience trait for converting errors
pub trait IntoTrackerError {
    fn into_tracker_error(self) -> TrackerError;
}

impl IntoTrackerError for &str {
    fn into_tracker_error(self) -> TrackerError {
        LegacyErrorAdapter::adapt(self)
    }
}

impl IntoTrackerError for String {
    fn into_tracker_error(self) -> TrackerError {
        LegacyErrorAdapter::adapt(&self)
    }
}

/// Helper functions for common conversions
pub mod helpers {
    use super::*;

    /// Convert a Result with string error to TrackerResult
    pub fn lift_string_result<T>(
        result: Result<T, String>,
    ) -> super::super::error::TrackerResult<T> {
        match result {
            Ok(value) => Ok(value),
            Err(s) => Err(LegacyErrorAdapter::adapt(&s)),
        }
    }

    /// Convert a Result with &str error to TrackerResult
    pub fn lift_str_result<T>(result: Result<T, &str>) -> super::super::error::TrackerResult<T> {
        match result {
            Ok(value) => Ok(value),
            Err(s) => Err(LegacyErrorAdapter::adapt(s)),
        }
    }

    /// Convert Option to TrackerResult with error message
    pub fn ok_or_tracker<T>(
        opt: Option<T>,
        code: ErrorCode,
        message: &str,
    ) -> super::super::error::TrackerResult<T> {
        match opt {
            Some(value) => Ok(value),
            None => Err(TrackerError::new_simple(code, message)),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::super::error::ErrorCode;
    use super::*;

    #[test]
    fn adapt_dsl_parse_error() {
        let legacy = "DSL parse error: invalid syntax";
        let error = LegacyErrorAdapter::adapt(legacy);

        assert_eq!(error.code, ErrorCode::DslParseError);
        assert_eq!(error.message, legacy);
        assert_eq!(error.context["legacy"], true);
        assert_eq!(error.context["pattern_matched"], "dsl_parse");
    }

    #[test]
    fn adapt_validation_error() {
        let legacy = "event validation error: missing field 'weight'";
        let error = LegacyErrorAdapter::adapt(legacy);

        assert_eq!(error.code, ErrorCode::EventValidationFailed);
        assert!(error.message.contains("validation"));
    }

    #[test]
    fn adapt_tracker_mismatch() {
        let legacy = "tracker mismatch (expected workout, found finance)";
        let error = LegacyErrorAdapter::adapt(legacy);

        assert_eq!(error.code, ErrorCode::TrackerMismatch);
    }

    #[test]
    fn adapt_division_by_zero() {
        let legacy = "division by zero in expression";
        let error = LegacyErrorAdapter::adapt(legacy);

        assert_eq!(error.code, ErrorCode::DivisionByZero);
        assert!(matches!(error.severity, ErrorSeverity::Fatal));
    }

    #[test]
    fn adapt_unknown_error() {
        let legacy = "something completely unexpected happened";
        let error = LegacyErrorAdapter::adapt(legacy);

        assert_eq!(error.code, ErrorCode::Unknown);
        assert_eq!(error.context["unmapped"], true);
    }

    #[test]
    fn to_legacy_string() {
        let error =
            TrackerError::new_simple(ErrorCode::EventValidationFailed, "test error message");
        let legacy = LegacyErrorAdapter::to_legacy_string(&error);

        assert!(legacy.contains("1100")); // Error code
        assert!(legacy.contains("test error message"));
    }

    #[test]
    fn is_legacy_error_detection() {
        assert!(LegacyErrorAdapter::is_legacy_error("some error message"));
        assert!(LegacyErrorAdapter::is_legacy_error(
            "[1000] error with code"
        ));
        assert!(!LegacyErrorAdapter::is_legacy_error(r#"{"code": 1000}"#));
        assert!(!LegacyErrorAdapter::is_legacy_error("  {\"code\": 1000}"));
    }

    #[test]
    fn is_structured_error_detection() {
        assert!(!LegacyErrorAdapter::is_structured_error("some error"));
        assert!(LegacyErrorAdapter::is_structured_error(r#"{"code":1000}"#));
        assert!(LegacyErrorAdapter::is_structured_error(
            r#"{"code":1000,"message":"test"}"#
        ));
    }

    #[test]
    fn parse_structured_error() {
        let json = r#"{"code":1000,"message":"DSL error","context":{"line":5}}"#;
        let result = LegacyErrorAdapter::parse_any(json);

        if let Err(ref e) = result {
            eprintln!("Parse error: {}", e);
        }
        assert!(result.is_ok(), "Failed to parse: {:?}", result.err());
        let error = result.unwrap();
        assert_eq!(error.code, ErrorCode::DslParseError);
        assert_eq!(error.message, "DSL error");
        assert_eq!(error.context["line"], 5);
    }

    #[test]
    fn parse_legacy_error() {
        let legacy = "DSL parse error at line 10";
        let result = LegacyErrorAdapter::parse_any(legacy);

        assert!(result.is_ok());
        let error = result.unwrap();
        assert_eq!(error.code, ErrorCode::DslParseError);
    }

    #[test]
    fn from_eval_error_field_not_found() {
        let eval_err = "field not found: payload.weight";
        let error = LegacyErrorAdapter::from_eval_error(eval_err);

        assert_eq!(error.code, ErrorCode::FieldNotFound);
        assert_eq!(error.context["source"], "eval");
    }

    #[test]
    fn from_eval_error_type_mismatch() {
        let eval_err = "type mismatch: expected number";
        let error = LegacyErrorAdapter::from_eval_error(eval_err);

        assert_eq!(error.code, ErrorCode::TypeMismatch);
    }

    #[test]
    fn sqlite_error_is_fatal() {
        let legacy = "SQLite error: database locked";
        let error = LegacyErrorAdapter::adapt(legacy);

        assert_eq!(error.code, ErrorCode::SqliteError);
        assert!(matches!(error.severity, ErrorSeverity::Fatal));
    }

    #[test]
    fn into_tracker_error_trait() {
        let error: TrackerError = "test error".into_tracker_error();
        assert_eq!(error.code, ErrorCode::Unknown);

        let error: TrackerError = String::from("test error").into_tracker_error();
        assert_eq!(error.code, ErrorCode::Unknown);
    }
}
