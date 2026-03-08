// AUTO-GENERATED from workout-pack analytics API schema. Do not edit.

import type { WorkoutViewMetricKey } from './workoutDslContract';

export interface StreakResult {
  current_streak: number;
  longest_streak: number;
  total_active_days: number;
  last_active_ts?: number;
  longest_start_ts?: number;
  longest_end_ts?: number;
}

export interface HeatmapPoint {
  date: string;
  timestamp: number;
  count: number;
  level: number;
}

export interface DistributionItem {
  label: string;
  value: number;
  percentage: number;
}

export interface VolumePoint {
  label: string;
  volume: number;
  count: number;
  bucket: number;
}

export type WorkoutMetricKey = WorkoutViewMetricKey<'workouts'>;
export type WorkoutGroupByKey = 'workout' | 'week' | 'month';
export type WorkoutFilterKind = 'none' | 'exercise' | 'muscle';

export interface WorkoutAnalyticsFilter {
  kind: WorkoutFilterKind;
  value?: string | null;
}

export interface WorkoutAnalyticsQuery {
  metric: WorkoutMetricKey;
  group_by: WorkoutGroupByKey;
  filter: WorkoutAnalyticsFilter;
}

export interface WorkoutMetricPoint {
  label: string;
  value: number;
  count: number;
  bucket: number;
}

export interface WorkoutMetricsSeries {
  metric: WorkoutMetricKey;
  group_by: WorkoutGroupByKey;
  points: WorkoutMetricPoint[];
}

export type BreakdownMetricKey = WorkoutViewMetricKey<'breakdown'>;
export type BreakdownGroupByKey = 'muscle' | 'exercise' | 'category';

export interface BreakdownQuery {
  metric: BreakdownMetricKey;
  group_by: BreakdownGroupByKey;
}

export interface BreakdownTotals {
  workouts: number;
  sets: number;
  reps: number;
  volume: number;
  distance?: number;
  active_duration?: number;
  load_distance?: number;
}

export interface BreakdownResponse {
  metric: BreakdownMetricKey;
  group_by: BreakdownGroupByKey;
  items: DistributionItem[];
  totals: BreakdownTotals;
  qa_unmapped_events?: number;
}

export type ExerciseMetricKey = WorkoutViewMetricKey<'exercise_series'>;
export type ExerciseGroupByKey = 'workout' | 'week' | 'month';

export interface ExerciseSeriesQuery {
  exercise: string;
  metric: ExerciseMetricKey;
  group_by: ExerciseGroupByKey;
  rm_reps?: number;
}

export interface ExerciseSeriesPoint {
  label: string;
  value: number;
  count: number;
  bucket: number;
}

export interface ExerciseSeriesResponse {
  exercise: string;
  metric: ExerciseMetricKey;
  group_by: ExerciseGroupByKey;
  points: ExerciseSeriesPoint[];
}

export interface HomeDayQuery {
  day_bucket: number;
}

export interface HomeDaysQuery {
  day_buckets: number[];
}

export interface HomeSetChunk {
  description: string;
  count: number;
}

export interface HomeExerciseSummary {
  exercise: string;
  set_chunks: HomeSetChunk[];
  total_sets: number;
}

export interface HomeSectionSummary {
  key: string;
  label: string;
  exercises: HomeExerciseSummary[];
}

export interface HomeDayTotals {
  total_sets: number;
  total_exercises: number;
  average_sets_per_exercise: number;
}

export interface HomeDayResponse {
  day_bucket: number;
  empty_state: boolean;
  totals: HomeDayTotals;
  sections: HomeSectionSummary[];
  muscle_split: DistributionItem[];
  volume_split: DistributionItem[];
}

export interface HomeDaysResponse {
  days: HomeDayResponse[];
}

export interface CalendarMonthQuery {
  month_bucket: number;
}

export interface CalendarMuscleCount {
  group: string;
  count: number;
}

export interface CalendarMonthResponse {
  month_bucket: number;
  sessions: number;
  attendance_percent: number;
  is_future_month: boolean;
  top_muscles: CalendarMuscleCount[];
  all_muscles: CalendarMuscleCount[];
  pie_data: DistributionItem[];
}

export interface PersonalRecord {
  exercise: string;
  one_rm: number;
  max_weight: number;
  max_reps: number;
  best_volume: number;
}

export interface AnalyticsSummary {
  consistency: StreakResult;
  heatmap: HeatmapPoint[];
  muscle_split: DistributionItem[];
  recent_volume: VolumePoint[];
  prs: PersonalRecord[];
}
