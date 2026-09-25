#include "navicore/pipeline.hpp"
#include <algorithm>
#include <functional>

namespace navicore::pipeline {

NavicorePipeline::NavicorePipeline(const std::string& /*config*/)
    : calibrator_(),
      eskf_(),
      map_matcher_(),
      rerouting_engine_(),
      profile_(VehicleProfileManager::GetProfile(VehicleType::PASSENGER_SEDAN)) {
}

void NavicorePipeline::FeedImu(
    float ax, float ay, float az,
    float gx, float gy, float gz,
    int64_t timestamp_ns
) {
    std::lock_guard<std::mutex> lock(mutex_);

    float dt = 0.01f; // Default 100 Hz (10 ms)
    if (last_imu_timestamp_ns_ > 0 && timestamp_ns > last_imu_timestamp_ns_) {
        dt = static_cast<float>(timestamp_ns - last_imu_timestamp_ns_) * 1e-9f;
        if (dt <= 0.0f || dt > 0.2f) {
            dt = 0.01f;
        }
    }
    last_imu_timestamp_ns_ = timestamp_ns;

    // 1. Raw IMU Sample in Phone Body Frame
    ImuSample sample;
    sample.timestamp_nanos = timestamp_ns;
    sample.ax = ax; sample.ay = ay; sample.az = az;
    sample.gx = gx; sample.gy = gy; sample.gz = gz;

    // 2. Ingest into dynamic auto-calibrator to resolve mounting orientation
    calibrator_.Ingest(sample);

    // 3. Transform accelerations to vehicle frame {v}
    float vx = ax, vy = ay, vz = az;
    calibrator_.TransformBodyToVehicle(ax, ay, az, vx, vy, vz);
    sample.ax = vx;
    sample.ay = vy;
    sample.az = vz;

    // 4. Physical mount dislodgement check
    bool gyro_dislodge = rerouting_engine_.CheckDislodgement(gx, gy, gz);
    is_dislodged_ = gyro_dislodge || calibrator_.IsRecalibrating();

    // 5. Propagate 15-state ESKF with calibrated IMU kinematics
    eskf_.Predict(sample, dt);
}

void NavicorePipeline::FeedGnss(
    double lat, double lon, double alt,
    float h_acc, float /*v_acc*/,
    int64_t timestamp_ns
) {
    std::lock_guard<std::mutex> lock(mutex_);
    last_gnss_timestamp_ns_ = timestamp_ns;

    GnssFix fix;
    fix.timestamp_nanos = timestamp_ns;
    fix.latitude_deg = lat;
    fix.longitude_deg = lon;
    fix.altitude_m = alt;
    fix.hdop = h_acc;

    eskf_.UpdateGnss(fix);
}

void NavicorePipeline::FeedAiOdometer(
    float vx, float variance, float stopped_prob,
    int64_t /*timestamp_ns*/
) {
    std::lock_guard<std::mutex> lock(mutex_);

    if (stopped_prob > 0.85f) {
        eskf_.ApplyZupt();
    } else {
        OdometerOutput ai_out;
        ai_out.vx_mps = vx;
        ai_out.variance_vx = variance;
        ai_out.stopped_prob = stopped_prob;
        eskf_.UpdateAiOdometer(ai_out, 0.0f);
    }
}

FusionState NavicorePipeline::GetState() const {
    std::lock_guard<std::mutex> lock(mutex_);

    FusionState state = eskf_.GetState();
    state.is_dislodged = is_dislodged_ || calibrator_.IsRecalibrating();
    state.is_reroute_needed = rerouting_engine_.IsRerouteNeeded();

    // Map matching snap
    auto snap = map_matcher_.Match(state);
    if (snap.has_value()) {
        try {
            state.snapped_road_id = std::stoll(snap->road_id);
        } catch (...) {
            state.snapped_road_id = static_cast<int64_t>(std::hash<std::string>{}(snap->road_id));
        }
        state.snapped_confidence = snap->confidence;
    } else {
        state.snapped_road_id = 0;
        state.snapped_confidence = 0.0f;
    }

    return state;
}

void NavicorePipeline::GetState(FusionState& state_out) const {
    state_out = GetState();
}

void NavicorePipeline::LoadRoadNetwork(const std::vector<RoadSegment>& segments) {
    std::lock_guard<std::mutex> lock(mutex_);
    map_matcher_.LoadRoadNetwork(segments);
}

void NavicorePipeline::SetVehicleProfile(VehicleType type) {
    std::lock_guard<std::mutex> lock(mutex_);
    profile_ = VehicleProfileManager::GetProfile(type);
}

void NavicorePipeline::Reset() {
    std::lock_guard<std::mutex> lock(mutex_);
    calibrator_ = MountCalibrator();
    eskf_.Reset();
    last_imu_timestamp_ns_ = 0;
    last_gnss_timestamp_ns_ = 0;
    snapped_road_id_ = 0;
    snapped_confidence_ = 0.0f;
    is_reroute_needed_ = false;
    is_dislodged_ = false;
}

} // namespace navicore::pipeline
