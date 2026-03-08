/**
 * Workout metrics utilities - delegates to Rust via TrackerEngine
 */

import {
  estimateOneRm as rustEstimateOneRm,
  scoreSet as rustScoreSet,
  buildPrPayload as rustBuildPrPayload,
} from '../TrackerEngine';
import {
  ExerciseName,
  LoggingMode,
  asLoggingMode,
  unwrapLoggingMode,
} from '../domain/types';
import { ExerciseCatalogEntry } from '../exercise/catalogStorage';
import { WorkoutEvent } from '../workoutFlows';
import type { SetPayload } from '../domain/generated/workoutDomainContract';

// Define strictly for casting
type JsonObject = any;

export const buildPrPayload = (
  payload: SetPayload,
  eventTs: number,
  events: WorkoutEvent[],
  catalog: ExerciseCatalogEntry[],
  existingEvent?: WorkoutEvent,
) => {
  const mode = resolveLoggingMode(payload.exercise, catalog);

  // Cast strict types to JsonObject generic structure for the binding
  const payloadJson = payload as unknown as JsonObject;
  const eventsJson = events as unknown as JsonObject[];
  const existingJson = existingEvent
    ? (existingEvent as unknown as JsonObject)
    : null;

  // Delegate batched calculation to Rust
  const result = rustBuildPrPayload(
    payloadJson,
    eventTs,
    eventsJson,
    existingJson,
    unwrapLoggingMode(mode),
  );

  return {
    ...(payloadJson as JsonObject),
    ...(result as JsonObject),
  } as unknown as SetPayload & { pr?: boolean; pr_ts?: number };
};

const readNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

export const estimateOneRm = (weight: number, reps: number): number =>
  rustEstimateOneRm(weight, reps);

export const resolveLoggingMode = (
  exerciseName: ExerciseName | undefined,
  catalog: ExerciseCatalogEntry[],
): LoggingMode => {
  if (!exerciseName) return asLoggingMode('reps_weight');
  const match = catalog.find(entry => entry.display_name === exerciseName);
  return match?.logging_mode ?? asLoggingMode('reps_weight');
};

export const scoreFromPayload = (
  payload: {
    reps?: number;
    weight?: number;
    duration?: number;
    distance?: number;
  },
  mode: LoggingMode,
): number | null => {
  const reps = readNumber(payload.reps);
  const weight = readNumber(payload.weight);
  const duration = readNumber(payload.duration);
  const distance = readNumber(payload.distance);

  const score = rustScoreSet(
    weight ?? 0,
    reps ?? 0,
    duration ?? 0,
    distance ?? 0,
    unwrapLoggingMode(mode),
  );
  return score > 0 ? score : null;
};
