//! Parser implementation

use super::ast::*;
use super::TrackerResult;

/// Parse version string like "v1.2.3"
pub fn parse_version(s: &str) -> Option<Version> {
    let s = s.trim_start_matches('v');
    let parts: Vec<&str> = s.split('.').collect();
    if parts.len() < 2 {
        return None;
    }
    Some(Version::new(
        parts[0].parse().ok()?,
        parts[1].parse().ok()?,
        parts.get(2).and_then(|s| s.parse().ok()).unwrap_or(0),
    ))
}
