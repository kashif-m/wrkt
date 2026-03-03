import { Share } from 'react-native';
import { exportGenericSqlite, JsonObject } from '../TrackerEngine';
import { RootState } from '../state/appState';
import { getTrackerIdentifier, WORKOUT_DSL } from '../workoutFlows';

const toJsonObject = (value: unknown): JsonObject => value as JsonObject;

export const buildGenericExportPayload = async (
  state: Pick<RootState, 'events' | 'catalog' | 'preferences'>,
): Promise<JsonObject> => {
  const trackerId = await getTrackerIdentifier();
  const tracker = {
    tracker_id: String(trackerId),
    dsl: String(WORKOUT_DSL),
    version: 1,
    meta: {
      source: 'wrkt',
      scope: 'workout',
    },
  };

  const events = state.events.map(event => ({
    event_id: String(event.event_id),
    tracker_id: String(event.tracker_id),
    ts: Number(event.ts),
    payload: event.payload ?? {},
    meta: event.meta ?? {},
  }));

  // App/workout-specific backup state stays layered as kv_meta.
  const kv_meta = {
    wrkt_catalog_entries: state.catalog.entries,
    wrkt_custom_catalog: state.catalog.custom,
    wrkt_favorites: state.catalog.favorites,
    wrkt_preferences: state.preferences,
  };

  return toJsonObject({
    trackers: [tracker],
    events,
    kv_meta,
  });
};

export const exportAndShareSqlite = async (
  state: Pick<RootState, 'events' | 'catalog' | 'preferences'>,
): Promise<{ output_path: string }> => {
  const payload = await buildGenericExportPayload(state);
  const result = exportGenericSqlite(payload, '');

  const outputPath = String(result.output_path ?? '');
  if (!outputPath) {
    throw new Error('Export completed without output path');
  }

  await Share.share({
    title: 'WRKT export',
    url: `file://${outputPath}`,
  });

  return { output_path: outputPath };
};
