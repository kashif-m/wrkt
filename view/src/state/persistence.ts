/**
 * Persistence Middleware
 * Handles debounced writes to storage and background flushing
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, AppStateStatus } from 'react-native';
import { WorkoutEvent } from '../workoutFlows';
import { asStorageKey } from '../domain/types';

const STORAGE_KEY = asStorageKey('strata.workout.events');

let saveTimeout: ReturnType<typeof setTimeout> | null = null;
let pendingState: WorkoutEvent[] | null = null;
let isSaving = false;

// Configurable debounce time (500ms)
const DEBOUNCE_MS = 500;

export const loadAllEvents = async (): Promise<WorkoutEvent[]> => {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as WorkoutEvent[];
  } catch (error) {
    console.warn('[persistence] Failed to load events', error);
    return [];
  }
};

const persistNow = async (events: WorkoutEvent[]) => {
  if (isSaving) return; // Simple mutex - last write wins strategy will handle next call
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
    pendingState = null;
  }
};

export const scheduleSave = (events: WorkoutEvent[]) => {
  pendingState = events;

  if (saveTimeout) {
    clearTimeout(saveTimeout);
  }

  saveTimeout = setTimeout(() => {
    persistNow(events);
  }, DEBOUNCE_MS);
};

// Flush on app background/terminate
const handleAppStateChange = (nextAppState: AppStateStatus) => {
  if (nextAppState.match(/inactive|background/) && pendingState) {
    if (saveTimeout) clearTimeout(saveTimeout);
    console.log('[persistence] Flushing on background');
    persistNow(pendingState);
  }
};

// Initialize listener
AppState.addEventListener('change', handleAppStateChange);
