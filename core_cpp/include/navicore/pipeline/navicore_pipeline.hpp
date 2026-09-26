#pragma once

#include "navicore/types.hpp"
#include "navicore/fusion/eskf.hpp"
#include "navicore/calibration/auto_calib.hpp"
#include "navicore/mapmatch/hmm_matcher.hpp"
#include "navicore/routing/rerouting_engine.hpp"
#include "navicore/vehicle/vehicle_profile_manager.hpp"
#include "navicore/sensors/barometer_tracker.hpp"

#include <vector>
#include <string>
#include <optional>
#include <utility>

namespace navicore {
namespace pipeline {
    // Forward declaration in namespace
    class NavicorePipeline;
}

/**
 * @brief Output composite produced by the NavicorePipeline combining fused navigation,
 * map-matching road snapping, rerouting status, and mount dislodgement alerts.
 */
struct PipelineOutput {
    FusionState state;
    std::optional<SnappedResult> snapped_road{std::nullopt};
    bool is_reroute_needed{false};
    bool is_dislodged{false};
    float cross_track_error_m{0.0f};
};

/**
 * @brief Main Native Pipeline Orchestrator (TRD.md §6.1).
 * Coordinates high-rate IMU auto-calibration, 15-state ESKF propagation,
 * HMM Viterbi map-matching, dynamic re-routing, and vehicle kinematic profiles.
 */
class NavicorePipeline {
public:
    explicit NavicorePipeline(VehicleType vehicle_type = VehicleType::PASSENGER_SEDAN);
    explicit NavicorePipeline(const std::string& config_json);

    /**
     * @brief High-frequency IMU processing (100 Hz).
     * Automatically applies mount calibration rotation and evaluates phone dislodgement.
     */
    void ProcessImu(const ImuSample& raw_imu, float dt_seconds = 0.01f);
    void FeedImu(float ax, float ay, float az, float gx, float gy, float gz, int64_t timestamp_nanos = 0);

    /**
     * @brief Ingests GNSS fixes when satellite reception is healthy (Open Sky).
     */
    void UpdateGnss(const GnssFix& fix);
    void FeedGnss(double lat, double lon, double alt, float h_acc = 3.0f, float v_acc = 5.0f, int64_t timestamp_nanos = 0);

    /**
     * @brief Ingests AI Neural Odometer predictions during GNSS blackout.
     */
    void UpdateAiOdometer(const OdometerOutput& ai_odometry, float heading_rad = 0.0f);
    void FeedAiOdometer(float vx, float variance = 0.01f, float stopped_prob = 0.0f, int64_t timestamp_nanos = 0);

    /**
     * @brief Main output accessor. Calls HMM map-matching and route tracking.
     */
    PipelineOutput GetPipelineOutput();
    FusionState GetState();
    FusionState GetLatestState() const;

    /**
     * @brief Returns the most recent snapped road result (nullopt if off-road/basement).
     */
    std::optional<SnappedResult> GetSnappedRoad() const;

    /**
     * @brief Returns whether current position has deviated off-route requiring a re-route.
     */
    bool IsRerouteNeeded() const;

    /**
     * @brief Returns whether physical phone mount dislodgement / slippage was detected.
     */
    bool IsDislodged() const;

    /**
     * @brief Sets the active route polyline (vector of [latitude, longitude] pairs).
     */
    void SetActiveRoute(const std::vector<std::pair<double, double>>& route_coords);

    /**
     * @brief Loads road segments into the HMM map-matching spatial index.
     */
    void SetRoadNetwork(const std::vector<RoadSegment>& segments);
    void LoadRoadNetwork(const std::vector<RoadSegment>& segments);

    /**
     * @brief Updates vehicle kinematic profile.
     */
    void SetVehicleType(VehicleType type);

    /**
     * @brief Accessors for inner components.
     */
    const VehicleKinematicProfile& GetVehicleProfile() const { return current_profile_; }
    EskfFilter& GetEskf() { return eskf_; }
    const EskfFilter& GetEskf() const { return eskf_; }
    MountCalibrator& GetCalibrator() { return calibrator_; }
    HmmMapMatcher& GetMapMatcher() { return map_matcher_; }
    DynamicReroutingEngine& GetReroutingEngine() { return rerouting_engine_; }

private:
    EskfFilter eskf_;
    MountCalibrator calibrator_;
    HmmMapMatcher map_matcher_;
    DynamicReroutingEngine rerouting_engine_;
    VehicleProfileManager profile_manager_;
    VehicleKinematicProfile current_profile_;

    std::vector<std::pair<double, double>> active_route_;
    std::optional<SnappedResult> last_snapped_road_{std::nullopt};
    int64_t last_imu_time_nanos_{0};
};

namespace pipeline {
    using NavicorePipeline = ::navicore::NavicorePipeline;
}

} // namespace navicore
