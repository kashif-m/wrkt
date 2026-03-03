type BridgePerfMeta = {
  scope: string;
  functionName: string;
  queryKey: string;
  payloadBytes: number;
};

type BridgePerfEntry = {
  count: number;
  totalMs: number;
  durationsMs: number[];
  recentCallsMs: number[];
};

const MAX_SAMPLES = 240;
const LOG_EVERY = 8;
const RECENT_WINDOW_MS = 1200;
const stats = new Map<string, BridgePerfEntry>();
const scopeCallBudgets: Record<string, number> = {
  'home/day-change': 1,
  'calendar/month-change': 1,
  'trends/workouts': 2,
  'trends/breakdown': 2,
  'trends/exercises': 2,
  'logging/trends': 2,
};

const nowMs = () => Date.now();

const percentile = (values: number[], p: number): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
  );
  return sorted[index];
};

const record = (key: string, durationMs: number) => {
  const current = stats.get(key) ?? {
    count: 0,
    totalMs: 0,
    durationsMs: [],
    recentCallsMs: [],
  };
  const now = Date.now();
  current.count += 1;
  current.totalMs += durationMs;
  current.durationsMs.push(durationMs);
  current.recentCallsMs.push(now);
  if (current.durationsMs.length > MAX_SAMPLES) {
    current.durationsMs.shift();
  }
  while (
    current.recentCallsMs.length > 0 &&
    now - current.recentCallsMs[0] > RECENT_WINDOW_MS
  ) {
    current.recentCallsMs.shift();
  }
  stats.set(key, current);
  return current;
};

export const beginBridgePerfTrace = (
  meta: BridgePerfMeta,
): (() => void) => {
  if (!__DEV__) {
    return () => {};
  }

  const start = nowMs();
  return () => {
    const durationMs = nowMs() - start;
    const key = `${meta.scope}::${meta.functionName}`;
    const entry = record(key, durationMs);
    const budget = scopeCallBudgets[meta.scope];
    if (
      typeof budget === 'number' &&
      entry.recentCallsMs.length > budget &&
      entry.count % LOG_EVERY === 0
    ) {
      console.warn(
        `[bridge-perf][budget] scope=${meta.scope} recent_calls=${entry.recentCallsMs.length} budget=${budget} window_ms=${RECENT_WINDOW_MS}`,
      );
    }

    if (entry.count === 1 || entry.count % LOG_EVERY === 0) {
      const p50 = percentile(entry.durationsMs, 50);
      const p95 = percentile(entry.durationsMs, 95);
      const avg = entry.totalMs / entry.count;
      const payloadKb = meta.payloadBytes / 1024;
      console.log(
        `[bridge-perf] scope=${meta.scope} fn=${meta.functionName} calls=${entry.count} avg=${avg.toFixed(
          2,
        )}ms p50=${p50.toFixed(2)}ms p95=${p95.toFixed(
          2,
        )}ms last=${durationMs.toFixed(2)}ms payload=${payloadKb.toFixed(
          1,
        )}KB query=${meta.queryKey}`,
      );
    }
  };
};
