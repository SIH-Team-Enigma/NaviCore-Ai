#pragma once

#include "types.hpp"
#include <cmath>
#include <array>

namespace navicore {

/**
 * @brief 15-State Error-State Kalman Filter (ESKF) for GNSS/INS/AI fusion.
 * Error state: [delta_p (3), delta_v (3), delta_theta (3), delta_ba (3), delta_bg (3)]
 */
class EskfFilter {
public:
    EskfFilter();

    /**
     * @brief High-frequency IMU propagation step (100 Hz).
     */
    void Predict(const ImuSample& imu_vehicle_frame, float dt_seconds);

    /**
     * @brief Measurement update when GNSS is healthy (Open Sky).
     */
    void UpdateGnss(const GnssFix& gnss_fix);

    /**
     * @brief Measurement update when GNSS is in blackout (<10ms hot switch).
     * Fuses AI predicted forward velocity Vx + Non-Holonomic Constraints (Vy=0, Vz=0).
     */
    void UpdateAiOdometer(const OdometerOutput& ai_odometry, float heading_rad);

    /**
     * @brief Zero-Velocity Update (ZUPT) triggered by AI idle classifier.
     */
    void ApplyZupt();

    /**
     * @brief Returns current fused state at 10 Hz.
     */
    FusionState GetState() const;

    /**
     * @brief Returns 15-state error covariance diagonal.
     */
    std::array<float, 15> GetCovarianceDiagonal() const { return p_diag_; }

    /**
     * @brief Resets filter state and covariance.
     */
    void Reset();

private:
    // Nominal state
    double lat_{19.0760};   // Degrees
    double lon_{72.8777};
    double alt_{10.0};      // Meters
    float vn_{0.0f}, ve_{0.0f}, vd_{0.0f}; // Velocity in NED frame (m/s)
    float roll_{0.0f}, pitch_{0.0f}, yaw_{0.0f}; // Euler angles (radians)
    float ba_[3]{0.0f, 0.0f, 0.0f}; // Accelerometer bias (m/s^2)
    float bg_[3]{0.0f, 0.0f, 0.0f}; // Gyroscope bias (rad/s)

    // Covariance matrix diagonals (simplified 15x15 diagonal tracking for embedded efficiency)
    std::array<float, 15> p_diag_;

    FusionMode current_mode_{FusionMode::OPEN_SKY};
    int64_t last_gnss_timestamp_nanos_{0};
    int64_t blackout_start_nanos_{0};
    int64_t current_timestamp_nanos_{0};

    float heading_uncertainty_rad_{0.01f};

    void LocalNedToGeo(float dn, float de, double& lat, double& lon) const;
};

} // namespace navicore
