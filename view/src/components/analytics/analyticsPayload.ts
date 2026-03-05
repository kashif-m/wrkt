import { JsonObject } from '../../TrackerEngine';
import { WorkoutEvent } from '../../workoutFlows';

const pickNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

const pickString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined;

export const toAnalyticsInputEvents = (events: WorkoutEvent[]): JsonObject[] =>
  events.map(event => {
    const payload = event.payload ?? {};
    const compactPayload: Record<string, unknown> = {};
    const exercise = pickString(payload.exercise);
    const exerciseSlug = pickString(payload.exercise_slug);
    const reps = pickNumber(payload.reps);
    const weight = pickNumber(payload.weight);
    const duration = pickNumber(payload.duration);
    const distance = pickNumber(payload.distance);

    if (exercise) compactPayload.exercise = exercise;
    if (exerciseSlug) compactPayload.exercise_slug = exerciseSlug;
    if (typeof reps === 'number') compactPayload.reps = reps;
    if (typeof weight === 'number') compactPayload.weight = weight;
    if (typeof duration === 'number') compactPayload.duration = duration;
    if (typeof distance === 'number') compactPayload.distance = distance;

    return {
      ts: event.ts,
      payload: compactPayload,
    } as JsonObject;
  });
