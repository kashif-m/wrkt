package com.wrkt

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.module.annotations.ReactModule
import com.facebook.react.turbomodule.core.interfaces.BindingsInstallerHolder
import com.facebook.react.turbomodule.core.interfaces.TurboModule
import com.facebook.react.turbomodule.core.interfaces.TurboModuleWithJSIBindings
import com.facebook.soloader.SoLoader
import android.util.Log

@ReactModule(name = TrackerEngineModule.NAME, needsEagerInit = true)
class TrackerEngineModule(private val context: ReactApplicationContext) :
  ReactContextBaseJavaModule(context),
  TurboModule,
  TurboModuleWithJSIBindings {
  init {
    Log.d(NAME, "TrackerEngineModule init")
  }
  override fun getName(): String = NAME

  external override fun getBindingsInstaller(): BindingsInstallerHolder

  companion object {
    const val NAME = "TrackerEngineModule"

    init {
      SoLoader.loadLibrary("trackerengine")
    }
  }
}
