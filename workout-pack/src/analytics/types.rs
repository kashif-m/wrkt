use serde::{Deserialize, Serialize};
use tracker_analytics::{DistributionItem, HeatmapPoint, StreakResult};

use crate::catalog::{LoggingMode, Modality};

#[derive(Deserialize)]
pub struct AnalyticsInputEvent {
    pub ts: i64,
    pub payload: serde_json::Value,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct VolumePoint {
    pub label: String,
    pub volume: f32,
    pub count: i32,
    pub bucket: i64,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct PersonalRecord {
    pub exercise: String,
    pub one_rm: f32,
    pub max_weight: f32,
    pub max_reps: i32,
    pub best_volume: f32,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct AnalyticsSummary {
    pub consistency: StreakResult,
    pub heatmap: Vec<HeatmapPoint>,
    pub muscle_split: Vec<DistributionItem>,
    pub recent_volume: Vec<VolumePoint>,
    pub prs: Vec<PersonalRecord>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "snake_case")]
pub enum WorkoutMetric {
    Volume,
    Sets,
    Reps,
    Duration,
    Distance,
    ActiveDuration,
    LoadDistance,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "snake_case")]
pub enum WorkoutGroupBy {
    Workout,
    Week,
    Month,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "snake_case")]
pub enum WorkoutFilterKind {
    None,
    Exercise,
    Muscle,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct WorkoutAnalyticsFilter {
    pub kind: WorkoutFilterKind,
    pub value: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct WorkoutAnalyticsQuery {
    pub metric: WorkoutMetric,
    pub group_by: WorkoutGroupBy,
    pub filter: WorkoutAnalyticsFilter,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct WorkoutMetricPoint {
    pub label: String,
    pub value: f32,
    pub count: i32,
    pub bucket: i64,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct WorkoutMetricsSeries {
    pub metric: WorkoutMetric,
    pub group_by: WorkoutGroupBy,
    pub points: Vec<WorkoutMetricPoint>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "snake_case")]
pub enum ExerciseMetric {
    EstimatedOneRm,
    MaxWeight,
    WorkoutWeight,
    PrByRm,
    MaxReps,
    MaxVolume,
    WorkoutVolume,
    WorkoutReps,
    MaxDistance,
    WorkoutDistance,
    MaxActiveDuration,
    WorkoutActiveDuration,
    MaxLoadDistance,
    WorkoutLoadDistance,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "snake_case")]
pub enum ExerciseGroupBy {
    Workout,
    Week,
    Month,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ExerciseSeriesQuery {
    pub exercise: String,
    pub metric: ExerciseMetric,
    pub group_by: ExerciseGroupBy,
    #[serde(default)]
    pub rm_reps: Option<i32>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ExerciseSeriesPoint {
    pub label: String,
    pub value: f32,
    pub count: i32,
    pub bucket: i64,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ExerciseSeries {
    pub exercise: String,
    pub metric: ExerciseMetric,
    pub group_by: ExerciseGroupBy,
    pub points: Vec<ExerciseSeriesPoint>,
}

#[derive(Clone, Debug)]
pub struct CatalogEntryLite {
    pub muscle: String,
    pub logging_mode: LoggingMode,
    pub modality: Modality,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct HomeDayQuery {
    pub day_bucket: i64,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct HomeDaysQuery {
    pub day_buckets: Vec<i64>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct HomeSetChunk {
    pub description: String,
    pub count: i32,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct HomeExerciseSummary {
    pub exercise: String,
    pub set_chunks: Vec<HomeSetChunk>,
    pub total_sets: i32,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct HomeSectionSummary {
    pub key: String,
    pub label: String,
    pub exercises: Vec<HomeExerciseSummary>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct HomeDayTotals {
    pub total_sets: i32,
    pub total_exercises: i32,
    pub average_sets_per_exercise: i32,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct HomeDayResponse {
    pub day_bucket: i64,
    pub empty_state: bool,
    pub totals: HomeDayTotals,
    pub sections: Vec<HomeSectionSummary>,
    pub muscle_split: Vec<DistributionItem>,
    pub volume_split: Vec<DistributionItem>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct HomeDaysResponse {
    pub days: Vec<HomeDayResponse>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct CalendarMonthQuery {
    pub month_bucket: i64,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct CalendarMuscleCount {
    pub group: String,
    pub count: i32,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct CalendarMonthResponse {
    pub month_bucket: i64,
    pub sessions: i32,
    pub attendance_percent: f32,
    pub is_future_month: bool,
    pub top_muscles: Vec<CalendarMuscleCount>,
    pub all_muscles: Vec<CalendarMuscleCount>,
    pub pie_data: Vec<DistributionItem>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "snake_case")]
pub enum BreakdownMetric {
    Volume,
    Sets,
    Reps,
    Distance,
    ActiveDuration,
    LoadDistance,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "snake_case")]
pub enum BreakdownGroupBy {
    Muscle,
    Exercise,
    Category,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct BreakdownQuery {
    pub metric: BreakdownMetric,
    pub group_by: BreakdownGroupBy,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct BreakdownTotals {
    pub workouts: i32,
    pub sets: i32,
    pub reps: i32,
    pub volume: f32,
    pub distance: f32,
    pub active_duration: f32,
    pub load_distance: f32,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct BreakdownResponse {
    pub metric: BreakdownMetric,
    pub group_by: BreakdownGroupBy,
    pub items: Vec<DistributionItem>,
    pub totals: BreakdownTotals,
    pub qa_unmapped_events: i32,
}
