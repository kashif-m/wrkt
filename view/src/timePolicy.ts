import { EventId, unwrapEventId } from './domain/types';

export type TimeGrain = 'day' | 'week';

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;

export const getLocalOffsetMinutes = () => -new Date().getTimezoneOffset();

export const roundToLocalDay = (
  timestampMs: number,
  offsetMinutes = getLocalOffsetMinutes(),
) => {
  const offset = offsetMinutes * MINUTE;
  const local = timestampMs + offset;
  const roundedLocal = Math.floor(local / DAY) * DAY;
  return roundedLocal - offset;
};

export const roundToLocalWeek = (
  timestampMs: number,
  offsetMinutes = getLocalOffsetMinutes(),
) => {
  const startOfDay = roundToLocalDay(timestampMs, offsetMinutes);
  const localDate = new Date(startOfDay + offsetMinutes * MINUTE);
  const dayOfWeek = localDate.getUTCDay(); // Sunday = 0
  const mondayBasedOffset = (dayOfWeek + 6) % 7; // convert to Monday = 0
  return startOfDay - mondayBasedOffset * DAY;
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
