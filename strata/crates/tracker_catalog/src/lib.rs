//! tracker_catalog - Generic catalog management system
//!
//! Provides domain-agnostic catalog storage with hybrid JSON/SQLite backend.
//! Used for exercises, categories, tags, and other domain-specific data.

pub mod types;
pub mod storage;
pub mod validation;
pub mod migration;

pub use types::*;
pub use storage::*;
pub use validation::*;
pub use migration::*;

// Re-export error types for convenience
pub use tracker_ir::error::{ErrorCode, TrackerError, TrackerResult};

/// Current catalog version
pub const CATALOG_VERSION_MAJOR: u32 = 1;
pub const CATALOG_VERSION_MINOR: u32 = 0;
pub const CATALOG_VERSION_PATCH: u32 = 0;

/// Get current catalog version
pub fn current_version() -> CatalogVersion {
    CatalogVersion::new(CATALOG_VERSION_MAJOR, CATALOG_VERSION_MINOR, CATALOG_VERSION_PATCH)
}
