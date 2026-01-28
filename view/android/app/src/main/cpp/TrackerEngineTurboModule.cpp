#include <ReactCommon/BindingsInstallerHolder.h>
#include <android/log.h>
#include <fbjni/fbjni.h>
#include <jsi/jsi.h>

#include "TrackerEngineBinding.h"

using facebook::jni::alias_ref;
using facebook::jni::HybridClass;
using facebook::jni::local_ref;

namespace strata {

class TrackerEngineTurboModule : public HybridClass<TrackerEngineTurboModule> {
 public:
  static constexpr const char* kJavaDescriptor = "Lcom/wrkt/TrackerEngineModule;";

  TrackerEngineTurboModule() = default;

  static void registerNatives() {
    javaClassLocal()->registerNatives({
        makeNativeMethod("getBindingsInstaller", TrackerEngineTurboModule::getBindingsInstaller),
    });
  }

 private:
  static local_ref<facebook::react::BindingsInstallerHolder::javaobject> getBindingsInstaller(
      alias_ref<TrackerEngineTurboModule::javaobject> /*jobj*/) {
    __android_log_print(ANDROID_LOG_INFO, "TrackerEngine", "getBindingsInstaller called");
    return facebook::react::BindingsInstallerHolder::newObjectCxxArgs(
        [](facebook::jsi::Runtime& runtime, const std::shared_ptr<facebook::react::CallInvoker>&) {
          strata::installTrackerEngineBinding(runtime);
        });
  }
};

}  // namespace strata

JNIEXPORT jint JNICALL JNI_OnLoad(JavaVM* vm, void*) {
  return facebook::jni::initialize(vm, [] { strata::TrackerEngineTurboModule::registerNatives(); });
}
