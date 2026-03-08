use std::collections::{BTreeMap, BTreeSet};
use std::env;
use std::fs;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
struct ViewConfig {
    #[serde(default)]
    default_metric: Option<String>,
    #[serde(default)]
    metrics: BTreeMap<String, ViewMetricConfig>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
struct ViewMetricConfig {
    metric: String,
    #[serde(default)]
    label: Option<String>,
    #[serde(default)]
    unit: Option<String>,
    #[serde(default)]
    modes: Vec<String>,
    #[serde(default)]
    requires: Vec<String>,
}

fn main() {
    let manifest_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR").expect("manifest dir"));
    let dsl_path = manifest_dir.join("config/workout_v1.tracker");
    println!("cargo:rerun-if-changed={}", dsl_path.display());

    let dsl = fs::read_to_string(&dsl_path).expect("read workout DSL");
    let compiled = tracker_dsl::compile(&dsl).expect("compile workout DSL");
    let compiled_json = serde_json::to_string(&compiled).expect("serialize compiled tracker");

    let mut metric_names = compiled
        .metrics()
        .iter()
        .map(|metric| metric.name.clone())
        .collect::<Vec<_>>();
    metric_names.sort();

    let mut view_metrics = BTreeMap::<String, Vec<String>>::new();
    let mut view_default_metrics = BTreeMap::<String, String>::new();
    let mut view_metric_config = BTreeMap::<String, BTreeMap<String, ViewMetricConfig>>::new();
    for view in compiled.views() {
        let Some(config_value) = view.params.get("config") else {
            continue;
        };
        let Ok(config) = serde_json::from_value::<ViewConfig>(config_value.clone()) else {
            continue;
        };

        let metrics = config
            .metrics
            .values()
            .map(|entry| entry.metric.clone())
            .collect::<BTreeSet<_>>()
            .into_iter()
            .collect::<Vec<_>>();

        view_metrics.insert(view.name.clone(), metrics);
        if let Some(default_metric) = config.default_metric.clone() {
            view_default_metrics.insert(view.name.clone(), default_metric);
        }
        view_metric_config.insert(view.name.clone(), config.metrics.clone());
    }

    let view_metrics_json =
        serde_json::to_string(&view_metrics).expect("serialize workout view metrics");
    let view_default_metrics_json =
        serde_json::to_string(&view_default_metrics).expect("serialize workout default metrics");
    let view_metric_config_json =
        serde_json::to_string(&view_metric_config).expect("serialize workout view metric config");

    let out_dir = PathBuf::from(env::var("OUT_DIR").expect("OUT_DIR"));
    let output = out_dir.join("workout_tracker_compiled.rs");
    let metric_names_literal = metric_names
        .iter()
        .map(|name| format!("\"{name}\""))
        .collect::<Vec<_>>()
        .join(", ");

    let generated = format!(
        "pub const WORKOUT_TRACKER_DSL: &str = r#\"{}\"#;\n\
         pub const WORKOUT_TRACKER_JSON: &str = r#\"{}\"#;\n\
         pub const WORKOUT_METRIC_NAMES: &[&str] = &[{}];\n\
         pub const WORKOUT_VIEW_METRICS_JSON: &str = r#\"{}\"#;\n\
         pub const WORKOUT_VIEW_DEFAULT_METRICS_JSON: &str = r#\"{}\"#;\n\
         pub const WORKOUT_VIEW_METRIC_CONFIG_JSON: &str = r#\"{}\"#;\n",
        dsl,
        compiled_json,
        metric_names_literal,
        view_metrics_json,
        view_default_metrics_json,
        view_metric_config_json
    );

    fs::write(output, generated).expect("write generated tracker artifact");

    let workspace_dir = manifest_dir
        .parent()
        .expect("workout-pack should be under workspace root");
    let ts_output = workspace_dir.join("view/src/domain/generated/workoutDslContract.ts");
    let api_ts_output = workspace_dir.join("view/src/domain/generated/workoutApiContract.ts");
    let domain_ts_output = workspace_dir.join("view/src/domain/generated/workoutDomainContract.ts");
    if let Some(parent) = ts_output.parent() {
        fs::create_dir_all(parent).expect("create generated TS contract directory");
    }

    let view_metrics_ts = serde_json::to_string_pretty(&view_metrics).expect("serialize TS views");
    let metric_names_ts =
        serde_json::to_string_pretty(&metric_names).expect("serialize TS metrics");
    let view_default_metrics_ts =
        serde_json::to_string_pretty(&view_default_metrics).expect("serialize TS view defaults");
    let view_metric_config_ts =
        serde_json::to_string_pretty(&view_metric_config).expect("serialize TS view metric config");

    let ts_contract = format!(
        "// AUTO-GENERATED from workout-pack/config/workout_v1.tracker. Do not edit.\n\
         \n\
         export const WORKOUT_TRACKER_ID = \"{}\" as const;\n\
         \n\
         export const WORKOUT_METRIC_KEYS = {} as const;\n\
         \n\
         export const WORKOUT_VIEW_METRIC_KEYS = {} as const;\n\
         \n\
         export const WORKOUT_VIEW_DEFAULT_METRIC = {} as const;\n\
         \n\
         export const WORKOUT_VIEW_METRIC_CONFIG = {} as const;\n\
         \n\
         export type WorkoutMetricKey = (typeof WORKOUT_METRIC_KEYS)[number];\n\
         export type WorkoutViewName = keyof typeof WORKOUT_VIEW_METRIC_KEYS;\n\
         export type WorkoutViewMetricKey<V extends WorkoutViewName> = (typeof WORKOUT_VIEW_METRIC_KEYS)[V][number];\n",
        compiled.tracker_id().as_str(),
        metric_names_ts,
        view_metrics_ts,
        view_default_metrics_ts,
        view_metric_config_ts
    );

    fs::write(ts_output, ts_contract).expect("write generated TS contract");

    let api_contract = "\
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
";

    fs::write(api_ts_output, api_contract).expect("write generated workout API contract");

    let domain_contract = "\
// AUTO-GENERATED from workout-pack domain contracts. Do not edit.

import type {
  BrandedString,
  EventId,
  ExerciseName,
  ExerciseSlug,
  ExerciseSource,
  LoggingMode,
  Modality,
  MuscleGroup,
  Tag,
  TrackerId,
} from '../types';

export type DomainJsonValue =
  | null
  | boolean
  | number
  | BrandedString
  | DomainJsonObject
  | DomainJsonValue[];

export type DomainJsonObject = {
  [key: string]: DomainJsonValue;
};

export type WorkoutEvent = DomainJsonObject & {
  event_id: EventId;
  tracker_id: TrackerId;
  ts: number;
  payload: DomainJsonObject;
  meta: DomainJsonObject;
};

export type WorkoutState = {
  events: WorkoutEvent[];
};

export interface BaseExerciseCatalogEntry {
  slug: ExerciseSlug;
  display_name: ExerciseName;
  primary_muscle_group: MuscleGroup;
  secondary_groups: MuscleGroup[];
  modality: Modality;
  logging_mode: LoggingMode;
  suggested_load_range: { min: number; max: number };
  tags?: Tag[];
}

export type ExerciseCatalogEntry = BaseExerciseCatalogEntry & {
  source: ExerciseSource;
  archived?: boolean;
};

export type SetPayload = {
  exercise: ExerciseName;
  exercise_slug?: ExerciseSlug;
  modality?: Modality;
  reps?: number;
  weight?: number;
  duration?: number;
  distance?: number;
  pr?: boolean;
  pr_ts?: number;
};

export type PrType =
  | 'weight'
  | 'reps'
  | 'estimated_one_rm'
  | 'volume'
  | 'duration'
  | 'distance';

export type PrResult = {
  is_pr: boolean;
  pr_type?: PrType;
  previous_best?: number;
  new_value: number;
  improvement?: number;
};

export type FitNotesImportBundle = {
  source: string;
  exercises: Array<{
    slug: string;
    display_name: string;
    primary_muscle_group: string;
    secondary_groups: string[];
    modality: string;
    logging_mode: string;
    suggested_load_range: { min: number; max: number };
    tags?: string[];
  }>;
  events: Array<{
    ts: number;
    exercise: string;
    reps?: number;
    weight?: number;
    distance?: number;
    duration?: number;
    pr?: boolean;
    meta?: Record<string, unknown>;
  }>;
  favorites: string[];
  warnings?: Array<{ kind: string; message: string }>;
};

export type FitNotesImportSummary = {
  eventsImported: number;
  exercisesAdded: number;
  exercisesSkipped: number;
  favoritesAdded: number;
  warningsCount: number;
};

export type WorkoutAnalyticsCapabilities = {
  views?: Record<
    string,
    {
      metrics?: string[];
      metric_config?: Record<
        string,
        {
          metric?: string;
          label?: string;
          unit?: string;
          modes?: string[];
          requires?: string[];
        }
      >;
    }
  >;
};
";

    fs::write(domain_ts_output, domain_contract).expect("write generated workout domain contract");
}
