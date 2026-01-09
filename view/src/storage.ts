import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  initialEvents,
  WorkoutEvent,
  getTrackerIdentifier,
} from './workoutFlows';
import { sortEventsByDeterministicOrder } from './timePolicy';
import {
  EventId,
  TrackerId,
  StorageKey,
  asEventId,
  asTrackerId,
  asStorageKey,
} from './domain/types';

const STORAGE_KEY: StorageKey = asStorageKey('strata.workout.events');

const readStore = async (): Promise<WorkoutEvent[]> => {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as WorkoutEvent[];
    return parsed.map(event => ({
      ...event,
      event_id: asEventId(String(event.event_id)),
      tracker_id: asTrackerId(String(event.tracker_id)),
    }));
  } catch (error) {
    console.warn('Failed to parse workout cache, resetting', error);
    return [];
  }
};

const writeStore = async (events: WorkoutEvent[]) => {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(events));
};

export const init = async () => {
  const existing = await readStore();
  if (existing.length === 0) {
    await writeStore(initialEvents);
  }
};

export const insertEvent = async (event: WorkoutEvent) => {
  const events = await readStore();
  const merged = sortEventsByDeterministicOrder([...events, event]);
  await writeStore(merged);
};

export const insertEvents = async (incoming: WorkoutEvent[]) => {
  const events = await readStore();
  const byId = new Map<string, WorkoutEvent>();
  events.forEach(event => byId.set(String(event.event_id), event));
  incoming.forEach(event => byId.set(String(event.event_id), event));
  const merged = sortEventsByDeterministicOrder(Array.from(byId.values()));
  await writeStore(merged);
};

export const updateEvent = async (updated: WorkoutEvent) => {
  const events = await readStore();
  const next = events.map(event =>
    event.event_id === updated.event_id ? updated : event,
  );
  await writeStore(sortEventsByDeterministicOrder(next));
};

export const removeEvent = async (eventId: EventId) => {
  const events = await readStore();
  await writeStore(events.filter(event => event.event_id !== eventId));
};

export const fetchEvents = async (
  trackerId?: TrackerId,
  range?: [number, number],
): Promise<WorkoutEvent[]> => {
  const events = await readStore();
  const id = trackerId ?? (await getTrackerIdentifier());
  let filtered = events.filter(event => event.tracker_id === id);
  if (range) {
    const [start, end] = range;
    filtered = filtered.filter(event => event.ts >= start && event.ts <= end);
  }
  return sortEventsByDeterministicOrder(filtered);
};
