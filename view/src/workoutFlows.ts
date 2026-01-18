import {
  compute,
  suggest,
  validateEvent,
  JsonObject,
  JsonValue,
  compileTracker,
} from './TrackerEngine';
import {
  DslText,
  EventId,
  LabelText,
  MetricKey,
  PlannerKind,
  TrackerId,
  asDslText,
  asEventId,
  asJsonString,
  asLabelText,
  asMetricKey,
  asTrackerId,
} from './domain/types';
import {
  getLocalOffsetMinutes,
  roundToLocalDay,
  roundToLocalWeek,
  sortEventsByDeterministicOrder,
  TimeGrain,
} from './timePolicy';

export type WorkoutEvent = JsonObject & {
  event_id: EventId;
  tracker_id: TrackerId;
  ts: number;
  payload: JsonObject;
  meta: JsonObject;
};

export type WorkoutState = { events: WorkoutEvent[] };

export const WORKOUT_DSL: DslText = asDslText(
  'tracker "workout" v1 {\n  fields {\n    exercise: text\n    reps: int optional\n    weight: float optional\n    duration: float optional\n    distance: float optional\n    pr: bool optional\n    pr_ts: int optional\n  }\n}',
);

const TRACKER_ID_FALLBACK: TrackerId = asTrackerId('workout');
let trackerIdentifier: TrackerId = TRACKER_ID_FALLBACK;
let trackerIdPromise: Promise<TrackerId> | null = null;

const resolveTrackerIdentifier = async () => {
  try {
    const compiled = await compileTracker(WORKOUT_DSL);
    if (compiled && typeof compiled === 'object' && 'tracker_id' in compiled) {
      trackerIdentifier = asTrackerId(
        String((compiled as JsonObject)['tracker_id']),
      );
    }
  } catch (error) {
    console.warn('Failed to compile tracker', error);
  }
  return trackerIdentifier;
};

export const getTrackerIdentifier = () => {
  if (!trackerIdPromise) {
    trackerIdPromise = resolveTrackerIdentifier();
  }
  return trackerIdPromise;
};

export const initialEvents: WorkoutEvent[] = [];

export const initialState: WorkoutState = { events: initialEvents };

const annotateEvent = (event: WorkoutEvent): WorkoutEvent => {
  const offsetMinutes = getLocalOffsetMinutes();
  return {
    ...event,
    meta: {
      ...(event.meta ?? {}),
      timezone_offset_minutes: offsetMinutes,
      day_bucket: roundToLocalDay(event.ts, offsetMinutes),
      week_bucket: roundToLocalWeek(event.ts, offsetMinutes),
    },
  };
};

export const logSet = async (
  state: WorkoutState,
  eventJson: WorkoutEvent,
): Promise<WorkoutState> => {
  const tracker_id = await getTrackerIdentifier();
  let normalized: WorkoutEvent = { ...eventJson, tracker_id };
  try {
    normalized = (await validateEvent(WORKOUT_DSL, {
      ...eventJson,
      tracker_id,
    })) as WorkoutEvent;
    normalized = {
      ...normalized,
      event_id: eventJson.event_id,
      tracker_id,
      ts: eventJson.ts,
    };
  } catch (error) {
    console.warn(
      'TrackerEngine validateEvent unavailable, persisting raw payload',
      error,
    );
  }
  const annotated = annotateEvent(normalized);
  return {
    events: sortEventsByDeterministicOrder([...state.events, annotated]),
  };
};

export const updateLoggedSet = async (
  state: WorkoutState,
  eventId: EventId,
  payload: WorkoutEvent['payload'],
): Promise<WorkoutState> => {
  const tracker_id = await getTrackerIdentifier();
  const target = state.events.find(event => event.event_id === eventId);
  if (!target) {
    return state;
  }
  const mergedPayload = { ...target.payload, ...payload };
  let normalized: WorkoutEvent = {
    ...target,
    payload: mergedPayload,
    tracker_id,
  };
  try {
    normalized = (await validateEvent(WORKOUT_DSL, normalized)) as WorkoutEvent;
    normalized = {
      ...normalized,
      event_id: target.event_id,
      tracker_id,
      ts: target.ts,
    };
  } catch (error) {
    console.warn(
      'TrackerEngine validateEvent unavailable during update, persisting raw payload',
      error,
    );
  }
  const annotated = annotateEvent(normalized);
  const nextEvents = state.events.map(event =>
    event.event_id === eventId ? annotated : event,
  );
  return { events: sortEventsByDeterministicOrder(nextEvents) };
};

export const deleteLoggedSet = (
  state: WorkoutState,
  eventId: EventId,
): WorkoutState => ({
  events: state.events.filter(event => event.event_id !== eventId),
});

export const history = (state: WorkoutState) =>
  sortEventsByDeterministicOrder(state.events);

export const computeAnalytics = (state: WorkoutState, query: JsonObject) =>
  compute(WORKOUT_DSL, state.events, query);

export type PlanSuggestion = {
  title: LabelText;
  explanation: LabelText;
  delta: Record<MetricKey, number>;
};

const isRecord = (value: JsonValue): value is Record<string, JsonValue> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const toNumberRecord = (value: JsonValue): Record<MetricKey, number> => {
  if (!isRecord(value)) return {};
  const entries: Record<MetricKey, number> = {};
  Object.entries(value).forEach(([key, raw]) => {
    if (typeof raw === 'number' && Number.isFinite(raw)) {
      entries[asMetricKey(key)] = raw;
    }
  });
  return entries;
};

const readTextField = (value: JsonValue, key: string): string | null => {
  if (!isRecord(value)) return null;
  const raw = value[key];
  return typeof raw === 'string' ? raw : null;
};

const normalizeSuggestions = (values: JsonValue[]): PlanSuggestion[] =>
  values
    .map(value => {
      if (!isRecord(value)) return null;
      const title = readTextField(value, 'title');
      const explanation = readTextField(value, 'explanation');
      const delta = toNumberRecord(value['delta'] ?? {});
      if (!title || !explanation) return null;
      return {
        title: asLabelText(title),
        explanation: asLabelText(explanation),
        delta,
      };
    })
    .filter((entry): entry is PlanSuggestion => Boolean(entry));

export const suggestNext = async (
  state: WorkoutState,
  planner: PlannerKind,
): Promise<PlanSuggestion[]> => {
  try {
    const raw = await suggest(WORKOUT_DSL, state.events, planner);
    if (!Array.isArray(raw)) return [];
    return normalizeSuggestions(raw);
  } catch (error) {
    console.warn('suggestNext failed', error);
    return [];
  }
};

export const buildVolumeQuery = (grain: TimeGrain): JsonObject => {
  const bucketField = grain === 'week' ? 'week_bucket' : 'day_bucket';
  return {
    metric: asJsonString('total_volume'),
    group_by: [asJsonString('exercise'), asJsonString(bucketField)],
  };
};
