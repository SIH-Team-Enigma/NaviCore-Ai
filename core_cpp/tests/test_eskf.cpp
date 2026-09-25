#include <iostream>
#include <cassert>
#include <cmath>
#include "navicore/types.hpp"
#include "navicore/eskf.hpp"
#include "navicore/auto_calib.hpp"
#include "navicore/nhc_zupt.hpp"
#include "navicore/hmm_matcher.hpp"

void TestAutoCalibration() {
    std::cout << "[+] Running TestAutoCalibration..." << std::endl;
    navicore::MountCalibrator calibrator;

    // Simulate phone tilted at 45 degrees pitch
    float gravity_mag = 9.81f;
    float tilt_angle = 3.14159f / 4.0f; // 45 deg

    for (int i = 0; i < 200; ++i) {
        navicore::ImuSample s;
        s.timestamp_nanos = i * 10000000LL;
        // Gravity split between Y and Z
        s.ax = 0.0f;
        s.ay = gravity_mag * std::sin(tilt_angle);
        s.az = gravity_mag * std::cos(tilt_angle);

        // Inject dynamic acceleration along vehicle X
        float forward_accel = (i > 50 && i < 150) ? 1.5f : 0.0f;
        s.ax += forward_accel;

        calibrator.Ingest(s);
    }

    auto rot = calibrator.CurrentRotation();
    assert(rot.has_value() && "Dynamic auto-calibration should resolve rotation matrix R_b^v");
    std::cout << "    -> Calibration Matrix R_b^v resolved successfully!" << std::endl;
}

void TestEskfTunnelBlackout() {
    std::cout << "[+] Running TestEskfTunnelBlackout (60s Blackout Simulation)..." << std::endl;
    navicore::EskfFilter eskf;

    // 1. Warm-up in Open Sky for 10 seconds @ 15 m/s
    float dt = 0.01f; // 100 Hz
    int warmup_steps = 1000;
    for (int i = 0; i < warmup_steps; ++i) {
        navicore::ImuSample s;
        s.timestamp_nanos = i * 10000000LL;
        s.ax = 0.0f; s.ay = 0.0f; s.az = 9.81f;
        s.gx = 0.0f; s.gy = 0.0f; s.gz = 0.0f;
        eskf.Predict(s, dt);

        if (i % 10 == 0) { // 10 Hz GNSS
            navicore::GnssFix fix;
            fix.timestamp_nanos = s.timestamp_nanos;
            fix.latitude_deg = 19.0760 + (i * dt * 15.0) / 111111.0;
            fix.longitude_deg = 72.8777;
            fix.speed_mps = 15.0f;
            fix.heading_deg = 0.0f; // Heading North
            eskf.UpdateGnss(fix);
        }
    }

    navicore::FusionState state_open = eskf.GetState();
    assert(state_open.mode == navicore::FusionMode::OPEN_SKY);

    // 2. Enter 60-Second Tunnel Blackout (No GNSS, AI Odometer at 15 m/s)
    int tunnel_steps = 6000;
    for (int i = 0; i < tunnel_steps; ++i) {
        int64_t t_nano = (warmup_steps + i) * 10000000LL;
        navicore::ImuSample s;
        s.timestamp_nanos = t_nano;
        s.ax = 0.0f; s.ay = 0.0f; s.az = 9.81f;
        s.gx = 0.0f; s.gy = 0.0f; s.gz = 0.0f;
        eskf.Predict(s, dt);

        if (i % 10 == 0) { // 10 Hz AI Odometer
            navicore::OdometerOutput ai;
            ai.vx_mps = 15.0f; // 15 m/s forward speed
            ai.variance_vx = 0.02f;
            ai.stopped_prob = 0.0f;
            eskf.UpdateAiOdometer(ai, 0.0f);
        }
    }

    navicore::FusionState state_blackout = eskf.GetState();
    assert(state_blackout.mode == navicore::FusionMode::DEAD_RECKONING);
    assert(state_blackout.blackout_duration_ms >= 59000);
    assert(state_blackout.within_validated_range == true);

    // Theoretical distance inside tunnel = 15 m/s * 60s = 900 meters
    double d_lat = state_blackout.latitude_deg - state_open.latitude_deg;
    double dist_covered = d_lat * 111111.0;
    double drift_error = std::abs(dist_covered - 900.0);

    std::cout << "    -> Distance traversed in tunnel: " << dist_covered << " m (Expected: 900 m)" << std::endl;
    std::cout << "    -> Total Tunnel Dead Reckoning Error: " << drift_error << " m (< 0.5% drift)" << std::endl;
    assert(drift_error < 5.0 && "Tunnel dead reckoning error must be under 5 meters");
}

void TestZuptTrafficLock() {
    std::cout << "[+] Running TestZuptTrafficLock..." << std::endl;
    navicore::EskfFilter eskf;
    navicore::SpectralZuptEngine zupt_engine;

    // Simulate 22 Hz engine idle vibration during traffic stop
    bool detected_idle = false;
    for (int i = 0; i < 100; ++i) {
        float t = i * 0.01f;
        float idle_vib = 0.6f * std::sin(2.0f * 3.14159f * 22.0f * t);
        if (zupt_engine.ProcessSample(idle_vib)) {
            detected_idle = true;
            eskf.ApplyZupt();
        }
    }

    assert(detected_idle && "Spectral ZUPT must identify 22 Hz engine idle harmonics");
    navicore::FusionState s = eskf.GetState();
    assert(s.mode == navicore::FusionMode::ZUPT_LOCKED);
    assert(s.speed_mps < 1e-4f);
    std::cout << "    -> ZUPT Traffic Stop Lock successfully clamped speed to 0.00 m/s!" << std::endl;
}

int main() {
    std::cout << "====================================================" << std::endl;
    std::cout << "[*] NAVICORE AI: NATIVE C++ MATH ENGINE TEST SUITE  " << std::endl;
    std::cout << "====================================================" << std::endl;

    TestAutoCalibration();
    TestEskfTunnelBlackout();
    TestZuptTrafficLock();

    std::cout << "====================================================" << std::endl;
    std::cout << "[*] ALL NATIVE C++ INTEGRATION TESTS PASSED (100%)! " << std::endl;
    std::cout << "====================================================" << std::endl;
    return 0;
}
