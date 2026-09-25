#pragma once

#include <cstdint>
#include <vector>
#include <string>
#include <optional>

namespace navicore {

/**
 * @brief Raw 6-DOF IMU sensor reading from device body frame.
 */
struct ImuSample {
    int64_t timestamp_nanos{0};
    float ax{0.0f};  // m/s^2, phone body frame
    float ay{0.0f};  // m/s^2, phone body frame
    float az{0.0f};  // m/s^2, phone body frame
    float gx{0.0f};  // rad/s, phone body frame
    float gy{0.0f};  // rad/s, phone body frame
    float gz{0.0f};  // rad/s, phone body frame
    std::optional<float> mx; // uT, optional magnetometer
    std::optional<float> my;
    std::optional<float> mz;
};

/**
 * @brief GNSS measurement fix from satellite receiver.
 */
struct GnssFix {
    int64_t timestamp_nanos{0};
    double latitude_deg{0.0};
    double longitude_deg{0.0};
    double altitude_m{0.0};
    std::optional<float> speed_mps;
    std::optional<float> heading_deg;
    std::optional<float> hdop;
    std::optional<int32_t> satellites_count;
};

/**
 * @brief Inferred output from on-device Neural Virtual Odometer.
 */
struct OdometerOutput {
    float vx_mps{0.0f};         // Predicted forward velocity in vehicle frame (m/s)
    float variance_vx{0.01f};   // Predicted aleatoric uncertainty (sigma^2)
    float stopped_prob{0.0f};   // P(vehicle stopped) for ZUPT trigger [0.0, 1.0]
};

/**
 * @brief High-level navigation operating mode.
 */
enum class FusionMode {
    OPEN_SKY,         // Healthy GNSS, ESKF continuously learning IMU biases
    DEAD_RECKONING,   // GNSS Blackout (<10ms switch), AI Odometer + NHC Active
    ZUPT_LOCKED       // Vehicle idling/stationary, zero-drift lock engaged
};

/**
 * @brief Fused navigation state produced by the ESKF at 10 Hz.
 */
struct FusionState {
    int64_t timestamp_nanos{0};
    double latitude_deg{0.0};
    double longitude_deg{0.0};
    double altitude_m{0.0};
    float speed_mps{0.0f};
    float heading_rad{0.0f};
    float heading_uncertainty_rad{0.01f};
    FusionMode mode{FusionMode::OPEN_SKY};
    int64_t blackout_duration_ms{0};
    bool within_validated_range{true};
    int64_t snapped_road_id{0};
    float snapped_confidence{0.0f};
    bool is_reroute_needed{false};
    bool is_dislodged{false};
    std::vector<float> covariance_diagonal{std::vector<float>(15, 0.0f)};
};

/**
 * @brief 3x3 Phone-to-Vehicle Rotation Matrix.
 */
struct RotationMatrix3x3 {
    float r[3][3];
};

} // namespace navicore
