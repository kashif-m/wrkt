# Local Persistence Plan (SQLite)

## Goals

* Offline-first logging: every event (workout set, session note) is stored locally immediately.
* Deterministic analytics: persist raw events + tracker configs; derived metrics come from the Rust core.
* Migration-friendly: schema evolves without rewriting history; DSL versions handled separately.

## Tables

### `trackers`
| column        | type    | notes                               |
|---------------|---------|-------------------------------------|
| `tracker_id`  | TEXT PK | matches `TrackerId` from core       |
| `version`     | INTEGER | DSL version (e.g., 1)               |
| `name`        | TEXT    | human-readable                      |
| `dsl`         | TEXT    | raw DSL string                      |
| `compiled_ir` | BLOB    | optional serialized IR cache        |
| `created_at`  | INTEGER | unix ms when added                  |

### `events`
| column        | type    | notes                                            |
|---------------|---------|--------------------------------------------------|
| `event_id`    | TEXT PK | UUID                                             |
| `tracker_id`  | TEXT    | FK -> `trackers.tracker_id`                      |
| `ts`          | INTEGER | milliseconds since epoch (UTC)                   |
| `payload`     | TEXT    | JSON blob defined by tracker DSL                 |
| `meta`        | TEXT    | JSON for source info / device tags               |
| `ingested_at` | INTEGER | client timestamp for ordering/debugging          |
| indexes       |         | composite `(tracker_id, ts)` for range scans     |

### `snapshots` (optional cache)
| column        | type    | notes                                  |
|---------------|---------|----------------------------------------|
| `snapshot_id` | TEXT PK | UUID                                    |
| `tracker_id`  | TEXT    | FK                                      |
| `range_start` | INTEGER | inclusive window start (ms)             |
| `range_end`   | INTEGER | inclusive window end (ms)               |
| `query_hash`  | TEXT    | hash of Query JSON                      |
| `metrics`     | TEXT    | JSON results from engine                |
| `created_at`  | INTEGER | ms                                      |

Snapshots stay optional until analytics need caching.

## Storage Helpers

Boundary structs:

* `DbTrackerRow` ↔ `TrackerDefinition`
* `DbEventRow` ↔ `NormalizedEvent`

Convert immediately at the RN/TS boundary per `llm/GUIDELINES.md` so the Rust core never touches SQLite types.

## Write Path

1. User logs a set → RN builds `eventJson` with payload/meta.
2. `validateEvent` (JSI) normalizes + enforces schema.
3. Insert into `events` within a transaction.
4. Optionally invalidate snapshot rows touching the tracker/time range.

## Read Path

* Query `events` by `(tracker_id, window)` using the index.
* Materialize JSON array and call `compute(trackerId, events, query)`.
* Cache compiled trackers (DSL + compiled IR) in memory and optionally store IR blob.

## Migrations

* Store schema version via `PRAGMA user_version`.
* Each app release bumps version + runs SQL migrations (adding columns, indexes, etc.).
* Tracker versioning stays in DSL; DB keeps append-only events.

## Next Steps

1. Implement RN storage module (likely `react-native-sqlite-storage` or `expo-sqlite`).
2. Wire the JS/TS boundary models to Rust FFI conversions.
3. Later, consider snapshot caching + background compaction once analytics volume grows.
