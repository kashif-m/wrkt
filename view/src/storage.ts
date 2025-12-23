import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  initialEvents,
  WorkoutEvent,
  getTrackerIdentifier,
} from './workoutFlows';
import { sortEventsByDeterministicOrder } from './timePolicy';

const STORAGE_KEY = 'strata.workout.events';

const readStore = async (): Promise<WorkoutEvent[]> => {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return [];
  }
  try {
    return JSON.parse(raw) as WorkoutEvent[];
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

export const updateEvent = async (updated: WorkoutEvent) => {
  const events = await readStore();
  const next = events.map(event =>
    event.event_id === updated.event_id ? updated : event,
  );
  await writeStore(sortEventsByDeterministicOrder(next));
};

export const removeEvent = async (eventId: string) => {
  const events = await readStore();
  await writeStore(events.filter(event => event.event_id !== eventId));
};

export const fetchEvents = async (
  trackerId?: string,
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
