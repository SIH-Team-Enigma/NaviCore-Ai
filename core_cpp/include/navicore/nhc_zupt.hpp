#pragma once

#include "types.hpp"
#include <vector>
#include <cmath>

namespace navicore {

/**
 * @brief Frequency-domain engine idle harmonic analyzer and Non-Holonomic Constraint (NHC) engine.
 */
class SpectralZuptEngine {
public:
    explicit SpectralZuptEngine(float sample_rate_hz = 100.0f, size_t window_size = 64);

    /**
     * @brief Ingest acceleration magnitude and update rolling spectral energy ratio.
     * @return True if engine idle harmonic vibration (15-30 Hz) indicates vehicle is stationary.
     */
    bool ProcessSample(float dynamic_accel_mag);

    /**
     * @brief Get calculated spectral energy ratio: Idle_Band(20-35Hz) / Translation_Band(0.1-5Hz).
     */
    float GetHarmonicEnergyRatio() const;

private:
    float sample_rate_{100.0f};
    size_t window_size_{64};
    std::vector<float> buffer_;
    float last_energy_ratio_{0.0f};

    float ComputeBandEnergy(float low_hz, float high_hz) const;
};

/**
 * @brief Kinematic Non-Holonomic Constraints (NHC) calculator for wheeled ground vehicles.
 */
class NhcKinematics {
public:
    /**
     * @brief Computes adaptive measurement noise covariance for lateral & vertical velocities.
     * @param road_roughness_factor Variance of high-frequency vertical acceleration.
     * @param out_sigma_vy Output standard deviation for Vy ~ 0
     * @param out_sigma_vz Output standard deviation for Vz ~ 0
     */
    static void ComputeAdaptiveCovariance(
        float road_roughness_factor,
        float& out_sigma_vy,
        float& out_sigma_vz
    ) {
        // Base kinematic constraints under smooth road conditions
        float base_sigma_y = 0.05f; // 5 cm/s
        float base_sigma_z = 0.05f;

        // Scale measurement uncertainty under severe road roughness / potholes
        float scale = 1.0f + 2.0f * std::min(10.0f, road_roughness_factor);
        out_sigma_vy = base_sigma_y * scale;
        out_sigma_vz = base_sigma_z * scale;
    }
};

} // namespace navicore
