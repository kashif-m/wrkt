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
FfiResult strata_compute(const char* dsl,
                         const char* events_json,
                         const char* query_json);
FfiResult strata_simulate(const char* dsl,
                          const char* base_events_json,
                          const char* hypotheticals_json,
                          const char* query_json);
FfiResult strata_generate_suggestions(const char* dsl,
                                      const char* events_json,
                                      const char* planner_kind);
FfiResult strata_exercise_catalog(void);
FfiResult strata_validate_exercise(const char* entry_json);
FfiResult strata_import_fitnotes(const char* path);
void strata_free_string(char* ptr);
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
    module.setProperty(
        rt, name.c_str(),
        Function::createFromHostFunction(
            rt, facebook::jsi::PropNameID::forUtf8(rt, name), 1,
            [lambda](Runtime& runtime, const facebook::jsi::Value&,
                     const facebook::jsi::Value* args, size_t count) -> Value {
              return lambda(runtime, args, count);
            }));
  };

  makeFunction("compileTracker", [](Runtime& runtime, const Value* args,
                                    size_t count) -> Value {
    if (count < 1 || !args[0].isString()) {
      throw std::invalid_argument("compileTracker requires DSL string");
    }
    auto dsl = args[0].asString(runtime).utf8(runtime);
    auto ffi = strata_compile_tracker(dsl.c_str());
    return makeStringResult(runtime, callStrata(ffi));
  });

  makeFunction("validateEvent", [](Runtime& runtime, const Value* args,
                                   size_t count) -> Value {
    if (count < 2 || !args[0].isString() || !args[1].isString()) {
      throw std::invalid_argument("validateEvent requires dsl + event JSON");
    }
    auto dsl = args[0].asString(runtime).utf8(runtime);
    auto event_json = args[1].asString(runtime).utf8(runtime);
    auto ffi = strata_validate_event(dsl.c_str(), event_json.c_str());
    return makeStringResult(runtime, callStrata(ffi));
  });

  makeFunction("compute", [](Runtime& runtime, const Value* args,
                             size_t count) -> Value {
    if (count < 2) {
      throw std::invalid_argument("compute requires dsl + events JSON");
    }
    auto dsl = args[0].asString(runtime).utf8(runtime);
    auto events_json = args[1].asString(runtime).utf8(runtime);
    std::string query_json =
        count >= 3 && args[2].isString()
            ? args[2].asString(runtime).utf8(runtime)
            : "{}";
    auto ffi = strata_compute(dsl.c_str(), events_json.c_str(),
                              query_json.c_str());
    return makeStringResult(runtime, callStrata(ffi));
  });

  makeFunction("simulate", [](Runtime& runtime, const Value* args,
                              size_t count) -> Value {
    if (count < 3) {
      throw std::invalid_argument(
          "simulate requires dsl + base events + hypotheticals JSON");
    }
    auto dsl = args[0].asString(runtime).utf8(runtime);
    auto base_json = args[1].asString(runtime).utf8(runtime);
    auto hypo_json = args[2].asString(runtime).utf8(runtime);
    std::string query_json =
        count >= 4 && args[3].isString()
            ? args[3].asString(runtime).utf8(runtime)
            : "{}";
    auto ffi = strata_simulate(dsl.c_str(), base_json.c_str(),
                               hypo_json.c_str(), query_json.c_str());
    return makeStringResult(runtime, callStrata(ffi));
  });

  makeFunction("suggest", [](Runtime& runtime, const Value* args,
                             size_t count) -> Value {
    if (count < 3) {
      throw std::invalid_argument(
          "suggest requires dsl + events JSON + planner kind");
    }
    auto dsl = args[0].asString(runtime).utf8(runtime);
    auto events_json = args[1].asString(runtime).utf8(runtime);
    auto planner = args[2].asString(runtime).utf8(runtime);
    auto ffi = strata_generate_suggestions(dsl.c_str(), events_json.c_str(),
                                           planner.c_str());
    return makeStringResult(runtime, callStrata(ffi));
  });

  makeFunction("getExerciseCatalog", [](Runtime& runtime, const Value* args,
                                        size_t count) -> Value {
    auto ffi = strata_exercise_catalog();
    return makeStringResult(runtime, callStrata(ffi));
  });

  makeFunction("validateExercise", [](Runtime& runtime, const Value* args,
                                      size_t count) -> Value {
    if (count < 1 || !args[0].isString()) {
      throw std::invalid_argument("validateExercise requires entry JSON");
    }
    auto entry = args[0].asString(runtime).utf8(runtime);
    auto ffi = strata_validate_exercise(entry.c_str());
    return makeStringResult(runtime, callStrata(ffi));
  });

  makeFunction("importFitnotes", [](Runtime& runtime, const Value* args,
                                   size_t count) -> Value {
    if (count < 1 || !args[0].isString()) {
      throw std::invalid_argument("importFitnotes requires file path");
    }
    auto path = args[0].asString(runtime).utf8(runtime);
    auto ffi = strata_import_fitnotes(path.c_str());
    return makeStringResult(runtime, callStrata(ffi));
  });

  rt.global().setProperty(rt, "TrackerEngine", std::move(module));
}

}  // namespace strata
