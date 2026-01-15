cmake_minimum_required(VERSION 3.13)

project(appmodules)

# Use the default React Native new-arch setup and then add custom native libs.
include(${REACT_ANDROID_DIR}/cmake-utils/ReactNative-application.cmake)

add_subdirectory(${CMAKE_CURRENT_SOURCE_DIR}/../cpp trackerengine_build)
