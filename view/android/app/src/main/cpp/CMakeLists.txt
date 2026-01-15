cmake_minimum_required(VERSION 3.13)
project(trackerengine)

set(CMAKE_VERBOSE_MAKEFILE ON)

add_library(
  trackerengine
  SHARED
  TrackerEngineBinding.cpp
  TrackerEngineTurboModule.cpp
)

target_include_directories(
  trackerengine
  PRIVATE
  .
)

find_package(ReactAndroid REQUIRED CONFIG)
find_package(fbjni REQUIRED CONFIG)

target_link_libraries(
  trackerengine
  ReactAndroid::reactnative
  ReactAndroid::jsi
  fbjni::fbjni
  log
)

add_library(tracker_ffi SHARED IMPORTED)
set_target_properties(
  tracker_ffi
  PROPERTIES
  IMPORTED_LOCATION
  ${CMAKE_CURRENT_SOURCE_DIR}/../jniLibs/${CMAKE_ANDROID_ARCH_ABI}/libtracker_ffi.so
  IMPORTED_SONAME
  libtracker_ffi.so
)

target_link_libraries(trackerengine tracker_ffi)

target_compile_options(
  trackerengine
  PRIVATE
  -fexceptions
  -frtti
  -std=c++20
)

target_compile_definitions(
  trackerengine
  PRIVATE
)
