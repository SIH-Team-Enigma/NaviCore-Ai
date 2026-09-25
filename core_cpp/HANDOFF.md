# NaviCore AI: Track A (Dhruvin) -> Track B (Manthan) Handoff Dossier
**Component**: `navicore::pipeline::NavicorePipeline` (DV-11 Native Pipeline Handoff)  
**Target Consumer**: MN-02 (JNI Bridge Rewrite), MN-03 (HMM Map Matching Integration)  
**Status**: Ready for Integration

---

## 1. Architectural Overview

The native C++ core encapsulates all sensor conditioning, error-state Kalman filtering, dynamic auto-calibration, and map matching within a unified `NavicorePipeline` orchestrator:

```
[Raw 6-DOF IMU (100 Hz)] ────> [MountCalibrator (LPF+PCA)] ────> Body-to-Vehicle Rotation (R_b^v)
                                                                       │
[Satellite GNSS (1-10 Hz)] ──────────────────────────────────────────> │
                                                                       ▼
[AI Virtual Odometer (10 Hz)] ───────────────────────────────> [15-State ESKF]
                                                                       │
                                                                       ▼
[Offline OSM Road Network] ──> [HmmMapMatcher] ───────────────> [FusionState Output]
                                                                       │
                                                                       ▼
                                                          [JNI Bridge -> FusionCore.kt]
```

---

## 2. C++ Class Interface

Header: `core_cpp/include/navicore/pipeline.hpp` (aliased in `navicore_pipeline.hpp`)

```cpp
namespace navicore::pipeline {

class NavicorePipeline {
public:
    explicit NavicorePipeline(const std::string& config = "");
    ~NavicorePipeline() = default;

    // High frequency sensor ingestion
    void FeedImu(float ax, float ay, float az, float gx, float gy, float gz, int64_t timestamp_ns);
    void FeedGnss(double lat, double lon, double alt, float h_acc, float v_acc, int64_t timestamp_ns);
    void FeedAiOdometer(float vx, float variance, float stopped_prob, int64_t timestamp_ns);

    // State extraction
    FusionState GetState() const;
    void GetState(FusionState& state_out) const;

    // Map matching & kinematics
    void LoadRoadNetwork(const std::vector<RoadSegment>& segments);
    void SetVehicleProfile(VehicleType type);
    void Reset();
};

} // namespace navicore::pipeline
```

---

## 3. Telemetry & FusionState Contract

The updated `navicore::FusionState` exposes comprehensive navigation and diagnostic fields:
- `timestamp_nanos`: System epoch nanos of the latest processed epoch.
- `latitude_deg`, `longitude_deg`, `altitude_m`: WGS84 coordinates.
- `speed_mps`: Estimated forward vehicle speed ($m/s$).
- `heading_rad`: Vehicle yaw heading in radians $[-\pi, +\pi]$.
- `heading_uncertainty_rad`: ESKF error covariance standard deviation for yaw.
- `mode`: Navigation mode (`OPEN_SKY = 0`, `DEAD_RECKONING = 1`, `ZUPT_LOCKED = 2`).
- `blackout_duration_ms`: Duration of consecutive dead reckoning in milliseconds.
- `within_validated_range`: `true` if blackout duration $\le 120,000$ ms, `false` if degraded.
- `snapped_road_id`: OSM way/segment ID when snapped via HMM Viterbi matcher ($0$ if unmapped/off-grid).
- `snapped_confidence`: Spatial emission & transition confidence score $[0.0, 1.0]$.
- `is_reroute_needed`: Autonomous re-routing flag (triggered when cross-track error $> 30$ m).
- `is_dislodged`: Phone mount slip flag (triggered on angular acceleration jerk $> 2.5$ rad/s or LPF gravity reorientation).
- `covariance_diagonal`: 15-element error covariance diagonal array.

---

## 4. JNI Memory Management Requirements (MN-02)

1. **Pointer Lifecycle**:
   - `nativeInit(config: String): Long` constructs `new navicore::pipeline::NavicorePipeline(config)` and returns `reinterpret_cast<jlong>(ptr)`.
   - `nativeDestroy(handle: Long)` invokes `delete reinterpret_cast<navicore::pipeline::NavicorePipeline*>(handle)`.
2. **Zero Allocation in Hot Loops**:
   - All `nativeFeedImu`, `nativeFeedGnss`, and `nativeFeedAiOdometer` calls operate directly on primitive arguments without intermediate object creation.
   - `nativeGetState(handle: Long, stateOut: FusionState)` marshals state directly into the preallocated Kotlin object to ensure zero garbage collection churn at 100 Hz.
