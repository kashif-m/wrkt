export type Brand<T, B extends string> = T & { readonly __brand: B };

export type ExerciseSlug = Brand<string, 'ExerciseSlug'>;
export type ExerciseName = Brand<string, 'ExerciseName'>;
export type MuscleGroup = Brand<string, 'MuscleGroup'>;
export type ModalityValue =
  | 'strength'
  | 'hypertrophy'
  | 'conditioning'
  | 'bodyweight'
  | 'mobility';
export type Modality = Brand<ModalityValue, 'Modality'>;

export type LoggingModeValue =
  | 'reps_weight'
  | 'reps'
  | 'time_distance'
  | 'distance_time';
export type LoggingMode = Brand<LoggingModeValue, 'LoggingMode'>;
export type Tag = Brand<string, 'Tag'>;
export type ExerciseSource = Brand<'default' | 'custom', 'ExerciseSource'>;
export type SearchQuery = Brand<string, 'SearchQuery'>;
export type NumericInput = Brand<string, 'NumericInput'>;
export type DisplayLabel = Brand<string, 'DisplayLabel'>;
export type ErrorMessage = Brand<string, 'ErrorMessage'>;

export const asExerciseSlug = (value: string): ExerciseSlug =>
  value as ExerciseSlug;
export const asExerciseName = (value: string): ExerciseName =>
  value as ExerciseName;
export const asMuscleGroup = (value: string): MuscleGroup =>
  value as MuscleGroup;
export const asModality = (value: ModalityValue): Modality => value as Modality;
export const asLoggingMode = (value: LoggingModeValue): LoggingMode =>
  value as LoggingMode;
export const unwrapModality = (value: Modality): ModalityValue =>
  value as ModalityValue;
export const unwrapLoggingMode = (value: LoggingMode): LoggingModeValue =>
  value as LoggingModeValue;

const MODALITY_VALUES: ReadonlyArray<ModalityValue> = [
  'strength',
  'hypertrophy',
  'conditioning',
  'bodyweight',
  'mobility',
];

const LOGGING_MODE_VALUES: ReadonlyArray<LoggingModeValue> = [
  'reps_weight',
  'reps',
  'time_distance',
  'distance_time',
];

export const toModality = (
  value: string,
  fallback: Modality = asModality('strength'),
): Modality =>
  MODALITY_VALUES.includes(value as ModalityValue)
    ? asModality(value as ModalityValue)
    : fallback;

export const toLoggingMode = (
  value: string,
  fallback: LoggingMode = asLoggingMode('reps_weight'),
): LoggingMode =>
  LOGGING_MODE_VALUES.includes(value as LoggingModeValue)
    ? asLoggingMode(value as LoggingModeValue)
    : fallback;
export const asTag = (value: string): Tag => value as Tag;
export const asExerciseSource = (value: 'default' | 'custom'): ExerciseSource =>
  value as ExerciseSource;
export const asSearchQuery = (value: string): SearchQuery =>
  value as SearchQuery;
export const asNumericInput = (value: string): NumericInput =>
  value as NumericInput;
export const asDisplayLabel = (value: string): DisplayLabel =>
  value as DisplayLabel;
export const asErrorMessage = (value: string): ErrorMessage =>
  value as ErrorMessage;
