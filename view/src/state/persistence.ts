/**
 * Persistence Middleware
 * Handles debounced writes to storage and background flushing
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, AppStateStatus } from 'react-native';
import { WorkoutEvent } from '../workoutFlows';
import { asJsonString, asStorageKey } from '../domain/types';
import {
  getLocalOffsetMinutes,
  roundToLocalDay,
  roundToLocalWeek,
} from '../timePolicy';
import { minutesToSeconds } from '../ui/formatters';
import { AccentKey, ThemeMode, themeModeOptions } from '../ui/theme';
import { HomeSplitMode, SummaryConsistencyWindow } from './appState';

const STORAGE_KEY = asStorageKey('strata.workout.events');
const EVENTS_META_KEY = asStorageKey('strata.workout.events.meta');
const SETTINGS_KEY = asStorageKey('strata.settings');
const EVENTS_MIGRATION_VERSION = 2;

let saveTimeout: ReturnType<typeof setTimeout> | null = null;
let pendingState: WorkoutEvent[] | null = null;
let isSaving = false;
let needsResave = false;

// Configurable debounce time (500ms)
const DEBOUNCE_MS = 500;

type PersistedSettings = {
  themeAccent: AccentKey;
  themeMode: ThemeMode;
  customAccentHex: string | null;
  homeSplitMode: HomeSplitMode;
  summaryConsistencyWindow: SummaryConsistencyWindow;
};

type PersistedEventsMeta = {
  migrationVersion: number;
};

const DEFAULT_SETTINGS: PersistedSettings = {
  themeAccent: 'blue',
  themeMode: 'dark',
  customAccentHex: null,
  homeSplitMode: 'muscle',
  summaryConsistencyWindow: 'this_month',
};

const DEFAULT_EVENTS_META: PersistedEventsMeta = {
  migrationVersion: 0,
};

const themeModeSet = new Set<ThemeMode>(
  themeModeOptions.map(option => option.key),
);

export const loadAllEvents = async (): Promise<WorkoutEvent[]> => {
  try {
    const [raw, metaRaw] = await Promise.all([
      AsyncStorage.getItem(STORAGE_KEY),
      AsyncStorage.getItem(EVENTS_META_KEY),
    ]);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as WorkoutEvent[];
    const meta = parseEventsMeta(metaRaw);
    const migrationVersion = meta.migrationVersion;
    const { events, changed } = applyEventMigrations(parsed, migrationVersion);
    if (changed || migrationVersion < EVENTS_MIGRATION_VERSION) {
      await Promise.all([
        changed
          ? AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(events))
          : Promise.resolve(),
        AsyncStorage.setItem(
          EVENTS_META_KEY,
          JSON.stringify({
            migrationVersion: EVENTS_MIGRATION_VERSION,
          }),
        ),
      ]);
      if (__DEV__) {
        console.log(
          `[persistence] Applied events migration v${EVENTS_MIGRATION_VERSION}`,
        );
      }
    }
    return events;
  } catch (error) {
    console.warn('[persistence] Failed to load events', error);
    return [];
  }
};

export const loadSettings = async (): Promise<PersistedSettings> => {
  try {
    const raw = await AsyncStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<PersistedSettings>;
    const themeAccent =
      typeof parsed.themeAccent === 'string'
        ? (parsed.themeAccent as AccentKey)
        : DEFAULT_SETTINGS.themeAccent;
    const themeMode =
      typeof parsed.themeMode === 'string' &&
      themeModeSet.has(parsed.themeMode as ThemeMode)
        ? (parsed.themeMode as ThemeMode)
        : DEFAULT_SETTINGS.themeMode;
    const customAccentHex =
      typeof parsed.customAccentHex === 'string'
        ? parsed.customAccentHex
        : null;
    const homeSplitMode =
      parsed.homeSplitMode === 'volume' ? 'volume' : 'muscle';
    const summaryConsistencyWindow =
      parsed.summaryConsistencyWindow === 'last_30_days'
        ? 'last_30_days'
        : 'this_month';
    return {
      themeAccent,
      themeMode,
      customAccentHex,
      homeSplitMode,
      summaryConsistencyWindow,
    };
  } catch (error) {
    console.warn('[persistence] Failed to load settings', error);
    return DEFAULT_SETTINGS;
  }
};

export const saveSettings = async (settings: PersistedSettings) => {
  try {
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (error) {
    console.warn('[persistence] Failed to save settings', error);
  }
};

const persistNow = async () => {
  if (isSaving) {
    needsResave = true;
    return;
  }
  const events = pendingState;
  if (!events) return;

  isSaving = true;
  try {
    const json = JSON.stringify(events);
    await AsyncStorage.setItem(STORAGE_KEY, json);
    if (__DEV__) {
      console.log('[persistence] Saved events snapshot', events.length);
    }
  } catch (error) {
    console.error('[persistence] Write failed', error);
  } finally {
    isSaving = false;
    const hasQueuedChanges = needsResave;
    needsResave = false;
    if (!hasQueuedChanges && pendingState === events) {
      pendingState = null;
    }
    if (pendingState) {
      void persistNow();
    }
  }
};

export const scheduleSave = (events: WorkoutEvent[]) => {
  pendingState = events;

  if (saveTimeout) {
    clearTimeout(saveTimeout);
  }

  saveTimeout = setTimeout(() => {
    void persistNow();
  }, DEBOUNCE_MS);
};

// Flush on app background/terminate
const handleAppStateChange = (nextAppState: AppStateStatus) => {
  if (nextAppState.match(/inactive|background/) && pendingState) {
    if (saveTimeout) clearTimeout(saveTimeout);
    console.log('[persistence] Flushing on background');
    void persistNow();
  }
};

// Initialize listener
AppState.addEventListener('change', handleAppStateChange);

const normalizeDurationUnits = (events: WorkoutEvent[]) => {
  let changed = false;
  const normalized = events.map(event => {
    const meta = (event.meta ?? {}) as Record<string, unknown>;
    const payload = (event.payload ?? {}) as Record<string, unknown>;
    const unit =
      typeof meta.duration_unit === 'string'
        ? meta.duration_unit.toLowerCase()
        : null;
    const source =
      typeof meta.source === 'string' ? meta.source.toLowerCase() : '';
    const durationRaw = payload.duration;
    const hasDuration =
      typeof durationRaw === 'number' &&
      Number.isFinite(durationRaw) &&
      durationRaw > 0;
    const isFitnotes = source.includes('fitnotes');

    if (unit === 's') {
      return event;
    }

    if (isFitnotes) {
      changed = true;
      return {
        ...event,
        meta: {
          ...event.meta,
          duration_unit: asJsonString('s'),
        },
      };
    }

    if (!hasDuration) {
      return event;
    }

    changed = true;
    return {
      ...event,
      payload: {
        ...event.payload,
        duration: minutesToSeconds(durationRaw),
      },
      meta: {
        ...event.meta,
        duration_unit: asJsonString('s'),
      },
    };
  });

  return { events: normalized, changed };
};

const parseEventsMeta = (metaRaw: string | null): PersistedEventsMeta => {
  if (!metaRaw) return DEFAULT_EVENTS_META;
  try {
    const parsed = JSON.parse(metaRaw) as Partial<PersistedEventsMeta>;
    if (
      typeof parsed.migrationVersion === 'number' &&
      Number.isFinite(parsed.migrationVersion)
    ) {
      return {
        migrationVersion: Math.max(0, Math.floor(parsed.migrationVersion)),
      };
    }
    return DEFAULT_EVENTS_META;
  } catch {
    return DEFAULT_EVENTS_META;
  }
};

const applyEventMigrations = (events: WorkoutEvent[], fromVersion: number) => {
  let nextEvents = events;
  let changed = false;

  if (fromVersion < 1) {
    const result = normalizeDurationUnits(nextEvents);
    nextEvents = result.events;
    changed = changed || result.changed;
  }

  if (fromVersion < 2) {
    const result = backfillPayloadBuckets(nextEvents);
    nextEvents = result.events;
    changed = changed || result.changed;
  }

  return { events: nextEvents, changed };
};

const readNumeric = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

const backfillPayloadBuckets = (events: WorkoutEvent[]) => {
  let changed = false;
  const localOffsetMinutes = getLocalOffsetMinutes();

  const normalized = events.map(event => {
    const payload = (event.payload ?? {}) as Record<string, unknown>;
    const meta = (event.meta ?? {}) as Record<string, unknown>;
    const payloadDayBucket = readNumeric(payload.day_bucket);
    const payloadWeekBucket = readNumeric(payload.week_bucket);

    if (payloadDayBucket !== null && payloadWeekBucket !== null) {
      return event;
    }

    const eventOffsetMinutes =
      readNumeric(meta.timezone_offset_minutes) ?? localOffsetMinutes;
    const dayBucket =
      payloadDayBucket ??
      readNumeric(meta.day_bucket) ??
      roundToLocalDay(event.ts, eventOffsetMinutes);
    const weekBucket =
      payloadWeekBucket ??
      readNumeric(meta.week_bucket) ??
      roundToLocalWeek(event.ts, eventOffsetMinutes);

    changed = true;
    return {
      ...event,
      payload: {
        ...(event.payload ?? {}),
        day_bucket: dayBucket,
        week_bucket: weekBucket,
      },
      meta: {
        ...(event.meta ?? {}),
        timezone_offset_minutes: eventOffsetMinutes,
        day_bucket: dayBucket,
        week_bucket: weekBucket,
      },
    };
  });

  return { events: normalized, changed };
};
