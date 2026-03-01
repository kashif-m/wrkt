/**
 * Shared formatting utilities
 */
import { MuscleGroup, DisplayLabel, asDisplayLabel } from '../domain/types';

/**
 * Converts a muscle group slug to a display label.
 * e.g., 'posterior_chain' → 'Posterior Chain'
 */
export const formatMuscleLabel = (label: MuscleGroup): DisplayLabel =>
  asDisplayLabel(
    label
      .split('_')
      .map(part => (part.length ? part[0].toUpperCase() + part.slice(1) : ''))
      .join(' '),
  );

export const minutesToSeconds = (minutes: number): number =>
  Math.max(0, Math.round(minutes * 60));

export const secondsToMinutes = (seconds: number): number =>
  Math.max(0, seconds / 60);

export const formatDurationMinutes = (seconds: number): string => {
  const minutes = secondsToMinutes(seconds);
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const remainder = minutes - hours * 60;
    const remainderText = formatTrimmedNumber(remainder);
    if (remainder <= 0) return `${hours}h`;
    return `${hours}h ${remainderText}m`;
  }
  return `${formatTrimmedNumber(minutes)} min`;
};

export const formatTrimmedNumber = (value: number, precision = 1): string => {
  if (!Number.isFinite(value)) return '0';
  const rounded = Number(value.toFixed(precision));
  if (Math.abs(rounded % 1) < 0.0001) {
    return `${Math.trunc(rounded)}`;
  }
  return `${rounded}`;
};

export const formatPercent = (value: number, maxPrecision = 2): string => {
  if (!Number.isFinite(value)) return '0%';
  const rounded = Number(value.toFixed(maxPrecision));
  return `${rounded}%`;
};
