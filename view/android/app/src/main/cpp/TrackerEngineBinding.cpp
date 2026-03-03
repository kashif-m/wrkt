#include "TrackerEngineBinding.h"

#include <android/log.h>
#include <jsi/jsi.h>

#include <sstream>
#include <string>

using facebook::jsi::Function;
using facebook::jsi::Runtime;
using facebook::jsi::String;
using facebook::jsi::Value;

extern "C" {
struct FfiResult {
  bool success;
  char* data;
};

FfiResult strata_compile_tracker(const char* dsl);
FfiResult strata_validate_event(const char* dsl, const char* event_json);
FfiResult strata_compute(const char* dsl, const char* events_json, const char* query_json);
FfiResult strata_simulate(const char* dsl, const char* base_events_json,
                          const char* hypotheticals_json, const char* query_json);
FfiResult strata_generate_suggestions(const char* dsl, const char* events_json,
                                      const char* planner_kind);
FfiResult strata_exercise_catalog(void);
FfiResult strata_validate_exercise(const char* entry_json);
FfiResult strata_import_fitnotes(const char* path);
void strata_free_string(char* ptr);

// Time policy functions
int64_t strata_round_to_local_day(int64_t ts_ms, int32_t offset_minutes);
int64_t strata_round_to_local_week(int64_t ts_ms, int32_t offset_minutes);

// Metrics functions
double strata_estimate_one_rm(double weight, int32_t reps);
FfiResult strata_detect_pr(const char* exercise, const char* events_json, double new_weight,
                           int32_t new_reps);
double strata_score_set(double weight, int32_t reps, double duration, double distance,
                        const char* logging_mode);
FfiResult strata_build_pr_payload(const char* payload_json, int64_t event_ts,
                                  const char* events_json, const char* existing_event_json,
                                  const char* logging_mode);
FfiResult strata_compute_analytics(const char* events_json, int32_t offset_minutes,
                                   const char* catalog_json);
FfiResult strata_compute_workout_analytics(const char* events_json, int32_t offset_minutes,
                                           const char* catalog_json, const char* query_json);
FfiResult strata_compute_breakdown_analytics(const char* events_json, int32_t offset_minutes,
                                             const char* catalog_json, const char* query_json);
FfiResult strata_compute_exercise_analytics(const char* events_json, int32_t offset_minutes,
                                            const char* catalog_json, const char* query_json);
FfiResult strata_compute_home_day_analytics(const char* events_json, int32_t offset_minutes,
                                            const char* catalog_json, const char* query_json);
FfiResult strata_compute_home_days_analytics(const char* events_json, int32_t offset_minutes,
                                             const char* catalog_json, const char* query_json);
FfiResult strata_compute_calendar_month_analytics(const char* events_json,
                                                  int32_t offset_minutes,
                                                  const char* catalog_json,
                                                  const char* query_json);
FfiResult strata_export_generic_sqlite(const char* payload_json, const char* output_path);
FfiResult strata_import_generic_sqlite(const char* input_path);
}

namespace {

std::string callStrata(const FfiResult& result) {
  if (!result.data) {
    return {};
  }
  std::string value(result.data);
  strata_free_string(result.data);
  if (!result.success) {
    throw std::runtime_error(value);
  }
  return value;
}

Value makeStringResult(Runtime& rt, const std::string& value) {
  return Value(String::createFromUtf8(rt, value));
}

}  // namespace

namespace strata {

void installTrackerEngineBinding(Runtime& rt) {
  __android_log_print(ANDROID_LOG_INFO, "TrackerEngine", "installTrackerEngineBinding invoked");
  auto module = facebook::jsi::Object(rt);

  auto makeFunction = [&](const std::string& name, auto&& lambda) {
    module.setProperty(rt, name.c_str(),
                       Function::createFromHostFunction(
                           rt, facebook::jsi::PropNameID::forUtf8(rt, name), 1,
                           [lambda](Runtime& runtime, const facebook::jsi::Value&,
                                    const facebook::jsi::Value* args, size_t count) -> Value {
                             return lambda(runtime, args, count);
                           }));
  };

  makeFunction("compileTracker", [](Runtime& runtime, const Value* args, size_t count) -> Value {
    if (count < 1 || !args[0].isString()) {
      throw std::invalid_argument("compileTracker requires DSL string");
    }
    auto dsl = args[0].asString(runtime).utf8(runtime);
    auto ffi = strata_compile_tracker(dsl.c_str());
    return makeStringResult(runtime, callStrata(ffi));
  });

  makeFunction("validateEvent", [](Runtime& runtime, const Value* args, size_t count) -> Value {
    if (count < 2 || !args[0].isString() || !args[1].isString()) {
      throw std::invalid_argument("validateEvent requires dsl + event JSON");
    }
    auto dsl = args[0].asString(runtime).utf8(runtime);
    auto event_json = args[1].asString(runtime).utf8(runtime);
    auto ffi = strata_validate_event(dsl.c_str(), event_json.c_str());
    return makeStringResult(runtime, callStrata(ffi));
  });

  makeFunction("compute", [](Runtime& runtime, const Value* args, size_t count) -> Value {
    if (count < 2) {
      throw std::invalid_argument("compute requires dsl + events JSON");
    }
    auto dsl = args[0].asString(runtime).utf8(runtime);
    auto events_json = args[1].asString(runtime).utf8(runtime);
    std::string query_json =
        count >= 3 && args[2].isString() ? args[2].asString(runtime).utf8(runtime) : "{}";
    auto ffi = strata_compute(dsl.c_str(), events_json.c_str(), query_json.c_str());
    return makeStringResult(runtime, callStrata(ffi));
  });

  makeFunction("simulate", [](Runtime& runtime, const Value* args, size_t count) -> Value {
    if (count < 3) {
      throw std::invalid_argument("simulate requires dsl + base events + hypotheticals JSON");
    }
    auto dsl = args[0].asString(runtime).utf8(runtime);
    auto base_json = args[1].asString(runtime).utf8(runtime);
    auto hypo_json = args[2].asString(runtime).utf8(runtime);
    std::string query_json =
        count >= 4 && args[3].isString() ? args[3].asString(runtime).utf8(runtime) : "{}";
    auto ffi =
        strata_simulate(dsl.c_str(), base_json.c_str(), hypo_json.c_str(), query_json.c_str());
    return makeStringResult(runtime, callStrata(ffi));
  });

  makeFunction("suggest", [](Runtime& runtime, const Value* args, size_t count) -> Value {
    if (count < 3) {
      throw std::invalid_argument("suggest requires dsl + events JSON + planner kind");
    }
    auto dsl = args[0].asString(runtime).utf8(runtime);
    auto events_json = args[1].asString(runtime).utf8(runtime);
    auto planner = args[2].asString(runtime).utf8(runtime);
    auto ffi = strata_generate_suggestions(dsl.c_str(), events_json.c_str(), planner.c_str());
    return makeStringResult(runtime, callStrata(ffi));
  });

  makeFunction("getExerciseCatalog",
               [](Runtime& runtime, const Value* args, size_t count) -> Value {
                 auto ffi = strata_exercise_catalog();
                 return makeStringResult(runtime, callStrata(ffi));
               });

  makeFunction("validateExercise", [](Runtime& runtime, const Value* args, size_t count) -> Value {
    if (count < 1 || !args[0].isString()) {
      throw std::invalid_argument("validateExercise requires entry JSON");
    }
    auto entry = args[0].asString(runtime).utf8(runtime);
    auto ffi = strata_validate_exercise(entry.c_str());
    return makeStringResult(runtime, callStrata(ffi));
  });

  makeFunction("importFitnotes", [](Runtime& runtime, const Value* args, size_t count) -> Value {
    if (count < 1 || !args[0].isString()) {
      throw std::invalid_argument("importFitnotes requires file path");
    }
    auto path = args[0].asString(runtime).utf8(runtime);
    auto ffi = strata_import_fitnotes(path.c_str());
    return makeStringResult(runtime, callStrata(ffi));
  });

  // --- Time policy functions ---
  makeFunction("roundToLocalDay", [](Runtime& runtime, const Value* args, size_t count) -> Value {
    if (count < 2 || !args[0].isNumber() || !args[1].isNumber()) {
      throw std::invalid_argument("roundToLocalDay requires ts_ms + offset_minutes");
    }
    int64_t ts_ms = static_cast<int64_t>(args[0].asNumber());
    int32_t offset = static_cast<int32_t>(args[1].asNumber());
    int64_t result = strata_round_to_local_day(ts_ms, offset);
    return Value(static_cast<double>(result));
  });

  makeFunction("roundToLocalWeek", [](Runtime& runtime, const Value* args, size_t count) -> Value {
    if (count < 2 || !args[0].isNumber() || !args[1].isNumber()) {
      throw std::invalid_argument("roundToLocalWeek requires ts_ms + offset_minutes");
    }
    int64_t ts_ms = static_cast<int64_t>(args[0].asNumber());
    int32_t offset = static_cast<int32_t>(args[1].asNumber());
    int64_t result = strata_round_to_local_week(ts_ms, offset);
    return Value(static_cast<double>(result));
  });

  // --- Metrics functions ---
  makeFunction("estimateOneRm", [](Runtime& runtime, const Value* args, size_t count) -> Value {
    if (count < 2 || !args[0].isNumber() || !args[1].isNumber()) {
      throw std::invalid_argument("estimateOneRm requires weight + reps");
    }
    double weight = args[0].asNumber();
    int32_t reps = static_cast<int32_t>(args[1].asNumber());
    double result = strata_estimate_one_rm(weight, reps);
    return Value(result);
  });

  makeFunction("detectPr", [](Runtime& runtime, const Value* args, size_t count) -> Value {
    if (count < 4) {
      throw std::invalid_argument("detectPr requires exercise + events + weight + reps");
    }
    auto exercise = args[0].asString(runtime).utf8(runtime);
    auto events_json = args[1].asString(runtime).utf8(runtime);
    double weight = args[2].asNumber();
    int32_t reps = static_cast<int32_t>(args[3].asNumber());
    auto ffi = strata_detect_pr(exercise.c_str(), events_json.c_str(), weight, reps);
    return makeStringResult(runtime, callStrata(ffi));
  });

  makeFunction("scoreSet", [](Runtime& runtime, const Value* args, size_t count) -> Value {
    if (count < 5) {
      throw std::invalid_argument("scoreSet requires weight, reps, duration, distance, mode");
    }
    double weight = args[0].asNumber();
    int32_t reps = static_cast<int32_t>(args[1].asNumber());
    double duration = args[2].asNumber();
    double distance = args[3].asNumber();
    auto mode = args[4].asString(runtime).utf8(runtime);
    double result = strata_score_set(weight, reps, duration, distance, mode.c_str());
    return Value(result);
  });

  makeFunction("buildPrPayload", [](Runtime& runtime, const Value* args, size_t count) -> Value {
    if (count < 5) {
      throw std::invalid_argument(
          "buildPrPayload requires payload, eventTs, events, existingEvent, mode");
    }
    auto payload_json = args[0].asString(runtime).utf8(runtime);
    int64_t event_ts = static_cast<int64_t>(args[1].asNumber());
    auto events_json = args[2].asString(runtime).utf8(runtime);
    auto existing_event_json = args[3].isNull() || args[3].isUndefined()
                                   ? std::string("null")
                                   : args[3].asString(runtime).utf8(runtime);
    auto mode = args[4].asString(runtime).utf8(runtime);
    auto ffi = strata_build_pr_payload(payload_json.c_str(), event_ts, events_json.c_str(),
                                       existing_event_json.c_str(), mode.c_str());
    return makeStringResult(runtime, callStrata(ffi));
  });

  makeFunction("computeAnalytics", [](Runtime& runtime, const Value* args, size_t count) -> Value {
    if (count < 3) {
      throw std::invalid_argument("computeAnalytics requires events + offset + catalog");
    }
    auto events_json = args[0].asString(runtime).utf8(runtime);
    int32_t offset = static_cast<int32_t>(args[1].asNumber());
    auto catalog_json = args[2].asString(runtime).utf8(runtime);
    auto ffi = strata_compute_analytics(events_json.c_str(), offset, catalog_json.c_str());
    return makeStringResult(runtime, callStrata(ffi));
  });

  makeFunction("computeWorkoutAnalytics",
               [](Runtime& runtime, const Value* args, size_t count) -> Value {
                 if (count < 4) {
                   throw std::invalid_argument(
                       "computeWorkoutAnalytics requires events + offset + catalog + query");
                 }
                 auto events_json = args[0].asString(runtime).utf8(runtime);
                 int32_t offset = static_cast<int32_t>(args[1].asNumber());
                 auto catalog_json = args[2].asString(runtime).utf8(runtime);
                 auto query_json = args[3].asString(runtime).utf8(runtime);
                 auto ffi = strata_compute_workout_analytics(
                     events_json.c_str(), offset, catalog_json.c_str(), query_json.c_str());
                 return makeStringResult(runtime, callStrata(ffi));
               });

  makeFunction("computeBreakdownAnalytics",
               [](Runtime& runtime, const Value* args, size_t count) -> Value {
                 if (count < 4) {
                   throw std::invalid_argument(
                       "computeBreakdownAnalytics requires events + offset + catalog + query");
                 }
                 auto events_json = args[0].asString(runtime).utf8(runtime);
                 int32_t offset = static_cast<int32_t>(args[1].asNumber());
                 auto catalog_json = args[2].asString(runtime).utf8(runtime);
                 auto query_json = args[3].asString(runtime).utf8(runtime);
                 auto ffi = strata_compute_breakdown_analytics(
                     events_json.c_str(), offset, catalog_json.c_str(), query_json.c_str());
                 return makeStringResult(runtime, callStrata(ffi));
               });

  makeFunction("computeExerciseAnalytics",
               [](Runtime& runtime, const Value* args, size_t count) -> Value {
                 if (count < 4) {
                   throw std::invalid_argument(
                       "computeExerciseAnalytics requires events + offset + catalog + query");
                 }
                 auto events_json = args[0].asString(runtime).utf8(runtime);
                 int32_t offset = static_cast<int32_t>(args[1].asNumber());
                 auto catalog_json = args[2].asString(runtime).utf8(runtime);
                 auto query_json = args[3].asString(runtime).utf8(runtime);
                 auto ffi = strata_compute_exercise_analytics(
                     events_json.c_str(), offset, catalog_json.c_str(), query_json.c_str());
                 return makeStringResult(runtime, callStrata(ffi));
               });

  makeFunction("computeHomeDayAnalytics",
               [](Runtime& runtime, const Value* args, size_t count) -> Value {
                 if (count < 4) {
                   throw std::invalid_argument(
                       "computeHomeDayAnalytics requires events + offset + catalog + query");
                 }
                 auto events_json = args[0].asString(runtime).utf8(runtime);
                 int32_t offset = static_cast<int32_t>(args[1].asNumber());
                 auto catalog_json = args[2].asString(runtime).utf8(runtime);
                 auto query_json = args[3].asString(runtime).utf8(runtime);
                 auto ffi = strata_compute_home_day_analytics(
                     events_json.c_str(), offset, catalog_json.c_str(), query_json.c_str());
                 return makeStringResult(runtime, callStrata(ffi));
               });

  makeFunction("computeHomeDaysAnalytics",
               [](Runtime& runtime, const Value* args, size_t count) -> Value {
                 if (count < 4) {
                   throw std::invalid_argument(
                       "computeHomeDaysAnalytics requires events + offset + catalog + query");
                 }
                 auto events_json = args[0].asString(runtime).utf8(runtime);
                 int32_t offset = static_cast<int32_t>(args[1].asNumber());
                 auto catalog_json = args[2].asString(runtime).utf8(runtime);
                 auto query_json = args[3].asString(runtime).utf8(runtime);
                 auto ffi = strata_compute_home_days_analytics(
                     events_json.c_str(), offset, catalog_json.c_str(), query_json.c_str());
                 return makeStringResult(runtime, callStrata(ffi));
               });

  makeFunction("computeCalendarMonthAnalytics",
               [](Runtime& runtime, const Value* args, size_t count) -> Value {
                 if (count < 4) {
                   throw std::invalid_argument(
                       "computeCalendarMonthAnalytics requires events + offset + catalog + query");
                 }
                 auto events_json = args[0].asString(runtime).utf8(runtime);
                 int32_t offset = static_cast<int32_t>(args[1].asNumber());
                 auto catalog_json = args[2].asString(runtime).utf8(runtime);
                 auto query_json = args[3].asString(runtime).utf8(runtime);
                 auto ffi = strata_compute_calendar_month_analytics(
                     events_json.c_str(), offset, catalog_json.c_str(), query_json.c_str());
                 return makeStringResult(runtime, callStrata(ffi));
               });

  makeFunction("exportGenericSqlite",
               [](Runtime& runtime, const Value* args, size_t count) -> Value {
                 if (count < 1) {
                   throw std::invalid_argument("exportGenericSqlite requires payload JSON");
                 }
                 auto payload_json = args[0].asString(runtime).utf8(runtime);
                 std::string output_path =
                     count >= 2 && args[1].isString() ? args[1].asString(runtime).utf8(runtime) : "";
                 auto ffi = strata_export_generic_sqlite(payload_json.c_str(), output_path.c_str());
                 return makeStringResult(runtime, callStrata(ffi));
               });

  makeFunction("importGenericSqlite",
               [](Runtime& runtime, const Value* args, size_t count) -> Value {
                 if (count < 1 || !args[0].isString()) {
                   throw std::invalid_argument("importGenericSqlite requires input path");
                 }
                 auto input_path = args[0].asString(runtime).utf8(runtime);
                 auto ffi = strata_import_generic_sqlite(input_path.c_str());
                 return makeStringResult(runtime, callStrata(ffi));
               });

  rt.global().setProperty(rt, "TrackerEngine", std::move(module));
}

}  // namespace strata
