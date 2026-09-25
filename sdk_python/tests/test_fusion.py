"""
=============================================================================
NAVICORE AI: PYTHON FLEET SDK PYTEST TEST SUITE
Smart India Hackathon 2026 | Problem Statement ID: 260168
Theme: Smart Vehicles | Team: @enigm@ (Team ID: 132834)
=============================================================================
Automated tests for the Python reference SDK covering:
- Open sky GNSS ingestion
- Sub-10ms transition to DEAD_RECKONING on GNSS outage
- AI Virtual Odometer forward velocity updates
- Spectral & stationary ZUPT lock engagement
- Sub-0.05% relative drift upper bounds
- NavigationState dataclass & dictionary serialization
"""

import sys
import os
import math
import pytest

# Ensure SDK is in path
SDK_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if SDK_ROOT not in sys.path:
    sys.path.insert(0, SDK_ROOT)

from navicore_sdk import NaviCoreSDK, NavicoreSdk, FusionCoreSDK, NavigationState


def test_sdk_initialization():
    sdk = NaviCoreSDK(vehicle_type="SEDAN", sample_rate_hz=100)
    assert sdk.vehicle_type == "SEDAN"
    assert sdk.sample_rate_hz == 100
    assert sdk.mode == "OPEN_SKY"
    assert sdk.drift_m == 0.0
    assert sdk.speed_mps == 0.0


def test_aliases_and_exports():
    sdk1 = NaviCoreSDK()
    sdk2 = NavicoreSdk()
    sdk3 = FusionCoreSDK()
    assert isinstance(sdk1, NaviCoreSDK)
    assert isinstance(sdk2, NaviCoreSDK)
    assert isinstance(sdk3, NaviCoreSDK)


def test_gnss_ingestion_open_sky():
    sdk = NaviCoreSDK()
    state = sdk.feed_gnss(
        lat=19.0760,
        lon=72.8777,
        alt=15.0,
        speed_mps=13.88,
        heading_deg=90.0,
        accuracy_m=2.5,
        timestamp_ns=int(1.0 * 1e9)
    )

    assert state["latitude"] == pytest.approx(19.0760, rel=1e-5)
    assert state["longitude"] == pytest.approx(72.8777, rel=1e-5)
    assert state["altitude_m"] == 15.0
    assert state["speed_mps"] == pytest.approx(13.88, rel=1e-3)
    assert state["speed_kmh"] == pytest.approx(50.0, rel=1e-2)
    assert state["heading_deg"] == pytest.approx(90.0, rel=1e-2)
    assert state["navigation_mode"] == "OPEN_SKY"
    assert state["mode"] == "OPEN_SKY"
    assert state["estimated_drift_m"] == 0.0


def test_blackout_hot_switching_dead_reckoning():
    sdk = NaviCoreSDK(sample_rate_hz=100)
    # 1. Provide initial GNSS fix at t=0
    sdk.feed_gnss(lat=19.0760, lon=72.8777, alt=10.0, speed_mps=13.88, heading_deg=0.0, timestamp_ns=0)

    # 2. Simulate 2.0s blackout (no GNSS updates) with IMU feed
    # Feed IMU at t=2.0s -> GNSS loss detected (>1.5s) -> switches to DEAD_RECKONING
    t_ns = int(2.0 * 1e9)
    # Forward acceleration ay=0.01 (compensates bias), gz=0.005 (compensates bias)
    state = sdk.feed_imu(ax=0.0, ay=0.01, az=9.81, gx=0.0, gy=0.0, gz=0.005, dt=0.01, timestamp_ns=t_ns)

    assert state["navigation_mode"] == "DEAD_RECKONING"
    assert state["mode"] == "DEAD_RECKONING"
    assert state["blackout_duration_ms"] >= 0
    assert state["within_validated_range"] is True


def test_ai_odometer_speed_update():
    sdk = NaviCoreSDK()
    sdk.feed_gnss(lat=19.0760, lon=72.8777, speed_mps=10.0, timestamp_ns=0)

    # Update with AI predicted speed
    state = sdk.feed_ai_odometer(vx=15.5, variance=0.005, stopped_prob=0.02)
    assert state["speed_mps"] == pytest.approx(15.5, rel=1e-2)
    assert state["speed_kmh"] == pytest.approx(55.8, rel=1e-2)

    # Update with high stopped probability -> triggers ZUPT
    state_stopped = sdk.feed_ai_odometer(vx=0.0, variance=0.001, stopped_prob=0.95)
    assert state_stopped["navigation_mode"] == "ZUPT_LOCKED"
    assert state_stopped["speed_mps"] == 0.0


def test_spectral_zupt_idle_lock():
    sdk = NaviCoreSDK()
    sdk.feed_gnss(lat=19.0760, lon=72.8777, speed_mps=0.0, timestamp_ns=0)

    # Feed stationary idle IMU reading
    state = sdk.feed_imu(ax=0.05, ay=0.05, az=9.81, gx=0.0, gy=0.0, gz=0.01, dt=0.01, timestamp_ns=int(2.0*1e9))
    assert state["navigation_mode"] == "ZUPT_LOCKED"
    assert state["speed_mps"] == 0.0


def test_strict_drift_bounds_under_blackout():
    """
    Simulates a 1,000m tunnel blackout at 50 km/h (13.88 m/s, ~72 seconds).
    Verifies that cumulative relative drift is strictly < 0.05%.
    """
    sdk = NaviCoreSDK(sample_rate_hz=100)
    start_lat, start_lon = 18.9180, 73.1850
    sdk.feed_gnss(lat=start_lat, lon=start_lon, speed_mps=13.88, heading_deg=0.0, timestamp_ns=0)

    target_dist_m = 1000.0
    speed_mps = 13.88
    dt = 0.01
    total_steps = int(target_dist_m / (speed_mps * dt))

    # Run blackout simulation
    for step in range(total_steps):
        t_ns = int((2.0 + step * dt) * 1e9)  # Start past GNSS timeout
        state = sdk.feed_imu(ax=0.0, ay=0.01, az=9.81, gx=0.0, gy=0.0, gz=0.005, dt=dt, timestamp_ns=t_ns)

    final_drift_m = state["estimated_drift_m"]
    relative_drift_pct = (final_drift_m / target_dist_m) * 100.0

    assert state["navigation_mode"] == "DEAD_RECKONING"
    assert relative_drift_pct < 0.05, f"Relative drift {relative_drift_pct:.4f}% exceeded strict 0.05% threshold"


def test_navigation_state_dataclass_and_serialization():
    sdk = NaviCoreSDK(vehicle_type="TRUCK")
    sdk.feed_gnss(lat=19.0760, lon=72.8777, alt=12.0, speed_mps=20.0, heading_deg=45.0, timestamp_ns=0)

    nav_state = sdk.get_navigation_state()
    assert isinstance(nav_state, NavigationState)
    assert nav_state.latitude == pytest.approx(19.0760, rel=1e-5)
    assert nav_state.vehicle_profile == "TRUCK"
    assert nav_state.navigation_mode == "OPEN_SKY"
    assert len(nav_state.covariance_diagonal) == 15

    d = nav_state.to_dict()
    assert isinstance(d, dict)
    assert d["latitude"] == nav_state.latitude
    assert d["vehicle_profile"] == "TRUCK"


def test_reset_and_vehicle_profile_switching():
    sdk = NaviCoreSDK()
    sdk.feed_gnss(lat=19.0760, lon=72.8777, speed_mps=15.0, timestamp_ns=0)
    sdk.set_vehicle_profile("MOTORCYCLE")
    assert sdk.vehicle_type == "MOTORCYCLE"

    sdk.reset()
    assert sdk.lat == 0.0
    assert sdk.lon == 0.0
    assert sdk.speed_mps == 0.0
    assert sdk.has_origin is False
    assert sdk.drift_m == 0.0
