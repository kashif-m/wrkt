#pragma once

#include <jsi/jsi.h>

namespace strata {

/// Installs the TrackerEngine module on the provided JSI runtime.
void installTrackerEngineBinding(facebook::jsi::Runtime &runtime);

}  // namespace strata
