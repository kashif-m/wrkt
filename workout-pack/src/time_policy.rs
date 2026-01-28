//! Time bucketing utilities for workout event normalization.
//!
//! These functions handle timezone-aware date rounding for event grouping.

const MINUTE_MS: i64 = 60 * 1000;
const DAY_MS: i64 = 24 * 60 * 60 * 1000;

/// Rounds a timestamp to the start of the local day.
///
/// # Arguments
/// * `ts_ms` - Timestamp in milliseconds since epoch
/// * `offset_minutes` - Local timezone offset in minutes (e.g., +330 for IST)
///
/// # Returns
/// Timestamp in milliseconds representing start of local day in UTC
pub fn round_to_local_day(ts_ms: i64, offset_minutes: i32) -> i64 {
    let offset = offset_minutes as i64 * MINUTE_MS;
    let local = ts_ms + offset;
    let rounded_local = (local / DAY_MS) * DAY_MS;
    rounded_local - offset
}

/// Rounds a timestamp to the start of the local week (Monday).
///
/// # Arguments
/// * `ts_ms` - Timestamp in milliseconds since epoch
/// * `offset_minutes` - Local timezone offset in minutes
///
/// # Returns
/// Timestamp in milliseconds representing start of local week (Monday) in UTC
pub fn round_to_local_week(ts_ms: i64, offset_minutes: i32) -> i64 {
    let start_of_day = round_to_local_day(ts_ms, offset_minutes);
    let offset = offset_minutes as i64 * MINUTE_MS;

    // Get day of week (0 = Sunday in chrono-like logic)
    let local_date_ms = start_of_day + offset;
    let days_since_epoch = local_date_ms / DAY_MS;
    // Jan 1, 1970 was Thursday (4), so we adjust
    let day_of_week = ((days_since_epoch + 4) % 7) as i32; // 0 = Sunday

    // Convert to Monday-based offset (Monday = 0)
    let monday_offset = (day_of_week + 6) % 7;

    start_of_day - (monday_offset as i64 * DAY_MS)
}

/// Gets the local timezone offset in minutes.
///
/// Note: This returns a fixed offset. In practice, the client should pass the offset.
pub fn get_local_offset_minutes() -> i32 {
    // This would need chrono or similar for proper TZ support
    // For now, we expect the client to pass the offset
    0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_round_to_local_day_utc() {
        // 2024-01-15 12:30:00 UTC = 1705321800000 ms
        let ts = 1705321800000_i64;
        let result = round_to_local_day(ts, 0);
        // Should be 2024-01-15 00:00:00 UTC = 1705276800000 ms
        assert_eq!(result, 1705276800000);
    }

    #[test]
    fn test_round_to_local_day_with_offset() {
        // 2024-01-15 12:30:00 UTC, but in IST (UTC+5:30 = 330 minutes)
        // That's 2024-01-15 18:00:00 IST
        let ts = 1705321800000_i64;
        let result = round_to_local_day(ts, 330);
        // Start of Jan 15 IST = Jan 14 18:30:00 UTC = 1705257000000
        let expected = 1705257000000_i64;
        assert_eq!(result, expected);
    }

    #[test]
    fn test_round_to_local_week() {
        // 2024-01-17 (Wednesday) 12:00:00 UTC
        let ts = 1705492800000_i64;
        let result = round_to_local_week(ts, 0);
        // Should be 2024-01-15 (Monday) 00:00:00 UTC = 1705276800000
        assert_eq!(result, 1705276800000);
    }
}
