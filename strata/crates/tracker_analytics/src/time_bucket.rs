use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Granularity {
    Day,
    Week,
    Month,
}

const MINUTE_MS: i64 = 60 * 1000;
const DAY_MS: i64 = 24 * 60 * 60 * 1000;

pub fn bucket_ts(ts_ms: i64, granularity: Granularity, offset_minutes: i32) -> i64 {
    match granularity {
        Granularity::Day => round_to_local_day(ts_ms, offset_minutes),
        Granularity::Week => round_to_local_week(ts_ms, offset_minutes),
        Granularity::Month => round_to_local_month(ts_ms, offset_minutes),
    }
}

pub fn round_to_local_day(ts_ms: i64, offset_minutes: i32) -> i64 {
    let offset = offset_minutes as i64 * MINUTE_MS;
    let local = ts_ms + offset;
    let rounded_local = (local / DAY_MS) * DAY_MS;
    rounded_local - offset
}

pub fn round_to_local_week(ts_ms: i64, offset_minutes: i32) -> i64 {
    let start_of_day = round_to_local_day(ts_ms, offset_minutes);
    let offset = offset_minutes as i64 * MINUTE_MS;

    // Jan 1, 1970 was Thursday (4)
    let local_date_ms = start_of_day + offset;
    let days_since_epoch = local_date_ms / DAY_MS;
    let day_of_week = ((days_since_epoch + 4) % 7) as i32; // 0 = Sunday

    // Convert to Monday-based (Monday=0, Sunday=6)
    // Sunday(0) -> 6
    // Monday(1) -> 0
    // ...
    // Thursday(4) -> 3
    let monday_offset = (day_of_week + 6) % 7;

    start_of_day - (monday_offset as i64 * DAY_MS)
}

pub fn round_to_local_month(ts_ms: i64, offset_minutes: i32) -> i64 {
    // This requires date decomposition which is hard without chrono.
    // We will use chrono since we added it to Cargo.toml.
    use chrono::{Datelike, TimeZone, Utc};

    // let offset_seconds = offset_minutes * 60; // Unused

    // Construct a FixedOffset would be ideal, but for simplicity we can shift the TS.
    // Or just use Utc and shift.

    // We'll trust the offset shifting approach for day/week,
    // but for month we need actual calendar math (months vary in length).

    // Strategy:
    // 1. Create DateTime<Utc> from ts
    // 2. Add offset (manual duration) to get "Local" time instance (still typed Utc but values are local)
    // 3. Set day=1, hour=0...
    // 4. Subtract offset back.

    // Actually, chrono has CheckedAdd.
    let dt = Utc.timestamp_millis_opt(ts_ms).unwrap();
    let local_proxy = dt + chrono::Duration::minutes(offset_minutes as i64);

    let year = local_proxy.year();
    let month = local_proxy.month();

    let start_of_month_local = Utc.with_ymd_and_hms(year, month, 1, 0, 0, 0).unwrap();

    start_of_month_local.timestamp_millis() - (offset_minutes as i64 * MINUTE_MS)
}
