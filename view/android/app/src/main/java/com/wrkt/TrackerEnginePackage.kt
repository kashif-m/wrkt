package com.wrkt

import android.util.Log
import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.annotations.ReactModule
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider
import com.facebook.react.uimanager.ViewManager

class TrackerEnginePackage : BaseReactPackage() {
  override fun getModule(
    name: String,
    reactContext: ReactApplicationContext,
  ): NativeModule? =
    if (name == TrackerEngineModule.NAME) {
      Log.d("TrackerEnginePackage", "getModule(): $name -> TrackerEngineModule")
      TrackerEngineModule(reactContext)
    } else {
      Log.d("TrackerEnginePackage", "getModule(): $name -> null")
      null
    }

  override fun getReactModuleInfoProvider(): ReactModuleInfoProvider {
    val moduleClass = TrackerEngineModule::class.java
    val reactModule = moduleClass.getAnnotation(ReactModule::class.java)
    val moduleInfo =
      if (reactModule != null) {
        ReactModuleInfo(
          reactModule.name,
          moduleClass.name,
          reactModule.canOverrideExistingModule,
          reactModule.needsEagerInit,
          reactModule.isCxxModule,
          ReactModuleInfo.classIsTurboModule(moduleClass),
        )
      } else {
        ReactModuleInfo(
          TrackerEngineModule.NAME,
          moduleClass.name,
          false,
          true,
          false,
          ReactModuleInfo.classIsTurboModule(moduleClass),
        )
      }
    return ReactModuleInfoProvider {
      Log.d(
        "TrackerEnginePackage",
        "moduleInfo: name=${moduleInfo.name} isTurbo=${moduleInfo.isTurboModule}",
      )
      mapOf(TrackerEngineModule.NAME to moduleInfo)
    }
  }

  override fun createViewManagers(
    reactContext: ReactApplicationContext,
  ): List<ViewManager<*, *>> {
    return emptyList()
  }
}
