//! Error adapter for tracker_engine crate
//!
//! This module provides a bridge between the old EngineError and new TrackerError
//! systems during the transition period. It allows gradual migration without
//! breaking existing code.
//!
//! # Usage
//! ```ignore
//! use tracker_engine::error_adapter::{ErrorAdapter, EngineResult};
//!
//! // Function returns both old and new error types
//! pub fn some_function() -> EngineResult<Output> {
//!     // Old code returning EngineError
//!     old_function().map_err(ErrorAdapter::adapt_old)
//! }
//! ```

use std::fmt;
use thiserror::Error;

/// Re-export for convenience
pub use tracker_ir::error::{ErrorCode, ErrorSeverity, TrackerError, TrackerResult};
pub use tracker_ir::error_legacy::LegacyErrorAdapter;

/// Result type that can hold either old or new errors during transition
pub enum EngineResult<T> {
    /// Success with value
    Ok(T),
    /// New structured error
    NewErr(TrackerError),
    /// Legacy error (for backward compatibility)
    LegacyErr(EngineError),
}

impl<T> EngineResult<T> {
    /// Convert to standard Result with TrackerError
    pub fn into_tracker_result(self) -> TrackerResult<T> {
        match self {
            EngineResult::Ok(v) => Ok(v),
            EngineResult::NewErr(e) => Err(e),
            EngineResult::LegacyErr(e) => Err(ErrorAdapter::adapt_old(&e)),
        }
    }

    /// Convert to standard Result with EngineError (legacy)
    pub fn into_legacy_result(self) -> Result<T, EngineError> {
        match self {
            EngineResult::Ok(v) => Ok(v),
            EngineResult::NewErr(e) => Err(ErrorAdapter::to_legacy(&e)),
            EngineResult::LegacyErr(e) => Err(e),
        }
    }

    /// Check if result is Ok
    pub fn is_ok(&self) -> bool {
        matches!(self, EngineResult::Ok(_))
    }

    /// Check if result is an error
    pub fn is_err(&self) -> bool {
        !self.is_ok()
    }
}

/// Re-export the original EngineError for backward compatibility
pub use crate::EngineError;

impl EngineError {
    /// Convert to JSON string for FFI
    pub fn to_json(&self) -> String {
        format!("{{\"error\":\"{}\"}}", self)
    }
}

/// Adapter between old and new error systems
pub struct ErrorAdapter;

impl ErrorAdapter {
    /// Adapt old EngineError to new TrackerError
    pub fn adapt_old(error: &EngineError) -> TrackerError {
        match error {
            EngineError::DslParse(msg) => TrackerError::new_simple(
                ErrorCode::DslParseError,
                format!("DSL parse error: {msg}"),
            )
            .with_context(serde_json::json!({"original": msg})),
            EngineError::EventValidation(msg) => TrackerError::new_simple(
                ErrorCode::EventValidationFailed,
                format!("event validation error: {msg}"),
            )
            .with_context(serde_json::json!({"original": msg})),
            EngineError::TrackerMismatch { expected, actual } => TrackerError::new_simple(
                ErrorCode::TrackerMismatch,
                format!("tracker mismatch (expected {expected}, found {actual})"),
            )
            .with_context(serde_json::json!({
                "expected": expected.as_str(),
                "actual": actual.as_str()
            })),
            EngineError::StateMismatch { expected, actual } => TrackerError::new_simple(
                ErrorCode::StateMismatch,
                format!("state tracker mismatch (expected {expected}, found {actual})"),
            )
            .with_context(serde_json::json!({
                "expected": expected.as_str(),
                "actual": actual.as_str()
            })),
            EngineError::Evaluation(msg) => TrackerError::new_simple(
                ErrorCode::MetricEvaluationFailed,
                format!("evaluation error: {msg}"),
            )
            .with_context(serde_json::json!({"original": msg})),
        }
    }

    /// Convert new TrackerError to old EngineError
    pub fn to_legacy(error: &TrackerError) -> EngineError {
        match error.code {
            ErrorCode::DslParseError
            | ErrorCode::DslSyntaxError
            | ErrorCode::DslInvalidVersion
            | ErrorCode::DslUnknownType
            | ErrorCode::DslInvalidExpression => EngineError::DslParse(error.message.clone()),
            ErrorCode::EventValidationFailed
            | ErrorCode::RequiredFieldMissing
            | ErrorCode::InvalidFieldValue
            | ErrorCode::InvalidTimestamp
            | ErrorCode::InvalidEventId => EngineError::EventValidation(error.message.clone()),
            ErrorCode::TrackerMismatch => {
                // Try to extract from context
                let expected = error
                    .context
                    .get("expected")
                    .and_then(|v| v.as_str())
                    .map(tracker_ir::TrackerId::new)
                    .unwrap_or_else(|| tracker_ir::TrackerId::new("unknown"));
                let actual = error
                    .context
                    .get("actual")
                    .and_then(|v| v.as_str())
                    .map(tracker_ir::TrackerId::new)
                    .unwrap_or_else(|| tracker_ir::TrackerId::new("unknown"));
                EngineError::TrackerMismatch { expected, actual }
            }
            ErrorCode::StateMismatch => {
                let expected = error
                    .context
                    .get("expected")
                    .and_then(|v| v.as_str())
                    .map(tracker_ir::TrackerId::new)
                    .unwrap_or_else(|| tracker_ir::TrackerId::new("unknown"));
                let actual = error
                    .context
                    .get("actual")
                    .and_then(|v| v.as_str())
                    .map(tracker_ir::TrackerId::new)
                    .unwrap_or_else(|| tracker_ir::TrackerId::new("unknown"));
                EngineError::StateMismatch { expected, actual }
            }
            _ => EngineError::Evaluation(error.message.clone()),
        }
    }

    /// Create EngineResult from legacy Result
    pub fn from_legacy<T>(result: Result<T, EngineError>) -> EngineResult<T> {
        match result {
            Ok(v) => EngineResult::Ok(v),
            Err(e) => EngineResult::LegacyErr(e),
        }
    }

    /// Create EngineResult from new Result
    pub fn from_new<T>(result: TrackerResult<T>) -> EngineResult<T> {
        match result {
            Ok(v) => EngineResult::Ok(v),
            Err(e) => EngineResult::NewErr(e),
        }
    }
}

/// Extension trait for Result types
pub trait ResultExt<T> {
    /// Adapt error to TrackerError
    fn adapt_to_tracker(self) -> TrackerResult<T>;

    /// Adapt error to EngineError (legacy)
    fn adapt_to_legacy(self) -> Result<T, EngineError>;
}

impl<T> ResultExt<T> for Result<T, EngineError> {
    fn adapt_to_tracker(self) -> TrackerResult<T> {
        self.map_err(|e| ErrorAdapter::adapt_old(&e))
    }

    fn adapt_to_legacy(self) -> Result<T, EngineError> {
        self
    }
}

impl<T> ResultExt<T> for TrackerResult<T> {
    fn adapt_to_tracker(self) -> TrackerResult<T> {
        self
    }

    fn adapt_to_legacy(self) -> Result<T, EngineError> {
        self.map_err(|e| ErrorAdapter::to_legacy(&e))
    }
}

/// FFI error formatting utilities
pub mod ffi {
    use super::*;

    /// Format error for FFI boundary
    /// Returns JSON string with structured error
    pub fn format_for_ffi(error: &TrackerError) -> String {
        error.to_json()
    }

    /// Format error for FFI (legacy format)
    /// Returns simple string
    pub fn format_for_ffi_legacy(error: &EngineError) -> String {
        error.to_string()
    }

    /// Try to parse error from FFI response
    pub fn parse_from_ffi(json: &str) -> Result<TrackerError, String> {
        if json.trim().starts_with('{') {
            // Try structured format first
            TrackerError::from_json(json).map_err(|e| format!("JSON parse error: {e}"))
        } else {
            // Legacy string format
            Ok(LegacyErrorAdapter::adapt(json))
        }
    }

    /// Check if error is fatal (should abort operation)
    pub fn is_fatal(error: &TrackerError) -> bool {
        matches!(error.severity, ErrorSeverity::Fatal)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tracker_ir::TrackerId;

    #[test]
    fn adapt_dsl_parse_error() {
        let legacy = EngineError::DslParse("invalid syntax".to_string());
        let new = ErrorAdapter::adapt_old(&legacy);

        assert_eq!(new.code, ErrorCode::DslParseError);
        assert!(new.message.contains("invalid syntax"));
        assert_eq!(new.context["original"], "invalid syntax");
    }

    #[test]
    fn adapt_tracker_mismatch() {
        let legacy = EngineError::TrackerMismatch {
            expected: TrackerId::new("workout"),
            actual: TrackerId::new("finance"),
        };
        let new = ErrorAdapter::adapt_old(&legacy);

        assert_eq!(new.code, ErrorCode::TrackerMismatch);
        assert!(new.message.contains("workout"));
        assert!(new.message.contains("finance"));
        assert_eq!(new.context["expected"], "workout");
        assert_eq!(new.context["actual"], "finance");
    }

    #[test]
    fn to_legacy_error() {
        let new = TrackerError::new_simple(ErrorCode::DslParseError, "parse failed");
        let legacy = ErrorAdapter::to_legacy(&new);

        assert!(matches!(legacy, EngineError::DslParse(_)));
        assert!(legacy.to_string().contains("parse failed"));
    }

    #[test]
    fn engine_result_ok() {
        let result: EngineResult<i32> = EngineResult::Ok(42);
        assert!(result.is_ok());
        assert!(!result.is_err());

        let tracker_result = result.into_tracker_result();
        assert_eq!(tracker_result.unwrap(), 42);
    }

    #[test]
    fn engine_result_new_err() {
        let error = TrackerError::new_simple(ErrorCode::FieldNotFound, "missing");
        let result: EngineResult<i32> = EngineResult::NewErr(error);
        assert!(!result.is_ok());
        assert!(result.is_err());

        let tracker_result = result.into_tracker_result();
        assert!(tracker_result.is_err());
        assert_eq!(tracker_result.unwrap_err().code, ErrorCode::FieldNotFound);
    }

    #[test]
    fn engine_result_legacy_err() {
        let error = EngineError::Evaluation("test".to_string());
        let result: EngineResult<i32> = EngineResult::LegacyErr(error);
        assert!(!result.is_ok());
        assert!(result.is_err());

        // Convert to tracker error
        let tracker_result = result.into_tracker_result();
        assert!(tracker_result.is_err());
    }

    #[test]
    fn ffi_format_structured() {
        let error = TrackerError::new_simple(ErrorCode::EventValidationFailed, "validation");
        let json = ffi::format_for_ffi(&error);

        assert!(json.contains("1100")); // Error code
        assert!(json.contains("validation"));
        assert!(json.starts_with('{'));
    }

    #[test]
    fn ffi_parse_structured() {
        let json = r#"{"code":1000,"message":"test","context":{},"severity":"error"}"#;
        let result = ffi::parse_from_ffi(json);

        assert!(result.is_ok());
        let error = result.unwrap();
        assert_eq!(error.code, ErrorCode::DslParseError);
        assert_eq!(error.message, "test");
    }

    #[test]
    fn ffi_parse_legacy() {
        let legacy = "DSL parse error: something wrong";
        let result = ffi::parse_from_ffi(legacy);

        assert!(result.is_ok());
        let error = result.unwrap();
        assert_eq!(error.code, ErrorCode::DslParseError);
    }

    #[test]
    fn result_ext_adapt() {
        let legacy_result: Result<i32, EngineError> =
            Err(EngineError::DslParse("test".to_string()));
        let tracker_result = legacy_result.adapt_to_tracker();

        assert!(tracker_result.is_err());
        assert_eq!(tracker_result.unwrap_err().code, ErrorCode::DslParseError);
    }
}
