use crate::catalog::{ExerciseDefinition, LoadRange, LoggingMode, Modality};
use crate::import::{ImportBundle, ImportWarning, ImportedEvent};
use chrono::{Local, TimeZone};
use rusqlite::{Connection, Row};
use serde_json::json;
use std::collections::{BTreeMap, HashMap};

#[derive(Debug, Clone)]
struct FitNotesCategory {
    id: i64,
    name: String,
}

#[derive(Debug, Clone)]
struct FitNotesExercise {
    id: i64,
    name: String,
    category_id: i64,
    exercise_type_id: i64,
    weight_unit_id: i64,
    is_favourite: bool,
}

#[derive(Debug)]
struct FitNotesLog {
    id: i64,
    exercise_id: i64,
    date: String,
    metric_weight: i64,
    reps: i64,
    unit: i64,
    distance: i64,
    duration_seconds: i64,
    is_personal_record: i64,
}

pub fn import_fitnotes(path: &str) -> Result<ImportBundle, String> {
    let conn = Connection::open(path).map_err(|err| err.to_string())?;
    let categories = load_categories(&conn)?;
    let exercises = load_exercises(&conn)?;
    let logs = load_logs(&conn)?;

    let category_map: HashMap<i64, FitNotesCategory> = categories
        .into_iter()
        .map(|cat| (cat.id, cat))
        .collect();
    let exercise_map: HashMap<i64, FitNotesExercise> = exercises
        .iter()
        .map(|exercise| (exercise.id, exercise.clone()))
        .collect();

    let mut warnings: Vec<ImportWarning> = Vec::new();
    let mut imported_exercises: Vec<ExerciseDefinition> = Vec::new();
    let mut favorites: Vec<String> = Vec::new();
    for exercise in &exercises {
        let category = category_map.get(&exercise.category_id);
        let category_name = category
            .map(|cat| cat.name.as_str())
            .unwrap_or("Unknown");
        let (primary_group, tags) = map_category(category_name);
        let logging_mode = map_logging_mode(exercise.exercise_type_id);
        let modality = map_modality(exercise.exercise_type_id);
        let slug = slugify(&exercise.name);
        if exercise.is_favourite {
            favorites.push(slug.clone());
        }
        imported_exercises.push(ExerciseDefinition {
            slug,
            display_name: exercise.name.clone(),
            primary_muscle_group: primary_group,
            secondary_groups: Vec::new(),
            modality,
            logging_mode,
            suggested_load_range: LoadRange { min: 0, max: 0 },
            tags,
        });
    }

    let mut imported_events: Vec<ImportedEvent> = Vec::new();
    for entry in logs {
        let exercise = match exercise_map.get(&entry.exercise_id) {
            Some(exercise) => exercise,
            None => {
                warnings.push(ImportWarning {
                    kind: "missing_exercise".into(),
                    message: format!(
                        "Skipping set {} because exercise {} is missing",
                        entry.id, entry.exercise_id
                    ),
                });
                continue;
            }
        };
        let ts = match parse_date_to_noon(&entry.date) {
            Some(value) => value,
            None => {
                warnings.push(ImportWarning {
                    kind: "invalid_date".into(),
                    message: format!(
                        "Skipping set {} because date '{}' is invalid",
                        entry.id, entry.date
                    ),
                });
                continue;
            }
        };
        let mut meta = BTreeMap::new();
        meta.insert("fitnotes_log_id".into(), json!(entry.id));
        meta.insert("fitnotes_exercise_id".into(), json!(entry.exercise_id));
        meta.insert("fitnotes_unit".into(), json!(entry.unit));
        meta.insert("fitnotes_weight_unit_id".into(), json!(exercise.weight_unit_id));
        meta.insert(
            "fitnotes_exercise_type_id".into(),
            json!(exercise.exercise_type_id),
        );
        if !entry.date.is_empty() {
            meta.insert("fitnotes_date".into(), json!(entry.date.clone()));
        }
        let reps = if entry.reps > 0 {
            Some(entry.reps as i32)
        } else {
            None
        };
        let weight = if entry.metric_weight > 0 {
            Some(entry.metric_weight as f64)
        } else {
            None
        };
        let distance = if entry.distance > 0 {
            Some(entry.distance as f64)
        } else {
            None
        };
        let duration = if entry.duration_seconds > 0 {
            Some(entry.duration_seconds as f64)
        } else {
            None
        };
        let pr = if entry.is_personal_record > 0 {
            Some(true)
        } else {
            None
        };
        imported_events.push(ImportedEvent {
            ts,
            exercise: exercise.name.clone(),
            reps,
            weight,
            distance,
            duration,
            pr,
            meta,
        });
    }

    Ok(ImportBundle {
        source: "fitnotes".into(),
        exercises: imported_exercises,
        events: imported_events,
        favorites,
        warnings,
    })
}

fn load_categories(conn: &Connection) -> Result<Vec<FitNotesCategory>, String> {
    let mut stmt = conn
        .prepare("SELECT _id, name FROM Category")
        .map_err(|err| err.to_string())?;
    let entries = stmt
        .query_map([], |row| map_category_row(row))
        .map_err(|err| err.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|err| err.to_string())?;
    Ok(entries)
}

fn map_category_row(row: &Row<'_>) -> rusqlite::Result<FitNotesCategory> {
    Ok(FitNotesCategory {
        id: row.get(0)?,
        name: row.get(1)?,
    })
}

fn load_exercises(conn: &Connection) -> Result<Vec<FitNotesExercise>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT _id, name, category_id, exercise_type_id, weight_unit_id, is_favourite FROM exercise",
        )
        .map_err(|err| err.to_string())?;
    let entries = stmt
        .query_map([], |row| map_exercise_row(row))
        .map_err(|err| err.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|err| err.to_string())?;
    Ok(entries)
}

fn map_exercise_row(row: &Row<'_>) -> rusqlite::Result<FitNotesExercise> {
    Ok(FitNotesExercise {
        id: row.get(0)?,
        name: row.get(1)?,
        category_id: row.get(2)?,
        exercise_type_id: row.get(3)?,
        weight_unit_id: row.get(4)?,
        is_favourite: row.get::<_, i64>(5)? > 0,
    })
}

fn load_logs(conn: &Connection) -> Result<Vec<FitNotesLog>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT _id, exercise_id, date, metric_weight, reps, unit, distance, duration_seconds, is_personal_record FROM training_log",
        )
        .map_err(|err| err.to_string())?;
    let entries = stmt
        .query_map([], |row| map_log_row(row))
        .map_err(|err| err.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|err| err.to_string())?;
    Ok(entries)
}

fn map_log_row(row: &Row<'_>) -> rusqlite::Result<FitNotesLog> {
    Ok(FitNotesLog {
        id: row.get(0)?,
        exercise_id: row.get(1)?,
        date: row.get(2)?,
        metric_weight: row.get(3)?,
        reps: row.get(4)?,
        unit: row.get(5)?,
        distance: row.get(6)?,
        duration_seconds: row.get(7)?,
        is_personal_record: row.get(8)?,
    })
}

fn parse_date_to_noon(value: &str) -> Option<i64> {
    let parts: Vec<&str> = value.split('-').collect();
    if parts.len() != 3 {
        return None;
    }
    let year: i32 = parts[0].parse().ok()?;
    let month: u32 = parts[1].parse().ok()?;
    let day: u32 = parts[2].parse().ok()?;
    let date_time = Local.with_ymd_and_hms(year, month, day, 12, 0, 0).single()?;
    Some(date_time.timestamp_millis())
}

fn map_category(name: &str) -> (String, Vec<String>) {
    let lower = name.trim().to_lowercase();
    match lower.as_str() {
        "abs" | "core" => ("core".into(), Vec::new()),
        "cardio" => ("cardio".into(), Vec::new()),
        "posterior chain" => ("posterior_chain".into(), Vec::new()),
        "legs" => ("legs".into(), Vec::new()),
        "back" => ("back".into(), Vec::new()),
        "chest" => ("chest".into(), Vec::new()),
        "biceps" => ("biceps".into(), Vec::new()),
        "triceps" => ("triceps".into(), Vec::new()),
        "shoulders" => ("shoulders".into(), Vec::new()),
        other => (normalize_group(other), vec![name.trim().to_string()]),
    }
}

fn map_logging_mode(exercise_type_id: i64) -> LoggingMode {
    match exercise_type_id {
        1 => LoggingMode::TimeDistance,
        3 => LoggingMode::TimeDistance,
        _ => LoggingMode::RepsWeight,
    }
}

fn map_modality(exercise_type_id: i64) -> Modality {
    match exercise_type_id {
        1 => Modality::Conditioning,
        3 => Modality::Bodyweight,
        _ => Modality::Strength,
    }
}

fn normalize_group(value: &str) -> String {
    slugify(value)
}

fn slugify(value: &str) -> String {
    value
        .trim()
        .to_lowercase()
        .chars()
        .map(|char| if char.is_ascii_alphanumeric() { char } else { '_' })
        .collect::<String>()
        .trim_matches('_')
        .chars()
        .take(40)
        .collect()
}
