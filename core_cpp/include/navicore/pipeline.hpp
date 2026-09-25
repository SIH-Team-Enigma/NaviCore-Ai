#pragma once

#include "types.hpp"
#include "eskf.hpp"
#include "auto_calib.hpp"
#include "hmm_matcher.hpp"
#include "rerouting_engine.hpp"
#include "nhc_zupt.hpp"
#include "vehicle_profiles.hpp"

#include <memory>
#include <string>
#include <vector>
#include <mutex>
#include <functional>

namespace navicore::pipeline {

/**
 * @brief Main High-Performance Native Pipeline Orchestrator for NaviCore AI.
 * Coordinates 100 Hz IMU propagation, Auto-calibration, AI Virtual Odometer ingestion,
 * 15-State ESKF updates, HMM road snapping, and autonomous re-routing telemetry.
 */
class NavicorePipeline {
public:
    explicit NavicorePipeline(const std::string& config = "");
    ~NavicorePipeline() = default;

    // Disallow copy, allow move
    NavicorePipeline(const NavicorePipeline&) = delete;
    NavicorePipeline& operator=(const NavicorePipeline&) = delete;
    NavicorePipeline(NavicorePipeline&&) noexcept = default;
    NavicorePipeline& operator=(NavicorePipeline&&) noexcept = default;

    /**
     * @brief Ingest high-frequency 6-DOF IMU reading (100 Hz).
     */
    void FeedImu(float ax, float ay, float az, float gx, float gy, float gz, int64_t timestamp_ns);

    /**
     * @brief Ingest GNSS fix from satellite receiver.
     */
    void FeedGnss(double lat, double lon, double alt, float h_acc, float v_acc, int64_t timestamp_ns);

    /**
     * @brief Ingest Virtual AI Odometer prediction.
     */
    void FeedAiOdometer(float vx, float variance, float stopped_prob, int64_t timestamp_ns);

    /**
     * @brief Retrieve current fused navigation and telemetry state.
     */
    FusionState GetState() const;

    /**
     * @brief Direct state extraction into target struct.
     */
    void GetState(FusionState& state_out) const;

    /**
     * @brief Load offline road network segments into the HMM map matching engine.
     */
    void LoadRoadNetwork(const std::vector<RoadSegment>& segments);

    /**
     * @brief Update vehicle profile.
     */
    void SetVehicleProfile(VehicleType type);

    /**
     * @brief Reset pipeline filters and calibration.
     */
    void Reset();

private:
    mutable std::mutex mutex_;

    MountCalibrator calibrator_;
    EskfFilter eskf_;
    HmmMapMatcher map_matcher_;
    DynamicReroutingEngine rerouting_engine_;
    VehicleKinematicProfile profile_;

    int64_t last_imu_timestamp_ns_{0};
    int64_t last_gnss_timestamp_ns_{0};

    // Cached telemetry flags
    int64_t snapped_road_id_{0};
    float snapped_confidence_{0.0f};
    bool is_reroute_needed_{false};
    bool is_dislodged_{false};
};

} // namespace navicore::pipeline
