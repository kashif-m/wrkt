import { TurboModuleRegistry } from 'react-native';
import { BrandedString, DslText, JsonText, PlannerKind } from './domain/types';

export type JsonValue =
  | null
  | boolean
  | number
  | BrandedString
  | JsonValue[]
  | JsonObject;
export interface JsonObject {
  [key: string]: JsonValue;
}
export type JsonArray = JsonValue[];

interface TrackerEngineBinding {
  compileTracker: (dsl: DslText) => JsonText;
  validateEvent: (dsl: DslText, event: JsonText) => JsonText;
  compute: (dsl: DslText, events: JsonText, query: JsonText) => JsonText;
  simulate: (
    dsl: DslText,
    base: JsonText,
    hypotheticals: JsonText,
    query: JsonText,
  ) => JsonText;
  suggest: (dsl: DslText, events: JsonText, planner: PlannerKind) => JsonText;
  getExerciseCatalog: () => JsonText;
  validateExercise: (entry: JsonText) => JsonText;
  importFitnotes: (path: string) => JsonText;
  // Time policy functions
  roundToLocalDay: (tsMs: number, offsetMinutes: number) => number;
  roundToLocalWeek: (tsMs: number, offsetMinutes: number) => number;
  // Metrics functions
  estimateOneRm: (weight: number, reps: number) => number;
  detectPr: (
    exercise: string,
    eventsJson: JsonText,
    weight: number,
    reps: number,
  ) => JsonText;
  scoreSet: (
    weight: number,
    reps: number,
    duration: number,
    distance: number,
    loggingMode: string,
  ) => number;
  buildPrPayload: (
    payload: JsonText,
    eventTs: number,
    events: JsonText,
    existingEvent: JsonText | null,
    loggingMode: string,
  ) => JsonText;
  computeAnalytics: (
    events: JsonText,
    offset: number,
    catalog: JsonText,
  ) => JsonText;
  computeWorkoutAnalytics: (
    events: JsonText,
    offset: number,
    catalog: JsonText,
    query: JsonText,
  ) => JsonText;
  computeBreakdownAnalytics: (
    events: JsonText,
    offset: number,
    catalog: JsonText,
    query: JsonText,
  ) => JsonText;
  computeExerciseAnalytics: (
    events: JsonText,
    offset: number,
    catalog: JsonText,
    query: JsonText,
  ) => JsonText;
  computeHomeDayAnalytics: (
    events: JsonText,
    offset: number,
    catalog: JsonText,
    query: JsonText,
  ) => JsonText;
  computeCalendarMonthAnalytics: (
    events: JsonText,
    offset: number,
    catalog: JsonText,
    query: JsonText,
  ) => JsonText;
  exportGenericSqlite: (payload: JsonText, outputPath: string) => JsonText;
  importGenericSqlite: (inputPath: string) => JsonText;
}

declare global {
  interface GlobalThis {
    TrackerEngine?: TrackerEngineBinding;
  }
}

// Best-effort warm-up without noisy warning; the JSI binding is installed lazily.
TurboModuleRegistry.get('TrackerEngineModule');

const binding = (globalThis as { TrackerEngine?: TrackerEngineBinding })
  .TrackerEngine;

if (!binding) {
  console.warn(
    'TrackerEngine binding is missing; Strata native module might not be registered yet.',
  );
}

const ensureBinding = (): TrackerEngineBinding => {
  if (!binding) {
    throw new Error('TrackerEngine native module is not available');
  }
  return binding;
};

const parse = <T extends JsonValue>(value: JsonText): T =>
  JSON.parse(value) as T;
const stringify = (value: JsonValue): JsonText =>
  JSON.stringify(value) as JsonText;

const call = <T extends JsonValue>(
  fn: keyof TrackerEngineBinding,
  ...args: Array<DslText | JsonText | PlannerKind>
): T => {
  const engine = ensureBinding();
  const method = engine[fn] as (
    ...inner: Array<DslText | JsonText | PlannerKind>
  ) => JsonText;
  const raw = method(...args);
  return parse<T>(raw);
};

const callRaw = <T extends JsonValue>(
  fn: keyof TrackerEngineBinding,
  ...args: Array<string>
): T => {
  const engine = ensureBinding();
  const method = engine[fn] as (...inner: string[]) => JsonText;
  const raw = method(...args);
  return parse<T>(raw);
};

export const validateEvent = async (dsl: DslText, event: JsonObject) => {
  return call<JsonObject>('validateEvent', dsl, stringify(event));
};

export const compute = async (
  dsl: DslText,
  events: JsonObject[],
  query: JsonObject,
) => {
  return call<JsonObject>(
    'compute',
    dsl,
    JSON.stringify(events) as JsonText,
    stringify(query),
  );
};

export const suggest = async (
  dsl: DslText,
  events: JsonObject[],
  planner: PlannerKind,
) => {
  return call<JsonArray>(
    'suggest',
    dsl,
    JSON.stringify(events) as JsonText,
    planner,
  );
};

export const simulate = async (
  dsl: DslText,
  baseEvents: JsonObject[],
  hypotheticals: JsonObject[],
  query: JsonObject,
) =>
  call<JsonObject>(
    'simulate',
    dsl,
    JSON.stringify(baseEvents) as JsonText,
    JSON.stringify(hypotheticals) as JsonText,
    stringify(query),
  );

export const compileTracker = async (dsl: DslText) =>
  call<JsonObject>('compileTracker', dsl);

export const getExerciseCatalog = async () =>
  call<JsonArray>('getExerciseCatalog');
export const validateExercise = async (entry: JsonObject) => {
  return call<JsonObject>('validateExercise', stringify(entry));
};

export const importFitnotes = async (path: string) => {
  return callRaw<JsonObject>('importFitnotes', path);
};

// --- Time policy functions ---

export const roundToLocalDay = (
  tsMs: number,
  offsetMinutes: number,
): number => {
  const engine = ensureBinding();
  return engine.roundToLocalDay(tsMs, offsetMinutes);
};

export const roundToLocalWeek = (
  tsMs: number,
  offsetMinutes: number,
): number => {
  const engine = ensureBinding();
  return engine.roundToLocalWeek(tsMs, offsetMinutes);
};

// --- Metrics functions ---

export const estimateOneRm = (weight: number, reps: number): number => {
  const engine = ensureBinding();
  return engine.estimateOneRm(weight, reps);
};

export type PrResult = {
  is_pr: boolean;
  pr_type?:
    | 'weight'
    | 'reps'
    | 'estimated_one_rm'
    | 'volume'
    | 'duration'
    | 'distance';
  previous_best?: number;
  new_value: number;
  improvement?: number;
};

export const detectPr = (
  exercise: string,
  events: JsonObject[],
  weight: number,
  reps: number,
): PrResult => {
  const engine = ensureBinding();
  const result = engine.detectPr(
    exercise,
    JSON.stringify(events) as JsonText,
    weight,
    reps,
  );
  return JSON.parse(result) as PrResult;
};

export const scoreSet = (
  weight: number,
  reps: number,
  duration: number,
  distance: number,
  loggingMode: string,
): number => {
  const engine = ensureBinding();
  return engine.scoreSet(weight, reps, duration, distance, loggingMode);
};

export const buildPrPayload = (
  payload: JsonObject,
  eventTs: number,
  events: JsonObject[],
  existingEvent: JsonObject | null,
  loggingMode: string,
): JsonObject => {
  const engine = ensureBinding();
  const result = engine.buildPrPayload(
    JSON.stringify(payload) as JsonText,
    eventTs,
    JSON.stringify(events) as JsonText,
    existingEvent ? (JSON.stringify(existingEvent) as JsonText) : null,
    loggingMode,
  );
  return JSON.parse(result) as JsonObject;
};

import {
  AnalyticsSummary,
  BreakdownQuery,
  BreakdownResponse,
  CalendarMonthQuery,
  CalendarMonthResponse,
  ExerciseSeriesQuery,
  ExerciseSeriesResponse,
  HomeDayQuery,
  HomeDayResponse,
  WorkoutAnalyticsQuery,
  WorkoutMetricsSeries,
} from './domain/analytics';

export const computeAnalytics = (
  events: JsonObject[],
  offset: number,
  catalog: JsonObject[],
): AnalyticsSummary => {
  const engine = ensureBinding();
  const result = engine.computeAnalytics(
    JSON.stringify(events) as JsonText,
    offset,
    JSON.stringify(catalog) as JsonText,
  );
  return JSON.parse(result) as AnalyticsSummary;
};

export const computeWorkoutAnalytics = (
  events: JsonObject[],
  offset: number,
  catalog: JsonObject[],
  query: WorkoutAnalyticsQuery,
): WorkoutMetricsSeries => {
  const engine = ensureBinding();
  const result = engine.computeWorkoutAnalytics(
    JSON.stringify(events) as JsonText,
    offset,
    JSON.stringify(catalog) as JsonText,
    JSON.stringify(query) as JsonText,
  );
  return JSON.parse(result) as WorkoutMetricsSeries;
};

export const computeBreakdownAnalytics = (
  events: JsonObject[],
  offset: number,
  catalog: JsonObject[],
  query: BreakdownQuery,
): BreakdownResponse => {
  const engine = ensureBinding();
  const result = engine.computeBreakdownAnalytics(
    JSON.stringify(events) as JsonText,
    offset,
    JSON.stringify(catalog) as JsonText,
    JSON.stringify(query) as JsonText,
  );
  return JSON.parse(result) as BreakdownResponse;
};

export const computeExerciseAnalytics = (
  events: JsonObject[],
  offset: number,
  catalog: JsonObject[],
  query: ExerciseSeriesQuery,
): ExerciseSeriesResponse => {
  const engine = ensureBinding();
  const result = engine.computeExerciseAnalytics(
    JSON.stringify(events) as JsonText,
    offset,
    JSON.stringify(catalog) as JsonText,
    JSON.stringify(query) as JsonText,
  );
  return JSON.parse(result) as ExerciseSeriesResponse;
};

export const computeHomeDayAnalytics = (
  events: JsonObject[],
  offset: number,
  catalog: JsonObject[],
  query: HomeDayQuery,
): HomeDayResponse => {
  const engine = ensureBinding();
  const result = engine.computeHomeDayAnalytics(
    JSON.stringify(events) as JsonText,
    offset,
    JSON.stringify(catalog) as JsonText,
    JSON.stringify(query) as JsonText,
  );
  return JSON.parse(result) as HomeDayResponse;
};

export const computeCalendarMonthAnalytics = (
  events: JsonObject[],
  offset: number,
  catalog: JsonObject[],
  query: CalendarMonthQuery,
): CalendarMonthResponse => {
  const engine = ensureBinding();
  const result = engine.computeCalendarMonthAnalytics(
    JSON.stringify(events) as JsonText,
    offset,
    JSON.stringify(catalog) as JsonText,
    JSON.stringify(query) as JsonText,
  );
  return JSON.parse(result) as CalendarMonthResponse;
};

export const exportGenericSqlite = (
  payload: JsonObject,
  outputPath = '',
): JsonObject => {
  const engine = ensureBinding();
  const result = engine.exportGenericSqlite(
    JSON.stringify(payload) as JsonText,
    outputPath,
  );
  return JSON.parse(result) as JsonObject;
};

export const importGenericSqlite = (inputPath: string): JsonObject => {
  const engine = ensureBinding();
  const result = engine.importGenericSqlite(inputPath);
  return JSON.parse(result) as JsonObject;
};
