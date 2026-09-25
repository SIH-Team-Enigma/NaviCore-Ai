#include <jni.h>
#include <memory>
#include <string>
#include <vector>
#include "navicore/pipeline.hpp"

extern "C" {

/**
 * @brief Constructs a new navicore::pipeline::NavicorePipeline instance.
 * @return 64-bit integer handle (pointer) to the native instance.
 */
JNIEXPORT jlong JNICALL
Java_org_enigma_navicore_fusion_FusionCore_nativeInit(
    JNIEnv* env,
    jobject /*thiz*/,
    jstring jconfig
) {
    std::string config_str = "";
    if (jconfig != nullptr) {
        const char* c_str = env->GetStringUTFChars(jconfig, nullptr);
        if (c_str != nullptr) {
            config_str = c_str;
            env->ReleaseStringUTFChars(jconfig, c_str);
        }
    }

    auto* pipeline = new navicore::pipeline::NavicorePipeline(config_str);
    return reinterpret_cast<jlong>(pipeline);
}

/**
 * @brief Feeds a 6-DOF IMU reading into the native pipeline at 100 Hz.
 */
JNIEXPORT void JNICALL
Java_org_enigma_navicore_fusion_FusionCore_nativeFeedImu(
    JNIEnv* /*env*/,
    jobject /*thiz*/,
    jlong handle,
    jfloat ax, jfloat ay, jfloat az,
    jfloat gx, jfloat gy, jfloat gz,
    jlong timestampNs
) {
    auto* pipeline = reinterpret_cast<navicore::pipeline::NavicorePipeline*>(handle);
    if (!pipeline) return;

    pipeline->FeedImu(ax, ay, az, gx, gy, gz, timestampNs);
}

/**
 * @brief Feeds a GNSS fix into the native pipeline.
 */
JNIEXPORT void JNICALL
Java_org_enigma_navicore_fusion_FusionCore_nativeFeedGnss(
    JNIEnv* /*env*/,
    jobject /*thiz*/,
    jlong handle,
    jdouble lat, jdouble lon, jdouble alt,
    jfloat hAcc, jfloat vAcc,
    jlong timestampNs
) {
    auto* pipeline = reinterpret_cast<navicore::pipeline::NavicorePipeline*>(handle);
    if (!pipeline) return;

    pipeline->FeedGnss(lat, lon, alt, hAcc, vAcc, timestampNs);
}

/**
 * @brief Feeds an AI Virtual Odometer prediction into the native pipeline.
 */
JNIEXPORT void JNICALL
Java_org_enigma_navicore_fusion_FusionCore_nativeFeedAiOdometer(
    JNIEnv* /*env*/,
    jobject /*thiz*/,
    jlong handle,
    jfloat vx,
    jfloat variance,
    jfloat stoppedProb,
    jlong timestampNs
) {
    auto* pipeline = reinterpret_cast<navicore::pipeline::NavicorePipeline*>(handle);
    if (!pipeline) return;

    pipeline->FeedAiOdometer(vx, variance, stoppedProb, timestampNs);
}

/**
 * @brief Marshals the latest fused state directly into the Kotlin FusionState object.
 * Zero object allocation to prevent GC churn at 100 Hz.
 */
JNIEXPORT void JNICALL
Java_org_enigma_navicore_fusion_FusionCore_nativeGetState(
    JNIEnv* env,
    jobject /*thiz*/,
    jlong handle,
    jobject stateOut
) {
    if (!stateOut) return;

    auto* pipeline = reinterpret_cast<navicore::pipeline::NavicorePipeline*>(handle);
    navicore::FusionState state;
    if (pipeline) {
        state = pipeline->GetState();
    }

    jclass cls = env->GetObjectClass(stateOut);
    if (!cls) return;

    jmethodID updateMethod = env->GetMethodID(
        cls,
        "update",
        "(DDDFFFIJZJFZZ[F)V"
    );

    if (updateMethod) {
        // Retrieve and populate covariance array directly without heap allocation
        jfieldID covField = env->GetFieldID(cls, "covarianceDiagonal", "[F");
        jfloatArray covArray = nullptr;
        if (covField) {
            covArray = static_cast<jfloatArray>(env->GetObjectField(stateOut, covField));
            if (covArray && state.covariance_diagonal.size() >= 15) {
                env->SetFloatArrayRegion(covArray, 0, 15, state.covariance_diagonal.data());
            }
        }

        env->CallVoidMethod(
            stateOut,
            updateMethod,
            static_cast<jdouble>(state.latitude_deg),
            static_cast<jdouble>(state.longitude_deg),
            static_cast<jdouble>(state.altitude_m),
            static_cast<jfloat>(state.speed_mps),
            static_cast<jfloat>(state.heading_rad),
            static_cast<jfloat>(state.heading_uncertainty_rad),
            static_cast<jint>(static_cast<int>(state.mode)),
            static_cast<jlong>(state.blackout_duration_ms),
            static_cast<jboolean>(state.within_validated_range),
            static_cast<jlong>(state.snapped_road_id),
            static_cast<jfloat>(state.snapped_confidence),
            static_cast<jboolean>(state.is_reroute_needed),
            static_cast<jboolean>(state.is_dislodged),
            covArray
        );
    }
}

/**
 * @brief Loads offline road network segments into the native HMM map matcher.
 */
JNIEXPORT void JNICALL
Java_org_enigma_navicore_fusion_FusionCore_nativeLoadRoadNetwork(
    JNIEnv* env,
    jobject /*thiz*/,
    jlong handle,
    jobjectArray segmentIds,
    jdoubleArray startLats,
    jdoubleArray startLons,
    jdoubleArray endLats,
    jdoubleArray endLons,
    jfloatArray headingRads,
    jfloatArray lengthsM
) {
    auto* pipeline = reinterpret_cast<navicore::pipeline::NavicorePipeline*>(handle);
    if (!pipeline || !segmentIds || !startLats || !startLons || !endLats || !endLons || !headingRads || !lengthsM) return;

    jsize count = env->GetArrayLength(segmentIds);
    if (count == 0) return;

    jdouble* s_lats = env->GetDoubleArrayElements(startLats, nullptr);
    jdouble* s_lons = env->GetDoubleArrayElements(startLons, nullptr);
    jdouble* e_lats = env->GetDoubleArrayElements(endLats, nullptr);
    jdouble* e_lons = env->GetDoubleArrayElements(endLons, nullptr);
    jfloat* hdgs = env->GetFloatArrayElements(headingRads, nullptr);
    jfloat* lens = env->GetFloatArrayElements(lengthsM, nullptr);

    std::vector<navicore::RoadSegment> segments;
    segments.reserve(count);

    for (jsize i = 0; i < count; ++i) {
        auto jstr = static_cast<jstring>(env->GetObjectArrayElement(segmentIds, i));
        std::string seg_id = "";
        if (jstr) {
            const char* c_str = env->GetStringUTFChars(jstr, nullptr);
            if (c_str) {
                seg_id = c_str;
                env->ReleaseStringUTFChars(jstr, c_str);
            }
            env->DeleteLocalRef(jstr);
        }

        navicore::RoadSegment seg;
        seg.id = seg_id;
        seg.start_lat = s_lats[i];
        seg.start_lon = s_lons[i];
        seg.end_lat = e_lats[i];
        seg.end_lon = e_lons[i];
        seg.heading_rad = hdgs[i];
        seg.length_m = lens[i];
        segments.push_back(seg);
    }

    env->ReleaseDoubleArrayElements(startLats, s_lats, JNI_ABORT);
    env->ReleaseDoubleArrayElements(startLons, s_lons, JNI_ABORT);
    env->ReleaseDoubleArrayElements(endLats, e_lats, JNI_ABORT);
    env->ReleaseDoubleArrayElements(endLons, e_lons, JNI_ABORT);
    env->ReleaseFloatArrayElements(headingRads, hdgs, JNI_ABORT);
    env->ReleaseFloatArrayElements(lengthsM, lens, JNI_ABORT);

    pipeline->LoadRoadNetwork(segments);
}

/**
 * @brief Destroys the native pipeline instance and frees all associated memory.
 */
JNIEXPORT void JNICALL
Java_org_enigma_navicore_fusion_FusionCore_nativeDestroy(
    JNIEnv* /*env*/,
    jobject /*thiz*/,
    jlong handle
) {
    auto* pipeline = reinterpret_cast<navicore::pipeline::NavicorePipeline*>(handle);
    if (pipeline) {
        delete pipeline;
    }
}

} // extern "C"

