//! tracker_planning - Generic planning and simulation engine
//!
//! Provides framework for generating suggestions and running simulations.

pub mod types;
pub mod engine;
pub mod strategies;

pub use types::*;
pub use engine::*;
pub use strategies::*;

// Re-export error types
pub use tracker_ir::error::{ErrorCode, TrackerError, TrackerResult};
