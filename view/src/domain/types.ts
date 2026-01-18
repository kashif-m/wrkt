export type Brand<T, B extends string> = T & { readonly __brand: B };
export type BrandedString = Brand<string, string>;

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
  | 'time'
  | 'distance'
  | 'time_distance'
  | 'distance_weight';
export type LoggingMode = Brand<LoggingModeValue, 'LoggingMode'>;
export type Tag = Brand<string, 'Tag'>;
export type ExerciseSource = Brand<'default' | 'custom', 'ExerciseSource'>;
export type SearchQuery = Brand<string, 'SearchQuery'>;
export type NumericInput = Brand<string, 'NumericInput'>;
export type DisplayLabel = Brand<string, 'DisplayLabel'>;
export type ErrorMessage = Brand<string, 'ErrorMessage'>;
export type LabelText = Brand<string, 'LabelText'>;
export type PlaceholderText = Brand<string, 'PlaceholderText'>;
export type ToastText = Brand<string, 'ToastText'>;
export type ColorHex = Brand<string, 'ColorHex'>;
export type ColorValue = Brand<string, 'ColorValue'>;
export type ToastToneValue = 'success' | 'info' | 'danger';
export type ToastTone = Brand<ToastToneValue, 'ToastTone'>;
export type PlannerKindValue = 'strength' | 'hypertrophy' | 'conditioning';
export type PlannerKind = Brand<PlannerKindValue, 'PlannerKind'>;
export type AnalyticsRangeKeyValue = '8w' | '16w' | '6m' | '1y' | 'all';
export type AnalyticsRangeKey = Brand<
  AnalyticsRangeKeyValue,
  'AnalyticsRangeKey'
>;
export type AnalyticsMetricKeyValue = 'volume' | 'sessions';
export type AnalyticsMetricKey = Brand<
  AnalyticsMetricKeyValue,
  'AnalyticsMetricKey'
>;
export type NavKeyValue =
  | 'home'
  | 'calendar'
  | 'browser'
  | 'analytics'
  | 'more';
export type NavKey = Brand<NavKeyValue, 'NavKey'>;
export type ScreenKeyValue =
  | 'home'
  | 'calendar'
  | 'browser'
  | 'log'
  | 'analytics'
  | 'more'
  | 'history'
  | 'importSummary';
export type ScreenKey = Brand<ScreenKeyValue, 'ScreenKey'>;
export type EventId = Brand<string, 'EventId'>;
export type TrackerId = Brand<string, 'TrackerId'>;
export type JsonText = Brand<string, 'JsonText'>;
export type JsonString = Brand<string, 'JsonString'>;
export type DslText = Brand<string, 'DslText'>;
export type StorageKey = Brand<string, 'StorageKey'>;
export type MetricKey = Brand<string, 'MetricKey'>;
export type JsonKey = Brand<string, 'JsonKey'>;

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
  'time',
  'distance',
  'time_distance',
  'distance_weight',
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
export const asLabelText = (value: string): LabelText => value as LabelText;
export const asPlaceholderText = (value: string): PlaceholderText =>
  value as PlaceholderText;
export const asToastText = (value: string): ToastText => value as ToastText;
export const asColorHex = (value: string): ColorHex => value as ColorHex;
export const asColorValue = (value: string): ColorValue => value as ColorValue;
export const asToastTone = (value: ToastToneValue): ToastTone =>
  value as ToastTone;
export const unwrapToastTone = (value: ToastTone): ToastToneValue =>
  value as ToastToneValue;
export const asPlannerKind = (value: PlannerKindValue): PlannerKind =>
  value as PlannerKind;
export const unwrapPlannerKind = (value: PlannerKind): PlannerKindValue =>
  value as PlannerKindValue;
export const asAnalyticsRangeKey = (
  value: AnalyticsRangeKeyValue,
): AnalyticsRangeKey => value as AnalyticsRangeKey;
export const asAnalyticsMetricKey = (
  value: AnalyticsMetricKeyValue,
): AnalyticsMetricKey => value as AnalyticsMetricKey;
export const unwrapAnalyticsRangeKey = (
  value: AnalyticsRangeKey,
): AnalyticsRangeKeyValue => value as AnalyticsRangeKeyValue;
export const unwrapAnalyticsMetricKey = (
  value: AnalyticsMetricKey,
): AnalyticsMetricKeyValue => value as AnalyticsMetricKeyValue;
export const asNavKey = (value: NavKeyValue): NavKey => value as NavKey;
export const unwrapNavKey = (value: NavKey): NavKeyValue =>
  value as NavKeyValue;
export const asScreenKey = (value: ScreenKeyValue): ScreenKey =>
  value as ScreenKey;
export const unwrapScreenKey = (value: ScreenKey): ScreenKeyValue =>
  value as ScreenKeyValue;
export const asEventId = (value: string): EventId => value as EventId;
export const asTrackerId = (value: string): TrackerId => value as TrackerId;
export const asJsonText = (value: string): JsonText => value as JsonText;
export const asJsonString = (value: string): JsonString => value as JsonString;
export const asDslText = (value: string): DslText => value as DslText;
export const asStorageKey = (value: string): StorageKey => value as StorageKey;
export const unwrapEventId = (value: EventId): string => value as string;
export const asMetricKey = (value: string): MetricKey => value as MetricKey;
export const asJsonKey = (value: string): JsonKey => value as JsonKey;

export const unwrapLabelText = (value: LabelText): string => value as string;
export const unwrapPlaceholderText = (value: PlaceholderText): string =>
  value as string;
export const unwrapToastText = (value: ToastText): string => value as string;
export const unwrapColorHex = (value: ColorHex): string => value as string;
export const unwrapColorValue = (value: ColorValue): string => value as string;
