import { TurboModuleRegistry } from 'react-native';
import { BrandedString, DslText, JsonText } from './domain/types';
import { beginBridgePerfTrace } from './perf/bridgePerf';
import type {
  PrResult,
  WorkoutAnalyticsCapabilities,
} from './domain/generated/workoutDomainContract';

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
type BridgeCacheOptions = {
  enabled?: boolean;
  eventsRevision?: number;
  catalogRevision?: number;
};
type BridgeTraceOptions = {
  trace?: string;
  cache?: BridgeCacheOptions;
};
type BridgeCacheEntry = {
  value: JsonValue;
  createdAt: number;
};
const BRIDGE_CACHE_MAX_ENTRIES = 256;
const bridgeCache = new Map<string, BridgeCacheEntry>();

interface TrackerEngineBinding {
  compileTracker: (dsl: DslText) => JsonText;
  compileWorkoutTracker: () => JsonText;
  validateEvent: (dsl: DslText, event: JsonText) => JsonText;
  validateWorkoutEvent: (event: JsonText) => JsonText;
  compute: (dsl: DslText, events: JsonText, query: JsonText) => JsonText;
  computeWorkoutTracker: (events: JsonText, query: JsonText) => JsonText;
  simulate: (
    dsl: DslText,
    base: JsonText,
    hypotheticals: JsonText,
    query: JsonText,
  ) => JsonText;
  simulateWorkoutTracker: (
    base: JsonText,
    hypotheticals: JsonText,
    query: JsonText,
  ) => JsonText;
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
  computeHomeDaysAnalytics: (
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
  getWorkoutAnalyticsCapabilities?: () => JsonText;
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

const hashText = (value: string): string => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
};

const mixHash = (hash: number, value: number): number => {
  hash ^= value;
  return Math.imul(hash, 16777619);
};

const eventsFingerprint = (events: JsonObject[]): string => {
  if (events.length === 0) return '0';
  let hash = 2166136261;
  let minTs = Number.MAX_SAFE_INTEGER;
  let maxTs = 0;
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    const rawTs = Number(event.ts ?? 0);
    const ts = Number.isFinite(rawTs) ? rawTs : 0;
    if (ts < minTs) minTs = ts;
    if (ts > maxTs) maxTs = ts;
    hash = mixHash(hash, ts & 0xffff);
    hash = mixHash(hash, (ts >>> 16) & 0xffff);

    const payload = event.payload as JsonObject | undefined;
    const exercise = payload?.exercise;
    if (typeof exercise === 'string') {
      for (let i = 0; i < exercise.length; i += 1) {
        hash = mixHash(hash, exercise.charCodeAt(i));
      }
    }
  }
  return `${events.length}:${minTs}:${maxTs}:${(hash >>> 0).toString(16)}`;
};

const payloadBytes = (...parts: string[]) =>
  parts.reduce((sum, part) => sum + part.length, 0);

const traceBridgeCall = <T>(
  fn: string,
  options: BridgeTraceOptions | undefined,
  queryJson: string,
  bytes: number,
  action: () => T,
): T => {
  const endTrace = beginBridgePerfTrace({
    scope: options?.trace ?? 'unscoped',
    functionName: fn,
    queryKey: hashText(queryJson),
    payloadBytes: bytes,
  });
  try {
    return action();
  } finally {
    endTrace();
  }
};

const serializeForCache = (query: unknown): string => {
  if (query == null) {
    return '';
  }
  if (typeof query === 'string') {
    return query;
  }
  try {
    return JSON.stringify(query);
  } catch {
    return String(query);
  }
};

const computeCacheKey = (
  fn: string,
  options: BridgeTraceOptions | undefined,
  offset: number,
  query: unknown,
): string | null => {
  const cache = options?.cache;
  if (!cache?.enabled) {
    return null;
  }
  const eventsRevision = cache.eventsRevision ?? -1;
  const catalogRevision = cache.catalogRevision ?? -1;
  const queryHash = hashText(serializeForCache(query));
  return `${fn}|er:${eventsRevision}|cr:${catalogRevision}|off:${offset}|q:${queryHash}`;
};

const readBridgeCache = <T extends JsonValue>(
  cacheKey: string | null,
): T | null => {
  if (!cacheKey) return null;
  const entry = bridgeCache.get(cacheKey);
  if (!entry) return null;
  return entry.value as T;
};

const writeBridgeCache = (cacheKey: string | null, value: JsonValue) => {
  if (!cacheKey) return;
  bridgeCache.set(cacheKey, { value, createdAt: Date.now() });
  if (bridgeCache.size > BRIDGE_CACHE_MAX_ENTRIES) {
    const firstKey = bridgeCache.keys().next().value as string | undefined;
    if (firstKey) {
      bridgeCache.delete(firstKey);
    }
  }
};

const call = <T extends JsonValue>(
  fn: keyof TrackerEngineBinding,
  ...args: Array<DslText | JsonText>
): T => {
  const engine = ensureBinding();
  const method = engine[fn] as (
    ...inner: Array<DslText | JsonText>
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
  options?: BridgeTraceOptions,
) => {
  const eventsJson = JSON.stringify(events) as JsonText;
  const queryJson = stringify(query);
  const dslText = dsl as unknown as string;
  const traceKey = `${dslText}|${queryJson}|events:${events.length}`;
  return traceBridgeCall(
    'compute',
    options,
    traceKey,
    payloadBytes(dslText, eventsJson as unknown as string, queryJson),
    () => call<JsonObject>('compute', dsl, eventsJson, queryJson),
  );
};

export const simulate = async (
  dsl: DslText,
  baseEvents: JsonObject[],
  hypotheticals: JsonObject[],
  query: JsonObject,
  options?: BridgeTraceOptions,
) => {
  const baseJson = JSON.stringify(baseEvents) as JsonText;
  const hypotheticalJson = JSON.stringify(hypotheticals) as JsonText;
  const queryJson = stringify(query);
  const dslText = dsl as unknown as string;
  const traceKey = `${dslText}|${queryJson}|base:${baseEvents.length}|hyp:${hypotheticals.length}`;
  return traceBridgeCall(
    'simulate',
    options,
    traceKey,
    payloadBytes(
      dslText,
      baseJson as unknown as string,
      hypotheticalJson as unknown as string,
      queryJson,
    ),
    () =>
      call<JsonObject>('simulate', dsl, baseJson, hypotheticalJson, queryJson),
  );
};

export const compileTracker = async (dsl: DslText) =>
  call<JsonObject>('compileTracker', dsl);

export const compileWorkoutTracker = async () => {
  const engine = ensureBinding();
  return parse<JsonObject>(engine.compileWorkoutTracker());
};

export const validateWorkoutEvent = async (event: JsonObject) => {
  const engine = ensureBinding();
  const eventJson = stringify(event);
  return parse<JsonObject>(engine.validateWorkoutEvent(eventJson));
};

export const computeWorkoutTracker = async (
  events: JsonObject[],
  query: JsonObject,
  options?: BridgeTraceOptions,
) => {
  const engine = ensureBinding();
  const eventsJson = JSON.stringify(events) as JsonText;
  const queryJson = stringify(query);
  const traceKey = `workout_builtin|${queryJson}|events:${events.length}`;
  return traceBridgeCall(
    'computeWorkoutTracker',
    options,
    traceKey,
    payloadBytes(eventsJson as unknown as string, queryJson),
    () => parse<JsonObject>(engine.computeWorkoutTracker(eventsJson, queryJson)),
  );
};

export const simulateWorkoutTracker = async (
  baseEvents: JsonObject[],
  hypotheticals: JsonObject[],
  query: JsonObject,
  options?: BridgeTraceOptions,
) => {
  const engine = ensureBinding();
  const baseJson = JSON.stringify(baseEvents) as JsonText;
  const hypotheticalJson = JSON.stringify(hypotheticals) as JsonText;
  const queryJson = stringify(query);
  const traceKey = `workout_builtin|${queryJson}|base:${baseEvents.length}|hyp:${hypotheticals.length}`;
  return traceBridgeCall(
    'simulateWorkoutTracker',
    options,
    traceKey,
    payloadBytes(
      baseJson as unknown as string,
      hypotheticalJson as unknown as string,
      queryJson,
    ),
    () => parse<JsonObject>(engine.simulateWorkoutTracker(baseJson, hypotheticalJson, queryJson)),
  );
};

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
  HomeDaysQuery,
  HomeDaysResponse,
  WorkoutAnalyticsQuery,
  WorkoutMetricsSeries,
} from './domain/analytics';

export const computeAnalytics = (
  events: JsonObject[],
  offset: number,
  catalog: JsonObject[],
  options?: BridgeTraceOptions,
): AnalyticsSummary => {
  const engine = ensureBinding();
  const eventKey = eventsFingerprint(events);
  const cacheKey = computeCacheKey('computeAnalytics', options, offset, {
    type: 'summary',
    eventKey,
  });
  const cached = readBridgeCache<JsonObject>(cacheKey);
  if (cached) {
    return cached as unknown as AnalyticsSummary;
  }
  const eventsJson = JSON.stringify(events) as JsonText;
  const catalogJson = JSON.stringify(catalog) as JsonText;
  const traceKey = `${offset}|events:${events.length}|catalog:${catalog.length}`;
  const result = traceBridgeCall(
    'computeAnalytics',
    options,
    traceKey,
    payloadBytes(
      eventsJson as unknown as string,
      catalogJson as unknown as string,
    ),
    () => engine.computeAnalytics(eventsJson, offset, catalogJson),
  );
  const parsed = JSON.parse(result) as AnalyticsSummary;
  writeBridgeCache(cacheKey, parsed as unknown as JsonObject);
  return parsed;
};

export const computeWorkoutAnalytics = (
  events: JsonObject[],
  offset: number,
  catalog: JsonObject[],
  query: WorkoutAnalyticsQuery,
  options?: BridgeTraceOptions,
): WorkoutMetricsSeries => {
  const engine = ensureBinding();
  const eventKey = eventsFingerprint(events);
  const cacheKey = computeCacheKey('computeWorkoutAnalytics', options, offset, {
    query,
    eventKey,
  });
  const cached = readBridgeCache<JsonObject>(cacheKey);
  if (cached) {
    return cached as unknown as WorkoutMetricsSeries;
  }
  const eventsJson = JSON.stringify(events) as JsonText;
  const catalogJson = JSON.stringify(catalog) as JsonText;
  const queryJson = JSON.stringify(query) as JsonText;
  const traceKey = `${offset}|${queryJson}|events:${events.length}|catalog:${catalog.length}`;
  const result = traceBridgeCall(
    'computeWorkoutAnalytics',
    options,
    traceKey,
    payloadBytes(
      eventsJson as unknown as string,
      catalogJson as unknown as string,
      queryJson as unknown as string,
    ),
    () =>
      engine.computeWorkoutAnalytics(
        eventsJson,
        offset,
        catalogJson,
        queryJson,
      ),
  );
  const parsed = JSON.parse(result) as WorkoutMetricsSeries;
  writeBridgeCache(cacheKey, parsed as unknown as JsonObject);
  return parsed;
};

export const computeBreakdownAnalytics = (
  events: JsonObject[],
  offset: number,
  catalog: JsonObject[],
  query: BreakdownQuery,
  options?: BridgeTraceOptions,
): BreakdownResponse => {
  const engine = ensureBinding();
  const eventKey = eventsFingerprint(events);
  const cacheKey = computeCacheKey(
    'computeBreakdownAnalytics',
    options,
    offset,
    {
      query,
      eventKey,
    },
  );
  const cached = readBridgeCache<JsonObject>(cacheKey);
  if (cached) {
    return cached as unknown as BreakdownResponse;
  }
  const eventsJson = JSON.stringify(events) as JsonText;
  const catalogJson = JSON.stringify(catalog) as JsonText;
  const queryJson = JSON.stringify(query) as JsonText;
  const traceKey = `${offset}|${queryJson}|events:${events.length}|catalog:${catalog.length}`;
  const result = traceBridgeCall(
    'computeBreakdownAnalytics',
    options,
    traceKey,
    payloadBytes(
      eventsJson as unknown as string,
      catalogJson as unknown as string,
      queryJson as unknown as string,
    ),
    () =>
      engine.computeBreakdownAnalytics(
        eventsJson,
        offset,
        catalogJson,
        queryJson,
      ),
  );
  const parsed = JSON.parse(result) as BreakdownResponse;
  writeBridgeCache(cacheKey, parsed as unknown as JsonObject);
  return parsed;
};

export const computeExerciseAnalytics = (
  events: JsonObject[],
  offset: number,
  catalog: JsonObject[],
  query: ExerciseSeriesQuery,
  options?: BridgeTraceOptions,
): ExerciseSeriesResponse => {
  const engine = ensureBinding();
  const eventKey = eventsFingerprint(events);
  const cacheKey = computeCacheKey(
    'computeExerciseAnalytics',
    options,
    offset,
    {
      query,
      eventKey,
    },
  );
  const cached = readBridgeCache<JsonObject>(cacheKey);
  if (cached) {
    return cached as unknown as ExerciseSeriesResponse;
  }
  const eventsJson = JSON.stringify(events) as JsonText;
  const catalogJson = JSON.stringify(catalog) as JsonText;
  const queryJson = JSON.stringify(query) as JsonText;
  const traceKey = `${offset}|${queryJson}|events:${events.length}|catalog:${catalog.length}`;
  const result = traceBridgeCall(
    'computeExerciseAnalytics',
    options,
    traceKey,
    payloadBytes(
      eventsJson as unknown as string,
      catalogJson as unknown as string,
      queryJson as unknown as string,
    ),
    () =>
      engine.computeExerciseAnalytics(
        eventsJson,
        offset,
        catalogJson,
        queryJson,
      ),
  );
  const parsed = JSON.parse(result) as ExerciseSeriesResponse;
  writeBridgeCache(cacheKey, parsed as unknown as JsonObject);
  return parsed;
};

export const computeHomeDayAnalytics = (
  events: JsonObject[],
  offset: number,
  catalog: JsonObject[],
  query: HomeDayQuery,
  options?: BridgeTraceOptions,
): HomeDayResponse => {
  const engine = ensureBinding();
  const eventKey = eventsFingerprint(events);
  const cacheKey = computeCacheKey('computeHomeDayAnalytics', options, offset, {
    query,
    eventKey,
  });
  const cached = readBridgeCache<JsonObject>(cacheKey);
  if (cached) {
    return cached as unknown as HomeDayResponse;
  }
  const eventsJson = JSON.stringify(events) as JsonText;
  const catalogJson = JSON.stringify(catalog) as JsonText;
  const queryJson = JSON.stringify(query) as JsonText;
  const traceKey = `${offset}|${queryJson}|events:${events.length}|catalog:${catalog.length}`;
  const result = traceBridgeCall(
    'computeHomeDayAnalytics',
    options,
    traceKey,
    payloadBytes(
      eventsJson as unknown as string,
      catalogJson as unknown as string,
      queryJson as unknown as string,
    ),
    () =>
      engine.computeHomeDayAnalytics(
        eventsJson,
        offset,
        catalogJson,
        queryJson,
      ),
  );
  const parsed = JSON.parse(result) as HomeDayResponse;
  writeBridgeCache(cacheKey, parsed as unknown as JsonObject);
  return parsed;
};

export const computeHomeDaysAnalytics = (
  events: JsonObject[],
  offset: number,
  catalog: JsonObject[],
  query: HomeDaysQuery,
  options?: BridgeTraceOptions,
): HomeDaysResponse => {
  const engine = ensureBinding();
  const eventKey = eventsFingerprint(events);
  const cacheKey = computeCacheKey(
    'computeHomeDaysAnalytics',
    options,
    offset,
    {
      query,
      eventKey,
    },
  );
  const cached = readBridgeCache<JsonObject>(cacheKey);
  if (cached) {
    return cached as unknown as HomeDaysResponse;
  }
  const eventsJson = JSON.stringify(events) as JsonText;
  const catalogJson = JSON.stringify(catalog) as JsonText;
  const queryJson = JSON.stringify(query) as JsonText;
  const traceKey = `${offset}|${queryJson}|events:${events.length}|catalog:${catalog.length}`;
  const result = traceBridgeCall(
    'computeHomeDaysAnalytics',
    options,
    traceKey,
    payloadBytes(
      eventsJson as unknown as string,
      catalogJson as unknown as string,
      queryJson as unknown as string,
    ),
    () =>
      engine.computeHomeDaysAnalytics(
        eventsJson,
        offset,
        catalogJson,
        queryJson,
      ),
  );
  const parsed = JSON.parse(result) as HomeDaysResponse;
  writeBridgeCache(cacheKey, parsed as unknown as JsonObject);
  return parsed;
};

export const computeCalendarMonthAnalytics = (
  events: JsonObject[],
  offset: number,
  catalog: JsonObject[],
  query: CalendarMonthQuery,
  options?: BridgeTraceOptions,
): CalendarMonthResponse => {
  const engine = ensureBinding();
  const eventKey = eventsFingerprint(events);
  const cacheKey = computeCacheKey(
    'computeCalendarMonthAnalytics',
    options,
    offset,
    {
      query,
      eventKey,
    },
  );
  const cached = readBridgeCache<JsonObject>(cacheKey);
  if (cached) {
    return cached as unknown as CalendarMonthResponse;
  }
  const eventsJson = JSON.stringify(events) as JsonText;
  const catalogJson = JSON.stringify(catalog) as JsonText;
  const queryJson = JSON.stringify(query) as JsonText;
  const traceKey = `${offset}|${queryJson}|events:${events.length}|catalog:${catalog.length}`;
  const result = traceBridgeCall(
    'computeCalendarMonthAnalytics',
    options,
    traceKey,
    payloadBytes(
      eventsJson as unknown as string,
      catalogJson as unknown as string,
      queryJson as unknown as string,
    ),
    () =>
      engine.computeCalendarMonthAnalytics(
        eventsJson,
        offset,
        catalogJson,
        queryJson,
      ),
  );
  const parsed = JSON.parse(result) as CalendarMonthResponse;
  writeBridgeCache(cacheKey, parsed as unknown as JsonObject);
  return parsed;
};

export const getWorkoutAnalyticsCapabilities =
  (): WorkoutAnalyticsCapabilities | null => {
    const engine = ensureBinding();
    if (!engine.getWorkoutAnalyticsCapabilities) {
      return null;
    }
    const result = engine.getWorkoutAnalyticsCapabilities();
    return JSON.parse(result) as WorkoutAnalyticsCapabilities;
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
