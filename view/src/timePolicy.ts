import { EventId, unwrapEventId } from './domain/types';
import {
  roundToLocalDay as rustRoundToLocalDay,
  roundToLocalWeek as rustRoundToLocalWeek,
} from './TrackerEngine';

export type TimeGrain = 'day' | 'week';

export const getLocalOffsetMinutes = () => -new Date().getTimezoneOffset();

export const roundToLocalDay = (
  timestampMs: number,
  offsetMinutes = getLocalOffsetMinutes(),
): number => {
  const result = rustRoundToLocalDay(timestampMs, offsetMinutes);
  if (!Number.isFinite(result)) {
    console.error('roundToLocalDay returned invalid result', {
      timestampMs,
      offsetMinutes,
      result,
    });
    throw new Error('roundToLocalDay: invalid result from native module');
  }
  return result;
};

export const roundToLocalWeek = (
  timestampMs: number,
  offsetMinutes = getLocalOffsetMinutes(),
): number => {
  const result = rustRoundToLocalWeek(timestampMs, offsetMinutes);
  if (!Number.isFinite(result)) {
    console.error('roundToLocalWeek returned invalid result', {
      timestampMs,
      offsetMinutes,
      result,
    });
    throw new Error('roundToLocalWeek: invalid result from native module');
  }
  return result;
};

export const sortEventsByDeterministicOrder = <
  T extends { ts?: number; event_id?: EventId },
>(
  events: T[],
) =>
  [...events].sort((a, b) => {
    const delta = (a.ts ?? 0) - (b.ts ?? 0);
    if (delta !== 0) return delta;
    const aId = a.event_id ? unwrapEventId(a.event_id) : '';
    const bId = b.event_id ? unwrapEventId(b.event_id) : '';
    return aId.localeCompare(bId);
  });
