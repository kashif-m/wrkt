package com.wrkt

import android.util.Log
import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.annotations.ReactModule
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider
import com.facebook.react.modules.systeminfo.AndroidInfoModule

class PlatformConstantsPackage : BaseReactPackage() {
    override fun getModule(
        name: String,
        reactContext: ReactApplicationContext,
    ): NativeModule? =
        if (name == AndroidInfoModule.NAME) {
            Log.d("PlatformConstantsPackage", "getModule(): $name -> AndroidInfoModule")
            AndroidInfoModule(reactContext)
        } else {
            Log.d("PlatformConstantsPackage", "getModule(): $name -> null")
            null
        }

    override fun getReactModuleInfoProvider(): ReactModuleInfoProvider {
        Log.d(
            "PlatformConstantsPackage",
            "getReactModuleInfoProvider(): name=${AndroidInfoModule.NAME}",
        )
        val moduleClass = AndroidInfoModule::class.java
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
                    AndroidInfoModule.NAME,
                    moduleClass.name,
                    false,
                    true,
                    false,
                    ReactModuleInfo.classIsTurboModule(moduleClass),
                )
            }
        return ReactModuleInfoProvider {
            Log.d(
                "PlatformConstantsPackage",
                "moduleInfo: name=${moduleInfo.name} isTurbo=${moduleInfo.isTurboModule}",
            )
            mapOf(AndroidInfoModule.NAME to moduleInfo)
        }
    }
}
