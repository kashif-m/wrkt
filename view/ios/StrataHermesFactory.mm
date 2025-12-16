#import <ReactCommon/RCTHermesInstance.h>
#import "TrackerEngineBinding.h"

using JSRuntimeFactoryRef = void *;

namespace {

class StrataHermesInstance final : public facebook::react::RCTHermesInstance {
 public:
  using facebook::react::RCTHermesInstance::RCTHermesInstance;

  std::unique_ptr<facebook::react::JSRuntime> createJSRuntime(
      std::shared_ptr<facebook::react::MessageQueueThread> msgQueueThread) noexcept override
  {
    auto runtime = facebook::react::RCTHermesInstance::createJSRuntime(std::move(msgQueueThread));
    if (runtime != nullptr) {
      auto &jsRuntime = runtime->getRuntime();
      strata::installTrackerEngineBinding(jsRuntime);
    }
    return runtime;
  }
};

}  // namespace

extern "C" JSRuntimeFactoryRef StrataCreateHermesFactory(void)
{
  auto *factory = new StrataHermesInstance();
  return reinterpret_cast<JSRuntimeFactoryRef>(factory);
}
