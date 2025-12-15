# Storage Interface → Strata Core

This note documents how the SQLite layer (implemented in React Native / TypeScript) interfaces with the Strata Rust core through the JSI bridge.

## Boundary Shapes (TypeScript)

```ts
export type DbEventRow = {
  eventId: string;
  trackerId: string;
  ts: number; // epoch millis UTC
  payloadJson: string; // stored JSON string
  metaJson: string; // stored JSON string
};

export type DbTrackerRow = {
  trackerId: string;
  name: string;
  version: number;
  dsl: string;
  compiledIr?: Uint8Array; // optional blob cache
};
```

When reading rows from SQLite, convert them immediately into the Strata-friendly shapes:

```ts
import { TrackerEngine } from 'strata-jsi';

const trackerDef = TrackerEngine.compileTracker(trackerRow.dsl);
const events = rows.map((row) => ({
  event_id: row.eventId,
  tracker_id: row.trackerId,
  ts: row.ts,
  payload: JSON.parse(row.payloadJson),
  meta: JSON.parse(row.metaJson ?? '{}'),
}));

const result = TrackerEngine.compute(trackerDef, events, queryJson);
```

## Write Path

1. Build `eventJson` on the RN side.
2. Call `TrackerEngine.validateEvent(trackerDef, eventJson)` to normalize schema + enforce types.
3. Persist the normalized JSON fields into SQLite.
4. Optionally enqueue a background job to refresh cached charts (if snapshots are enabled).

## Read Path

1. Select `(tracker_id, ts)`-ordered events from SQLite for the desired window.
2. Convert rows to JSON objects as shown above.
3. Invoke `compute` or `simulate` through the JSI binding.
4. Render metrics / charts in RN.

## Notes

* Keep the Rust `TrackerDefinition` cached per `tracker_id`; reload only when DSL changes.
* Do not let RN logic bypass validation; Strata remains the single source of truth for schema enforcement.
* For export/import, simply dump/load the `events` table as JSON; the deterministic engine will recompute metrics identically on any device.
