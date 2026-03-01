use crate::time_bucket::round_to_local_day;
use chrono::{TimeZone, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HeatmapPoint {
    pub date: String,   // YYYY-MM-DD
    pub timestamp: i64, // Start of day ms
    pub count: i32,     // Number of events
    pub level: i32,     // 0-4 intensity
}

pub struct Heatmap;

impl Heatmap {
    pub fn calculate(timestamps: &[i64], offset_minutes: i32) -> Vec<HeatmapPoint> {
        if timestamps.is_empty() {
            return Vec::new();
        }

        let mut counts: std::collections::HashMap<i64, i32> = std::collections::HashMap::new();

        for &ts in timestamps {
            let day = round_to_local_day(ts, offset_minutes);
            *counts.entry(day).or_insert(0) += 1;
        }

        // Determine max for scaling (simple linear or quantile?)
        // GitHub uses quartiles. We'll use simple linear max for now.
        let max_count = counts.values().max().copied().unwrap_or(1) as f32;

        let mut points: Vec<HeatmapPoint> = counts
            .into_iter()
            .map(|(ts, count)| {
                // Calculate level 0-4
                // 0 = 0 (not in map)
                // 1-4 scaled
                let ratio = count as f32 / max_count;
                let level = if ratio <= 0.0 {
                    0
                } else if ratio <= 0.25 {
                    1
                } else if ratio <= 0.50 {
                    2
                } else if ratio <= 0.75 {
                    3
                } else {
                    4
                };

                let dt = Utc.timestamp_millis_opt(ts).unwrap();
                // Adjust back to "Local" display date?
                // Ideally we return the generic bucket and UI formats it.
                // But returning ISO string is helpful.
                // Since 'ts' is already shifted to look like UTC day boundary for the LOCAL user,
                // formatting it as UTC gives the correct YYYY-MM-DD.
                let date_str = dt.format("%Y-%m-%d").to_string();

                HeatmapPoint {
                    date: date_str,
                    timestamp: ts,
                    count,
                    level,
                }
            })
            .collect();

        points.sort_by_key(|p| p.timestamp);
        points
    }
}
