import {
  computeWorkoutTracker,
  validateWorkoutEvent,
  JsonObject,
  compileWorkoutTracker,
} from './TrackerEngine';
import {
  DslText,
  EventId,
  TrackerId,
  asDslText,
  asJsonString,
  asTrackerId,
} from './domain/types';
import {
  getLocalOffsetMinutes,
  roundToLocalDay,
  roundToLocalWeek,
  sortEventsByDeterministicOrder,
  TimeGrain,
} from './timePolicy';
import type {
  WorkoutEvent,
  WorkoutState,
} from './domain/generated/workoutDomainContract';
export type {
  WorkoutEvent,
  WorkoutState,
} from './domain/generated/workoutDomainContract';

export const WORKOUT_DSL: DslText = asDslText(
  'workout_builtin',
);

const TRACKER_ID_FALLBACK: TrackerId = asTrackerId('workout');
let trackerIdentifier: TrackerId = TRACKER_ID_FALLBACK;
let trackerIdPromise: Promise<TrackerId> | null = null;

const resolveTrackerIdentifier = async () => {
  try {
    const compiled = await compileWorkoutTracker();
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
  const dayBucket = roundToLocalDay(event.ts, offsetMinutes);
  const weekBucket = roundToLocalWeek(event.ts, offsetMinutes);
  return {
    ...event,
    payload: {
      ...(event.payload ?? {}),
      day_bucket: dayBucket,
      week_bucket: weekBucket,
    },
    meta: {
      ...(event.meta ?? {}),
      timezone_offset_minutes: offsetMinutes,
      day_bucket: dayBucket,
      week_bucket: weekBucket,
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
    normalized = (await validateWorkoutEvent({
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
      'TrackerEngine validateWorkoutEvent failed, persisting raw payload',
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
  if (payload.pr === false) {
    delete mergedPayload.pr;
    delete mergedPayload.pr_ts;
  }
  let normalized: WorkoutEvent = {
    ...target,
    payload: mergedPayload,
    tracker_id,
  };
  try {
    normalized = (await validateWorkoutEvent(normalized)) as WorkoutEvent;
    normalized = {
      ...normalized,
      event_id: target.event_id,
      tracker_id,
      ts: target.ts,
    };
  } catch (error) {
    console.warn(
      'TrackerEngine validateWorkoutEvent failed during update, persisting raw payload',
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
  computeWorkoutTracker(state.events, query);

export const buildVolumeQuery = (grain: TimeGrain): JsonObject => {
  const bucketField = grain === 'week' ? 'week_bucket' : 'day_bucket';
  return {
    metric: asJsonString('total_volume'),
    group_by: [asJsonString('exercise'), asJsonString(bucketField)],
  };
};
