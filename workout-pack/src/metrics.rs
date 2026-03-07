//! Workout-specific metric calculations.
//!
//! These functions compute fitness metrics like estimated 1RM, personal records,
//! and set scores based on different logging modes.

use serde::{Deserialize, Serialize};
use serde_json::Value;

// Consolidated LoggingMode from catalog module
pub use crate::catalog::LoggingMode;

/// Epley formula for estimating one-rep max from weight and reps.
///
/// Formula: 1RM = weight × (1 + reps / 30)
///
/// # Arguments
/// * `weight` - Weight lifted
/// * `reps` - Number of repetitions performed
///
/// # Returns
/// Estimated one-rep max
pub fn estimate_one_rm(weight: f64, reps: i32) -> f64 {
    if reps <= 0 {
        return weight;
    }
    weight * (1.0 + reps as f64 / 30.0)
}

/// Result of PR (personal record) detection.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PrResult {
    pub is_pr: bool,
    pub pr_type: Option<PrType>,
    pub previous_best: Option<f64>,
    pub new_value: f64,
    pub improvement: Option<f64>,
}

/// Type of personal record achieved.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PrType {
    Weight,
    Reps,
    EstimatedOneRm,
    Volume,
    Duration,
    Distance,
}

/// Detects if a set is a personal record compared to historical events.
///
/// # Arguments
/// * `exercise` - Exercise name to filter events
/// * `events` - Historical events as JSON array
/// * `new_weight` - Weight of new set (optional)
/// * `new_reps` - Reps of new set (optional)
///
/// # Returns
/// PR detection result
pub fn detect_pr(
    exercise: &str,
    events: &[Value],
    new_weight: Option<f64>,
    new_reps: Option<i32>,
) -> PrResult {
    let mut best_1rm: Option<f64> = None;

    // Find best estimated 1RM for this exercise
    for event in events {
        let payload = match event.get("payload") {
            Some(p) => p,
            None => continue,
        };

        let event_exercise = payload
            .get("exercise")
            .and_then(|e| e.as_str())
            .unwrap_or("");

        if event_exercise != exercise {
            continue;
        }

        let weight = payload.get("weight").and_then(|w| w.as_f64());
        let reps = payload
            .get("reps")
            .and_then(|r| r.as_i64())
            .map(|r| r as i32);

        if let (Some(w), Some(r)) = (weight, reps) {
            let est_1rm = estimate_one_rm(w, r);
            best_1rm = Some(best_1rm.map_or(est_1rm, |best| best.max(est_1rm)));
        }
    }

    // Calculate new 1RM
    let new_1rm = match (new_weight, new_reps) {
        (Some(w), Some(r)) => estimate_one_rm(w, r),
        (Some(w), None) => w,
        _ => {
            return PrResult {
                is_pr: false,
                pr_type: None,
                previous_best: best_1rm,
                new_value: 0.0,
                improvement: None,
            };
        }
    };

    // Compare
    match best_1rm {
        Some(best) if new_1rm > best => PrResult {
            is_pr: true,
            pr_type: Some(PrType::EstimatedOneRm),
            previous_best: Some(best),
            new_value: new_1rm,
            improvement: Some(new_1rm - best),
        },
        Some(best) => PrResult {
            is_pr: false,
            pr_type: None,
            previous_best: Some(best),
            new_value: new_1rm,
            improvement: None,
        },
        None => PrResult {
            is_pr: true, // First entry is always a PR
            pr_type: Some(PrType::EstimatedOneRm),
            previous_best: None,
            new_value: new_1rm,
            improvement: None,
        },
    }
}

/// Calculates a score for a set based on logging mode.
///
/// Scoring logic:
/// - RepsWeight: estimated 1RM
/// - Reps: reps (bodyweight)
/// - Time: duration in seconds
/// - Distance: distance in meters
/// - TimeDistance: distance / time (speed)
/// - DistanceWeight: distance × weight
pub fn score_set(
    weight: Option<f64>,
    reps: Option<i32>,
    duration: Option<f64>,
    distance: Option<f64>,
    mode: LoggingMode,
) -> f64 {
    match mode {
        LoggingMode::RepsWeight => {
            let w = weight.unwrap_or(0.0);
            let r = reps.unwrap_or(0);
            estimate_one_rm(w, r)
        }
        LoggingMode::Reps => reps.unwrap_or(0) as f64,
        LoggingMode::Time => duration.unwrap_or(0.0),
        LoggingMode::Distance => distance.unwrap_or(0.0),
        LoggingMode::TimeDistance => {
            let d = distance.unwrap_or(0.0);
            let t = duration.unwrap_or(1.0).max(1.0); // Avoid divide by zero
            d / t
        }
        LoggingMode::DistanceWeight => {
            let d = distance.unwrap_or(0.0);
            let w = weight.unwrap_or(0.0);
            d * w
        }
        LoggingMode::Mixed => {
            // Mixed mode: use available fields to calculate best metric
            // Priority: 1RM > volume > duration > distance
            if let (Some(w), Some(r)) = (weight, reps) {
                if w > 0.0 && r > 0 {
                    return estimate_one_rm(w, r);
                }
            }
            if let (Some(w), Some(r)) = (weight, reps) {
                if w > 0.0 && r > 0 {
                    return w * r as f64;
                }
            }
            if let Some(d) = duration {
                if d > 0.0 {
                    return d;
                }
            }
            distance.unwrap_or(0.0)
        }
    }
}

/// Input payload for building PR payload
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SetPayload {
    pub exercise: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reps: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub weight: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub duration: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub distance: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pr: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pr_ts: Option<i64>,
}

/// Existing event info for PR calculation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExistingEventInfo {
    pub event_id: String,
    pub ts: i64,
    pub pr: Option<bool>,
    pub pr_ts: Option<i64>,
}

/// Builds a payload with PR information based on historical events.
/// This is the batched version - processes all events in one call.
///
/// # Arguments
/// * `payload` - The new set payload
/// * `event_ts` - Timestamp for the new event
/// * `events` - All historical events as JSON array
/// * `existing_event` - Optional existing event (for updates)
/// * `logging_mode` - The logging mode for score calculation
///
/// # Returns
/// The payload with pr and pr_ts fields set if it's a PR
pub fn build_pr_payload(
    mut payload: SetPayload,
    event_ts: i64,
    events: &[Value],
    existing_event: Option<&ExistingEventInfo>,
    logging_mode: &str,
) -> SetPayload {
    let mode = LoggingMode::from_str(logging_mode).unwrap_or(LoggingMode::RepsWeight);

    // Calculate score for the new payload
    let current_score = score_set(
        payload.weight,
        payload.reps,
        payload.duration,
        payload.distance,
        mode,
    );

    if current_score <= 0.0 {
        return payload;
    }

    // Check if existing event already has PR
    let existing_pr = existing_event
        .as_ref()
        .map_or(false, |e| e.pr.unwrap_or(false));
    let existing_pr_ts = existing_event.as_ref().and_then(|e| e.pr_ts.or(Some(e.ts)));
    let existing_event_id = existing_event.as_ref().map(|e| e.event_id.as_str());

    // Find best score from historical events (excluding current if updating)
    let mut best_score: Option<f64> = None;

    for event in events {
        // Skip the event we're updating
        if let Some(exclude_id) = existing_event_id {
            if let Some(event_id) = event.get("event_id").and_then(|v| v.as_str()) {
                if event_id == exclude_id {
                    continue;
                }
            }
        }

        let event_payload = match event.get("payload") {
            Some(p) => p,
            None => continue,
        };

        // Check exercise matches
        let event_exercise = event_payload
            .get("exercise")
            .and_then(|e| e.as_str())
            .unwrap_or("");

        if event_exercise != payload.exercise {
            continue;
        }

        // Calculate score for this historical event
        let weight = event_payload.get("weight").and_then(|w| w.as_f64());
        let reps = event_payload
            .get("reps")
            .and_then(|r| r.as_i64())
            .map(|r| r as i32);
        let duration = event_payload.get("duration").and_then(|d| d.as_f64());
        let distance = event_payload.get("distance").and_then(|d| d.as_f64());

        let score = score_set(weight, reps, duration, distance, mode);

        if score > 0.0 {
            best_score = Some(best_score.map_or(score, |best| best.max(score)));
        }
    }

    // Determine if this is a PR
    let is_pr = existing_pr || best_score.map_or(true, |best| current_score > best);

    if is_pr {
        payload.pr = Some(true);
        payload.pr_ts = existing_pr_ts.or(Some(event_ts));
    }

    payload
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_estimate_one_rm() {
        // 100kg × 10 reps → 1RM ≈ 133.3kg
        let result = estimate_one_rm(100.0, 10);
        assert!((result - 133.33).abs() < 0.1);
    }

    #[test]
    fn test_estimate_one_rm_single_rep() {
        let result = estimate_one_rm(100.0, 1);
        assert!((result - 103.33).abs() < 0.1);
    }

    #[test]
    fn test_estimate_one_rm_zero_reps() {
        let result = estimate_one_rm(100.0, 0);
        assert_eq!(result, 100.0);
    }

    #[test]
    fn test_score_set_reps_weight() {
        let score = score_set(Some(100.0), Some(10), None, None, LoggingMode::RepsWeight);
        assert!((score - 133.33).abs() < 0.1);
    }

    #[test]
    fn test_score_set_time() {
        let score = score_set(None, None, Some(120.0), None, LoggingMode::Time);
        assert_eq!(score, 120.0);
    }

    #[test]
    fn test_detect_pr_first_entry() {
        let events: Vec<Value> = vec![];
        let result = detect_pr("bench_press", &events, Some(100.0), Some(5));
        assert!(result.is_pr);
        assert!(result.previous_best.is_none());
    }

    #[test]
    fn test_detect_pr_improvement() {
        let events: Vec<Value> = vec![serde_json::json!({
            "payload": {
                "exercise": "bench_press",
                "weight": 100.0,
                "reps": 5
            }
        })];
        let result = detect_pr("bench_press", &events, Some(110.0), Some(5));
        assert!(result.is_pr);
        assert!(result.improvement.is_some());
    }

    #[test]
    fn test_detect_pr_no_improvement() {
        let events: Vec<Value> = vec![serde_json::json!({
            "payload": {
                "exercise": "bench_press",
                "weight": 100.0,
                "reps": 10
            }
        })];
        // Lower performance than previous
        let result = detect_pr("bench_press", &events, Some(80.0), Some(5));
        assert!(!result.is_pr);
    }
}
