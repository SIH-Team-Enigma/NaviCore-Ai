# NaviCore AI - Manthan's Work Plan & Verification Prompts
**Role**: Track B Lead - Android Application, JNI Pipeline Integration, UI/UX, ROS2, Tooling, SDK & QA  
**Team**: @enigm@ (132834) | SIH 2026 | Problem Statement 260168  
**Collaborator**: Dhruvin Vaghasiya (Track A: ML Pipeline, TCN Model & C++ Core Math)

---

## 1. Executive Summary & Ownership Boundaries

This document defines the **complete, self-contained implementation and verification prompts for Manthan (Track B)**. Every work chunk is isolated, chronologically sequenced, mapped to the system requirements (PRD / TRD / ROADMAP), and equipped with an **automated or script-driven Verification Plan**.

### Track Ownership Matrix

| Scope Area | Owner | Key Responsibilities |
|---|---|---|
| **Android App Layer** | **Manthan** | Sensor ingestion (100 Hz), Foreground Service, State management, Compose UI (4 modes, 10 Hz interpolation), Telemetry overlay, Offline OSM map-matching loader. |
| **JNI Native Bridge** | **Manthan** | JNI bridge (`jni_bridge.cpp`) wrapping Dhruvin's `NavicorePipeline`, Kotlin-native data marshaling (`FusionCore.kt`, `FusionState.kt`). |
| **Robotics & Simulation** | **Manthan** | ROS2 node (`ros2_node`), AI-odometer subscriber bridge, ENU coordinate transforms, `simulate_drive.py`. |
| **Visualizer & Demo Tooling**| **Manthan** | Web visualizer (`web_visualizer`), Real-time WebSocket sensor server (`realtime_sensor_server.py`), Presentation mode. |
| **Fleet SDK & QA Pass** | **Manthan** | Python Fleet SDK (`sdk_python`), automated end-to-end verification harnesses, profiling & `RESULTS_SUMMARY.md`. |
| **ML & C++ Core Math** | *Dhruvin (Track A)* | TCN architecture, IO-VNBD dataset, PyTorch training, INT8 TFLite export, ESKF math, Auto-calibration, NHC/ZUPT, HMM algorithm. |

---

## 2. Synchronization & Handoff Milestones

```
Phase 0 (Week 0):   [MN-00] App/ROS2/Web/SDK/Scripts Restructure  <===>  [DV-00] core_cpp/ML Restructure
                                      │
                                      ▼
Phase 1 (Week 1-2): [MN-01] IMU Sensor Hardening & FG Service     (Runs in parallel with DV-01..DV-07)
                                      │
                                      ▼
Phase 2 (Week 3-5): [MN-02] JNI Bridge Rewrite  ◄─────── Blocked on DV-11 (NavicorePipeline handoff)
                    [MN-03] OSM HMM Matcher     ◄─────── Blocked on DV-10 (HmmMapMatcher)
                                      │
                                      ▼
Phase 3 (Week 6-8): [MN-04] 4 UI Modes & Interpolator
                    [MN-05] Telemetry Overlay
                    [MN-06] On-Device Profiling Pass ─── (Uses DV-08 real TFLite model)
                    [MN-07] ROS2 Blackout & Odom Bridge
                    [MN-08] Web Visualizer & Live Stream Server
                                      │
                                      ▼
Phase 4 (Week 9-10):[MN-09] Python Fleet SDK Audit & PyTest
                    [MN-10] Master QA Verification Pass & Final Submission Dossier
```

---

# PHASE 0: Modular Restructuring (Week 0)

## MN-00 — Restructure App, ROS2, Visualizer, SDK, and Scripts into Feature Packages
**Maps to**: Foundational Architecture | **Dependencies**: Run in parallel with DV-00 before any feature work.

### Context & Implementation Scope
Move flat files into clean, feature-scoped modules across all Track B components:
1. **`android_app/`**:
   - `.../navicore/sensor/ImuSensorManager.kt` ➔ `.../navicore/imu/ImuSensorManager.kt`
   - `.../navicore/sensor/NavigationService.kt` ➔ `.../navicore/service/NavigationService.kt`
   - `.../navicore/ui/MapScreen.kt` ➔ `.../navicore/ui/map/MapScreen.kt`
   - `.../navicore/ui/NavigationViewModel.kt` ➔ `.../navicore/ui/viewmodel/NavigationViewModel.kt`
   - *(Keep `odometer/`, `mapmatch/`, `fusion/` as they are; keep `app/src/main/cpp/` flat for JNI stability)*.
2. **`ros2_node/`**:
   - `src/navicore_node.cpp` ➔ `src/node/navicore_node.cpp`
   - Create directories: `ros2_node/src/bridge/` and `ros2_node/msg/`.
3. **`web_visualizer/`**:
   - Split `app.js` into: `src/js/map-renderer.js`, `src/js/telemetry-panel.js`, `src/js/socket-client.js`.
   - `style.css` ➔ `src/css/style.css`.
   - Update `<script>` and `<link>` tags in `index.html` and `sensor_stream.html`.
4. **`sdk_python/`**:
   - `navicore_sdk.py` ➔ Package `navicore_sdk/{__init__.py, fusion.py, state.py}` with re-exports in `__init__.py`.
5. **`scripts/`**:
   - Verification: `scripts/verification/{test_end_to_end.py, verify_vehicle_kinematics.py, strict_verification_harness.py, verify_application.py}`
   - Simulation: `scripts/simulation/{simulate_drive.py, record_field_session.py}`
   - Profiling: `scripts/profiling/{profile_hardware_footprint.py, benchmark_suite.py}`
   - Demo: `scripts/demo/{realtime_sensor_server.py, launch_visualizer.py}`

### Prompt to Run
```text
Execute MN-00: Apply the feature-wise folder restructuring across android_app, ros2_node, web_visualizer, sdk_python, and scripts.

1. Use git mv for all mapped files to retain history.
2. Update all import paths, script references, subprocess calls, and HTML tags repo-wide.
3. Verify no broken references remain.
```

### Verification & Testing Plan
- **Verification Script / Commands**:
  ```powershell
  # 1. Verify Android Build
  cd android_app; ./gradlew assembleDebug --dry-run; cd ..

  # 2. Verify Python Scripts and Imports
  python -m py_compile scripts/verification/*.py scripts/simulation/*.py scripts/profiling/*.py scripts/demo/*.py

  # 3. Verify Python SDK imports
  python -c "import sys; sys.path.insert(0, 'sdk_python'); from navicore_sdk import NavicoreSdk; print('SDK Import OK')"

  # 4. Check for dangling old paths
  git grep "navicore/sensor/ImuSensorManager" || echo "Clean"
  ```
- **Pass Criteria**:
  - Zero compilation or import errors across all subprojects.
  - Zero lingering legacy file paths in git grep.

---

# PHASE 1: Sensor Ingestion & Android Hardening (Weeks 1–2)

## MN-01 — Audit & Harden IMU Ingestion and Foreground Service
**Maps to**: PRD FR-01, TRD §3.1, ROADMAP Phase 1 | **Dependencies**: Independent (Can start immediately).

### Context & Implementation Scope
1. **100 Hz Sampling & Circular Buffer**: In `android_app/.../imu/ImuSensorManager.kt`, enforce `SENSOR_DELAY_FASTEST` / `SENSOR_DELAY_GAME` (target 100 Hz, 10 ms interval). Maintain a synchronized circular buffer maintaining 1.0 s window (100 samples) with 50% overlap (50 samples step).
2. **Foreground Service Hardening**: In `android_app/.../service/NavigationService.kt`, ensure `startForeground()` is called with a persistent high-priority notification channel (`FOREGROUND_SERVICE_LOCATION` + `FOREGROUND_SERVICE_HEALTH/SENSOR`), acquiring a `PARTIAL_WAKE_LOCK` to prevent OS throttling.
3. **Dropped Sample Detection**: Track delta timestamps (`t_curr - t_prev`). Count dropped samples when `delta_t > 15ms`. Emit a diagnostic warning if drop rate exceeds 1.0% over a 10-minute session.
4. **Diagnostics Logger**: Log empirical sample rate statistics (mean Hz, std-dev, max jitter) every 10 seconds.

### Prompt to Run
```text
Open android_app/app/src/main/java/org/enigma/navicore/imu/ImuSensorManager.kt and
android_app/app/src/main/java/org/enigma/navicore/service/NavigationService.kt.

1. Enforce 100 Hz sensor sampling using a thread-safe circular buffer with 100-sample window and 50-sample hop.
2. Ensure NavigationService runs as a hardened Android foreground service with WAKELOCK and non-dismissible notification.
3. Implement dropped sample tracking: calculate jitter and assert dropped samples stay <= 1% over 10 minutes.
4. Add diagnostic logging for actual achieved Hz and jitter.
```

### Verification & Testing Plan
- **Verification Script**: Create `scripts/verification/verify_imu_stream.py` and run Android instrumentation test:
  ```powershell
  # 1. Run Android Unit/Instrumentation Test for Buffer & Jitter
  cd android_app; ./gradlew testDebugUnitTest --tests "org.enigma.navicore.imu.ImuSensorManagerTest"; cd ..

  # 2. Validate live/logged sensor stream with verification script
  python scripts/verification/verify_vehicle_kinematics.py --input data/field_logs/live_test_run.csv --check-sampling-rate
  ```
- **Pass Criteria**:
  - Circular buffer outputs exact `[6, 100]` float tensors every 500 ms (50% overlap).
  - Dropped sample rate measured at `< 1.0%` over continuous run.
  - Notification and wakelock persist without service death in background.

---

# PHASE 2: JNI Native Bridge & Map Matching (Weeks 3–5)

## MN-02 — Rewrite JNI Bridge Against `NavicorePipeline`
**Maps to**: TRD §4.2, PRD FR-02 | **Dependencies**: Blocked on Dhruvin's DV-11 (`core_cpp/HANDOFF.md`).

### Context & Implementation Scope
1. **Single Pipeline Instance**: Refactor `android_app/app/src/main/cpp/jni_bridge.cpp` from managing disconnected `EskfFilter` and `MountCalibrator` pointers to owning a single `navicore::pipeline::NavicorePipeline` instance.
2. **Expose Native API in Kotlin**: Update `android_app/.../fusion/FusionCore.kt` with JNI bindings:
   - `nativeInit(config: String): Long`
   - `nativeFeedImu(handle: Long, ax: Float, ay: Float, az: Float, gx: Float, gy: Float, gz: Float, timestampNs: Long)`
   - `nativeFeedGnss(handle: Long, lat: Double, lon: Double, alt: Double, hAcc: Float, vAcc: Float, timestampNs: Long)`
   - `nativeFeedAiOdometer(handle: Long, vx: Float, variance: Float, stoppedProb: Float, timestampNs: Long)`
   - `nativeGetState(handle: Long, stateOut: FusionState)`
   - `nativeDestroy(handle: Long)`
3. **Extend `FusionState.kt`**: Add newly exposed pipeline telemetry:
   - `snappedRoadId: Long`, `snappedConfidence: Float`
   - `isRerouteNeeded: Boolean`, `isDislodged: Boolean`
   - `withinValidatedRange: Boolean` (false when blackout duration > 120,000 ms)
   - `covarianceDiagonal: FloatArray`

### Prompt to Run
```text
Read core_cpp/HANDOFF.md (from DV-11). Rewrite android_app/app/src/main/cpp/jni_bridge.cpp and
android_app/.../fusion/FusionCore.kt & FusionState.kt.

1. jni_bridge.cpp must manage a single navicore::pipeline::NavicorePipeline instance.
2. Map all native methods cleanly to FusionCore.kt without memory leaks.
3. Expand FusionState to include snapped road metadata, reroute flags, dislodge flags, and uncertainty covariance.
```

### Verification & Testing Plan
- **Verification Script / C++ Test**:
  ```powershell
  # 1. Run Native C++ Bridge Tests
  cd core_cpp; ctest -R test_pipeline --output-on-failure; cd ..

  # 2. Run Android JNI Pipeline Integration Test
  cd android_app; ./gradlew testDebugUnitTest --tests "org.enigma.navicore.fusion.FusionCoreTest"; cd ..
  ```
- **Pass Criteria**:
  - Zero memory leaks across 100,000 consecutive IMU/GNSS feeds.
  - `FusionState` correctly reflects `DEAD_RECKONING` mode within 100 ms of GNSS cutoff.

---

## MN-03 — Replace `SimpleOsmMapMatcher` Stub with Real HMM Bridge & Offline OSM Loader
**Maps to**: PRD FR-08, API.MD §5 | **Dependencies**: Blocked on Dhruvin's DV-10 (`HmmMapMatcher`).

### Context & Implementation Scope
1. **Eliminate Stub**: `SimpleOsmMapMatcher.kt` currently returns `null` unconditionally. Replace it with `NativeOsmMapMatcher.kt` that interfaces with the native `HmmMapMatcher` via `FusionState`.
2. **Offline OSM Road Network Loader**: Implement `android_app/.../mapmatch/OfflineRoadNetworkLoader.kt`:
   - Load pre-packaged offline vector / GeoJSON / OSM node-edge extract (`data/demo_osm_bbox.json`) into memory at app boot.
   - Marshall road segment vectors (`segment_id`, `start_lat`, `start_lon`, `end_lat`, `end_lon`, `speed_limit`, `one_way`) into native `LoadRoadNetwork()` via JNI.
3. **Safe Fallback**: Return `null` when off-grid (e.g. underground parking or unmapped roads), maintaining the `SnappedCoordinate(lat, lon, roadSegmentId, confidence)` contract.

### Prompt to Run
```text
Open android_app/app/src/main/java/org/enigma/navicore/mapmatch/MapMatcher.kt and create OfflineRoadNetworkLoader.kt.

1. Replace SimpleOsmMapMatcher stub with NativeOsmMapMatcher connecting to native HmmMapMatcher.
2. Implement offline road network loading for demo bounding box.
3. Adhere to SnappedCoordinate contract and verify safe null return when off-network.
```

### Verification & Testing Plan
- **Verification Script**:
  ```powershell
  # 1. Run Offline Map Matcher Unit Tests with synthetic GPS traces
  cd android_app; ./gradlew testDebugUnitTest --tests "org.enigma.navicore.mapmatch.MapMatcherTest"; cd ..

  # 2. Run Kinematic Map Match Verification Script
  python scripts/verification/verify_vehicle_kinematics.py --test-map-matching --geojson data/demo_osm_bbox.json
  ```
- **Pass Criteria**:
  - GPS points within 15 m of a road segment snap with `confidence > 0.85`.
  - GPS points in unmapped zones (basements) return `null` without throwing exceptions.

---

# PHASE 3: UI, Profiling, ROS2 & Web Visualizer (Weeks 6–8)

## MN-04 — Implement 4 Visual UI Modes, 10 Hz Interpolator & Blackout Toggle
**Maps to**: PRD §7, ROADMAP Phase 3 | **Dependencies**: Follows MN-02 & MN-03.

### Context & Implementation Scope
1. **4 UI Modes in Compose (`MapScreen.kt`)**:
   - **OPEN_SKY**: Vibrant emerald beacon with solid GPS signal cue.
   - **DEAD_RECKONING**: Cyan pulsing beacon with real-time blackout duration counter (`00:45s`). Visibly downgrade indicator color/style to warning amber when `withinValidatedRange == false` (blackout > 120s).
   - **ZUPT_LOCKED (Traffic Idle)**: Amber anchor icon indicating zero-velocity lock, displaying stationary confidence %.
   - **RE_CALIBRATION**: Subtle overlay banner triggered when `isDislodged == true`, showing active re-alignment timer.
2. **10 Hz Coordinate Interpolator**: Implement smooth Bezier/Spherical Linear Interpolation (Slerp) in `NavigationViewModel.kt` to interpolate between 1 Hz GNSS or 2 Hz AI-odometer ticks, guaranteeing 60 FPS marker rendering without jumpiness.
3. **Simulated Blackout Toggle**: Developer/Judge toggle in UI. Must display persistent floating banner: `"SIMULATED GNSS BLACKOUT (DEMO)"`.

### Prompt to Run
```text
Open android_app/app/src/main/java/org/enigma/navicore/ui/map/MapScreen.kt and NavigationViewModel.kt.

1. Implement all 4 PRD §7 visual modes with dynamic state switching.
2. Implement 10 Hz coordinate interpolation for butter-smooth map marker animation.
3. Add GNSS-blackout simulation toggle with prominent "SIMULATED BLACKOUT" UI disclosure.
4. Ensure blackout indicator visibly downgrades confidence past 120s.
```

### Verification & Testing Plan
- **Verification Script / UI Automation**:
  ```powershell
  # 1. Run Compose UI State Unit Tests
  cd android_app; ./gradlew testDebugUnitTest --tests "org.enigma.navicore.ui.NavigationViewModelTest"; cd ..

  # 2. Simulate complete drive with simulated blackout transitions
  python scripts/simulation/simulate_drive.py --mode automated_ui_test --blackout-at 30 --duration 150
  ```
- **Pass Criteria**:
  - State changes trigger correct UI themes within 1 UI frame (16 ms).
  - Marker velocity and position remain continuous without teleportation artifacts.

---

## MN-05 — Live Telemetry Overlay with Zero-Fabrication Guarantee
**Maps to**: ROADMAP Phase 3, PRD §7 | **Dependencies**: Follows MN-02 & MN-04.

### Context & Implementation Scope
1. **Telemetry Component**: Create `android_app/.../ui/telemetry/TelemetryOverlay.kt` overlaid on `MapScreen.kt`.
2. **Dynamic Fields (Derived from `FusionState`)**:
   - Estimated Cross-Track / Along-Track Drift ($m$).
   - Current Blackout Elapsed Time ($s$).
   - 1-Sigma Position Uncertainty Radius ($m$).
   - AI Odometer $v_x$ ($m/s$) & ZUPT probability ($0.0 - 1.0$).
   - Snapped Road Name & Segment ID.
3. **Strict Zero-Fabrication Rule**: If a value is uncomputed or in warmup, display `"--"` or `"CALIBRATING"` rather than placeholder dummy numbers.

### Prompt to Run
```text
Create android_app/app/src/main/java/org/enigma/navicore/ui/telemetry/TelemetryOverlay.kt and wire into MapScreen.kt.

1. Display live computed drift, uncertainty, blackout elapsed time, velocity, and snapped road info.
2. Direct 100% data sourcing from FusionState with zero hardcoded or fabricated numbers.
```

### Verification & Testing Plan
- **Verification Method**: Run test suite asserting exact 1-to-1 mapping between mock `FusionState` objects and UI state text outputs:
  ```powershell
  cd android_app; ./gradlew testDebugUnitTest --tests "org.enigma.navicore.ui.TelemetryOverlayTest"; cd ..
  ```
- **Pass Criteria**:
  - Telemetry updates at $\ge 5\text{ Hz}$ without UI thread jank.
  - Zero placeholder values shown during simulated blackouts.

---

## MN-06 — On-Device Hardware & Performance Profiling Pass
**Maps to**: PRD §3.2, TRD §7, ROADMAP Phase 3 | **Dependencies**: Follows Dhruvin's DV-08 (Real INT8 TFLite model integration).

### Context & Implementation Scope
1. **Execute Profiling Suite**: Run `scripts/profiling/profile_hardware_footprint.py` and `scripts/profiling/benchmark_suite.py` via ADB against physical test devices (e.g. Snapdragon / MediaTek / Pixel / Samsung) or documented emulator.
2. **Metrics to Measure & Verify**:
   - Sustained CPU consumption ($\le 12\%$ of 1 core target).
   - Battery drain rate ($\le 4.5\%$ per hour target).
   - TFLite INT8 inference latency ($\le 8\text{ ms}$ on CPU, $\le 3\text{ ms}$ on NNAPI/GPU).
   - Total End-to-End Latency (IMU sample capture ➔ Fusion output $\le 20\text{ ms}$).
3. **Compile `docs/PERFORMANCE_REPORT.md`**: Create report with raw benchmarks, device specs, and side-by-side Target vs. Measured comparisons.

### Prompt to Run
```text
Run scripts/profiling/profile_hardware_footprint.py and scripts/profiling/benchmark_suite.py against a connected device.

1. Measure CPU, RAM, battery drain/hr, TFLite inference latency, and end-to-end pipeline latency.
2. Generate docs/PERFORMANCE_REPORT.md with measured vs PRD §3.2 target numbers.
3. Provide inference timing metrics to Dhruvin for DV-12.
```

### Verification & Testing Plan
- **Verification Command**:
  ```powershell
  python scripts/profiling/profile_hardware_footprint.py --device-serial auto --duration 600 --output docs/PERFORMANCE_REPORT.md
  python scripts/profiling/benchmark_suite.py --iterations 1000
  ```
- **Pass Criteria**:
  - `docs/PERFORMANCE_REPORT.md` generated with zero synthetic/unmeasured data.
  - All measured KPIs within acceptable margin of PRD §3.2 targets.

---

## MN-07 — Complete ROS2 Node GNSS-Blackout & AI-Odometer Bridge
**Maps to**: TRD §6, PRD Autonomous AGV Persona | **Dependencies**: Follows MN-00 & core pipeline.

### Context & Implementation Scope
1. **Custom Message Definition**: Create `ros2_node/msg/AiOdometer.msg`:
   ```text
   std_msgs/Header header
   float32 vx
   float32 variance
   float32 stopped_prob
   ```
2. **AI Odometer Subscriber**: Create `ros2_node/src/bridge/ai_odometer_bridge.cpp` subscribing to `/navicore/ai_odometer`, updating `eskf_->UpdateAiOdometer()` and `ApplyZupt()`.
3. **Fusion Status Topic**: Publish `std_msgs/String` on `/navicore/status` (`OPEN_SKY`, `DEAD_RECKONING`, `ZUPT_LOCKED`).
4. **Coordinate Frame Fix in `navicore_node.cpp`**: Convert geographic coordinates to local Cartesian ENU (East-North-Up) frame in `nav_msgs/Odometry` (`odom.pose.pose.position.x/y`), and publish raw coordinates on a dedicated `/navicore/fix` (`sensor_msgs/NavSatFix`) topic.
5. **Build Configuration**: Update `ros2_node/CMakeLists.txt` and `package.xml`.

### Prompt to Run
```text
Open ros2_node/src/node/navicore_node.cpp, create ros2_node/msg/AiOdometer.msg and
ros2_node/src/bridge/ai_odometer_bridge.cpp.

1. Add /navicore/ai_odometer subscriber and feed into ESKF pipeline.
2. Publish status string on /navicore/status.
3. Fix nav_msgs/Odometry to use local ENU Cartesian coordinates and publish sensor_msgs/NavSatFix for geographic coords.
4. Update CMakeLists.txt & package.xml.
```

### Verification & Testing Plan
- **Verification Script**:
  ```powershell
  # 1. Run ROS2 node synthetic test harness
  python scripts/verification/test_end_to_end.py --target ros2 --inject-blackout 45
  ```
- **Pass Criteria**:
  - Node transitions from `OPEN_SKY` ➔ `DEAD_RECKONING` upon GNSS topic stoppage while odometry remains continuous via `AiOdometer`.
  - Odometry frame conforms strictly to ROS REP-105 standard.

---

## MN-08 — Audit & Integration-Test Web Visualizer and Realtime Sensor Server
**Maps to**: Demo Tooling, Judging Defense | **Dependencies**: Follows MN-00 & MN-02.

### Context & Implementation Scope
1. **Server Verification**: In `scripts/demo/realtime_sensor_server.py`, ensure WebSocket / HTTP streaming handles high-frequency IMU (100 Hz), GNSS (1 Hz), and computed `FusionState` (10 Hz) streams.
2. **Visualizer Integration**: In `web_visualizer/src/js/{map-renderer.js, telemetry-panel.js, socket-client.js}`, ensure client parses latest `FusionState` JSON schema without errors.
3. **Log Replay Mode**: Support replaying recorded field CSVs (`data/field_logs/live_test_run.csv`).
4. **Judge Demo Script**: Add a launch instruction section to `README.md`.

### Prompt to Run
```text
Audit web_visualizer/ and scripts/demo/{realtime_sensor_server.py, launch_visualizer.py}.

1. Test launch_visualizer.py end-to-end with live socket streaming and recorded CSV log playback.
2. Resolve any schema mismatches between Kotlin/Native output and JavaScript telemetry panel.
3. Document 1-command demo launch workflow in README.md.
```

### Verification & Testing Plan
- **Verification Command**:
  ```powershell
  # Launch visualizer and feed simulated 60s blackout session
  python scripts/demo/launch_visualizer.py --replay data/field_logs/live_test_run.csv --headless-test
  ```
- **Pass Criteria**:
  - Visualizer renders trajectory and switches mode indicator without uncaught JavaScript console errors.
  - WebSocket latency $< 50\text{ ms}$.

---

# PHASE 4: Fleet SDK & Master Verification (Weeks 9–10)

## MN-09 — Audit and Finish Python Fleet SDK
**Maps to**: PRD §6, API.MD §6 | **Dependencies**: Follows MN-00.

### Context & Implementation Scope
1. **API Alignment**: Verify `sdk_python/navicore_sdk/{fusion.py, state.py, __init__.py}` matches `API.MD` (`feed_gnss()`, `feed_imu()`, `get_state()`).
2. **Explicit Architecture Documentation**: Explicitly document in `fusion.py` docstrings that this module is a pure-Python reference implementation for fleet telemetry analysis and partner evaluation.
3. **Automated PyTest Suite**: Create `sdk_python/tests/test_fusion.py` validating state transitions (`OPEN_SKY` ➔ `DEAD_RECKONING` ➔ `ZUPT_LOCKED`).

### Prompt to Run
```text
Open sdk_python/navicore_sdk/ and create sdk_python/tests/test_fusion.py.

1. Ensure public API matches API.MD.
2. Document pure-Python reference status explicitly in module docstrings.
3. Write comprehensive pytest test suite covering all fusion modes and drift bounds.
```

### Verification & Testing Plan
- **Verification Command**:
  ```powershell
  pytest sdk_python/tests/ -v --cov=navicore_sdk
  ```
- **Pass Criteria**:
  - 100% test pass rate with $\ge 90\%$ code coverage on Python SDK.

---

## MN-10 — Master QA Pass, Blackout Stress Testing & Final Submission Dossier
**Maps to**: ROADMAP Phase 4, `FINALE_SUBMISSION_DOSSIER.md`, `JUDGE_QA_DEFENSE_GUIDE.md` | **Dependencies**: Culmination of all chunks (Tracks A & B).

### Context & Implementation Scope
1. **Run All Verification Harnesses**:
   - `scripts/verification/test_end_to_end.py`
   - `scripts/verification/verify_vehicle_kinematics.py`
   - `scripts/verification/strict_verification_harness.py`
   - `scripts/verification/verify_application.py`
2. **Blackout Drift Stress Testing**: Run `scripts/simulation/simulate_drive.py` across 30s, 60s, 120s, and 300s blackout scenarios at 20–80 km/h. Measure and log empirical drift percentage against distance traveled.
3. **Compile `docs/RESULTS_SUMMARY.md`**: Combine ML evaluation metrics (from Dhruvin's DV-12), hardware profiling data (from MN-06), and synthetic blackout drift results into a unified summary.
4. **Fact-Check Pass**: Perform a strict line-by-line review of `docs/FINALE_SUBMISSION_DOSSIER.md` and `docs/JUDGE_QA_DEFENSE_GUIDE.md`. Ensure every claimed number is backed by `RESULTS_SUMMARY.md` (flag any unbacked claims as future work).

### Prompt to Run
```text
Execute MN-10: Master QA Pass and Dossier Compilation.

1. Run all 4 verification harnesses in scripts/verification/ and resolve any regressions.
2. Execute simulate_drive.py for 30s/60s/120s/300s blackouts and record exact drift percentages.
3. Compile docs/RESULTS_SUMMARY.md merging ML results, performance numbers, and drift metrics.
4. Audit docs/FINALE_SUBMISSION_DOSSIER.md and JUDGE_QA_DEFENSE_GUIDE.md for 100% factual accuracy.
```

### Verification & Testing Plan
- **Verification Commands**:
  ```powershell
  # 1. Run Complete End-to-End Verification Harness
  python scripts/verification/strict_verification_harness.py --all

  # 2. Run Comprehensive Blackout Stress Test Matrix
  python scripts/simulation/simulate_drive.py --stress-matrix --output data/stress_results.json

  # 3. Verify Application Integrity & Docs
  python scripts/verification/verify_application.py --validate-dossier
  ```
- **Pass Criteria**:
  - All verification scripts exit with status `0`.
  - `docs/RESULTS_SUMMARY.md` contains 100% empirical, measured figures.
  - Zero unsupported claims in final judging documentation.

---

## 3. Quick Reference Command Cheat-Sheet for Manthan

```powershell
# Phase 0 Check
./gradlew assembleDebug --dry-run
python -m py_compile scripts/verification/*.py

# Phase 1 Check
./gradlew testDebugUnitTest --tests "org.enigma.navicore.imu.*"

# Phase 2 Check
cd core_cpp; ctest --output-on-failure; cd ..
./gradlew testDebugUnitTest --tests "org.enigma.navicore.fusion.*"
./gradlew testDebugUnitTest --tests "org.enigma.navicore.mapmatch.*"

# Phase 3 Check
./gradlew testDebugUnitTest --tests "org.enigma.navicore.ui.*"
python scripts/profiling/profile_hardware_footprint.py
python scripts/demo/launch_visualizer.py --replay data/field_logs/live_test_run.csv

# Phase 4 Master Check
pytest sdk_python/tests/ -v
python scripts/verification/strict_verification_harness.py --all
```
