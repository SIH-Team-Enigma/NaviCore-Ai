cmake_minimum_required(VERSION 3.22.1)
project(navicore_jni)

set(CMAKE_CXX_STANDARD 20)

include_directories(
    ${CMAKE_CURRENT_SOURCE_DIR}/../../../../core_cpp/include
)

add_library(navicore_jni SHARED
    jni_bridge.cpp
    ../../../../core_cpp/src/eskf.cpp
    ../../../../core_cpp/src/auto_calib.cpp
)

find_library(log-lib log)
target_link_libraries(navicore_jni ${log-lib})
