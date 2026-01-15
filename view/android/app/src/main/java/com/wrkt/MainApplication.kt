package com.wrkt

import android.app.Application
import android.util.Log
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeHost
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost
import com.facebook.react.defaults.DefaultReactNativeHost
import com.facebook.react.soloader.OpenSourceMergedSoMapping
import com.facebook.soloader.SoLoader

class MainApplication : Application(), ReactApplication {

  private val appReactNativeHost: ReactNativeHost =
    object : DefaultReactNativeHost(this) {
      override fun getPackages() =
        PackageList(this).packages.apply {
          Log.d("MainApplication", "getPackages(): base count=${size}")
          forEach { pkg ->
            Log.d("MainApplication", "getPackages(): base pkg=${pkg.javaClass.name}")
          }
          // Packages that cannot be autolinked yet can be added manually here, for example:
          // add(MyReactNativePackage())
          add(PlatformConstantsPackage())
          add(TrackerEnginePackage())
          Log.d("MainApplication", "getPackages(): final count=${size}")
          forEach { pkg ->
            Log.d("MainApplication", "getPackages(): final pkg=${pkg.javaClass.name}")
          }
        }

      override fun getJSMainModuleName(): String = "index"

      override fun getUseDeveloperSupport(): Boolean = BuildConfig.DEBUG

      override val isNewArchEnabled: Boolean = BuildConfig.IS_NEW_ARCHITECTURE_ENABLED

      override val isHermesEnabled: Boolean = BuildConfig.IS_HERMES_ENABLED
    }

  override val reactNativeHost: ReactNativeHost
    get() = appReactNativeHost

  override val reactHost: ReactHost by lazy {
    getDefaultReactHost(applicationContext, reactNativeHost)
  }

  override fun onCreate() {
    super.onCreate()
    Log.d("MainApplication", "onCreate: newArch=${BuildConfig.IS_NEW_ARCHITECTURE_ENABLED}")
    if (BuildConfig.IS_NEW_ARCHITECTURE_ENABLED) {
      SoLoader.init(this, OpenSourceMergedSoMapping)
      Log.d("MainApplication", "SoLoader initialized with OpenSourceMergedSoMapping")
      DefaultNewArchitectureEntryPoint.load()
      Log.d("MainApplication", "DefaultNewArchitectureEntryPoint.load() done")
    } else {
      SoLoader.init(this, false)
      Log.d("MainApplication", "SoLoader initialized (legacy)")
    }
  }
}
