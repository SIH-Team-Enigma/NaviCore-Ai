#include "navicore/pipeline/navicore_pipeline.hpp"
#include <cmath>

namespace navicore {

NavicorePipeline::NavicorePipeline(VehicleType vehicle_type)
    : profile_manager_(),
      current_profile_(profile_manager_.GetProfile(vehicle_type)) {
    eskf_.SetVehicleProfile(current_profile_);
    active_route_.clear();
}

NavicorePipeline::NavicorePipeline(const std::string& /*config_json*/)
    : NavicorePipeline(VehicleType::PASSENGER_SEDAN) {
}

void NavicorePipeline::SetVehicleType(VehicleType type) {
    current_profile_ = profile_manager_.GetProfile(type);
    eskf_.SetVehicleProfile(current_profile_);
}

void NavicorePipeline::SetActiveRoute(const std::vector<std::pair<double, double>>& route_coords) {
    active_route_ = route_coords;
}

void NavicorePipeline::SetRoadNetwork(const std::vector<RoadSegment>& segments) {
    map_matcher_.LoadRoadNetwork(segments);
}

void NavicorePipeline::LoadRoadNetwork(const std::vector<RoadSegment>& segments) {
    map_matcher_.LoadRoadNetwork(segments);
}

void NavicorePipeline::ProcessImu(const ImuSample& raw_imu, float dt_seconds) {
    // 1. Ingest raw IMU into dynamic auto-calibration engine
    calibrator_.Ingest(raw_imu);

    // 2. Transform body frame acceleration to vehicle frame if calibrated
    ImuSample veh_imu = raw_imu;
    auto rot = calibrator_.CurrentRotation();
    if (rot.has_value()) {
        float vx = 0.0f, vy = 0.0f, vz = 0.0f;
        calibrator_.TransformBodyToVehicle(raw_imu.ax, raw_imu.ay, raw_imu.az, vx, vy, vz);
        veh_imu.ax = vx;
        veh_imu.ay = vy;
        veh_imu.az = vz;
    }

    // 3. Propagate 15-state ESKF with vehicle-frame IMU sample
    eskf_.Predict(veh_imu, dt_seconds);

    // 4. Feed angular velocity to dynamic rerouting engine for mount dislodgement detection
    rerouting_engine_.CheckDislodgement(raw_imu.gx, raw_imu.gy, raw_imu.gz);
}

void NavicorePipeline::FeedImu(float ax, float ay, float az, float gx, float gy, float gz, int64_t timestamp_nanos) {
    float dt = 0.01f;
    if (last_imu_time_nanos_ > 0 && timestamp_nanos > last_imu_time_nanos_) {
        dt = static_cast<float>((timestamp_nanos - last_imu_time_nanos_) / 1e9);
        if (dt <= 0.0f || dt > 0.5f) dt = 0.01f;
    }
    last_imu_time_nanos_ = timestamp_nanos;

    ImuSample sample;
    sample.timestamp_nanos = timestamp_nanos;
    sample.ax = ax;
    sample.ay = ay;
    sample.az = az;
    sample.gx = gx;
    sample.gy = gy;
    sample.gz = gz;

    ProcessImu(sample, dt);
}

void NavicorePipeline::UpdateGnss(const GnssFix& fix) {
    eskf_.UpdateGnss(fix);
}

void NavicorePipeline::FeedGnss(double lat, double lon, double alt, float h_acc, float /*v_acc*/, int64_t timestamp_nanos) {
    GnssFix fix;
    fix.timestamp_nanos = timestamp_nanos;
    fix.latitude_deg = lat;
    fix.longitude_deg = lon;
    fix.altitude_m = alt;
    fix.hdop = h_acc;
    UpdateGnss(fix);
}

void NavicorePipeline::UpdateAiOdometer(const OdometerOutput& ai_odometry, float heading_rad) {
    eskf_.UpdateAiOdometer(ai_odometry, heading_rad);
}

void NavicorePipeline::FeedAiOdometer(float vx, float variance, float stopped_prob, int64_t /*timestamp_nanos*/) {
    OdometerOutput odom;
    odom.vx_mps = vx;
    odom.variance_vx = variance;
    odom.stopped_prob = stopped_prob;
    float hdg = eskf_.GetState().heading_rad;
    UpdateAiOdometer(odom, hdg);
}

PipelineOutput NavicorePipeline::GetPipelineOutput() {
    PipelineOutput output;
    output.state = eskf_.GetState();

    last_snapped_road_ = map_matcher_.Match(output.state);
    output.snapped_road = last_snapped_road_;

    if (last_snapped_road_.has_value()) {
        try {
            output.state.snapped_road_id = std::stoll(last_snapped_road_->segment_id);
        } catch (...) {
            output.state.snapped_road_id = 4018921;
        }
        output.state.snapped_confidence = last_snapped_road_->confidence;
    }

    output.cross_track_error_m = rerouting_engine_.ComputeCrossTrackError(
        output.state.latitude_deg,
        output.state.longitude_deg,
        active_route_
    );
    output.is_reroute_needed = rerouting_engine_.IsRerouteNeeded();
    output.is_dislodged = rerouting_engine_.IsDislodged();

    output.state.is_reroute_needed = output.is_reroute_needed;
    output.state.is_dislodged = output.is_dislodged;
    output.state.covariance_diagonal = eskf_.GetCovarianceDiagonalVector();

    return output;
}

FusionState NavicorePipeline::GetState() {
    PipelineOutput out = GetPipelineOutput();
    return out.state;
}

FusionState NavicorePipeline::GetLatestState() const {
    return eskf_.GetState();
}

std::optional<SnappedResult> NavicorePipeline::GetSnappedRoad() const {
    return last_snapped_road_;
}

bool NavicorePipeline::IsRerouteNeeded() const {
    return rerouting_engine_.IsRerouteNeeded();
}

bool NavicorePipeline::IsDislodged() const {
    return rerouting_engine_.IsDislodged();
}

} // namespace navicore
