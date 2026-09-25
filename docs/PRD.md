# Product Requirements Document (PRD) — Extra-Detailed Edition

## Project Name: NaviCore AI
**Subtitle**: Edge-Native Virtual Odometer & Zero-Drift GNSS Fusion Engine
**Smart India Hackathon 2026** | **Problem Statement ID**: 260168
**Theme**: Smart Vehicles | **Category**: Software
**Team**: @enigm@ (Team ID: 132834)
**Document Status**: Idea-stage PRD — design targets and detailed build plan, not field-validated results. Every number in this document is either a **target** (unvalidated), a **cited literature range** (not our own measurement), or a **fact independently verified** (e.g. dataset specs) — each is labeled as such.

---

## 1. Executive Summary & Vision

### 1.1 Executive Summary
In modern urban transit and logistics across India and emerging markets, GNSS signals frequently suffer from degradation or total blackout in tunnels, underpasses, multi-level flyovers, dense tree canopy, and underground parking. Standard navigation apps freeze, rubber-band, or drift by hundreds of metres in these conditions.

Luxury autonomous vehicles solve this with hardware INS + CAN-bus wheel sensors + RTK-GNSS (₹20,000–₹1,00,000+ per vehicle, requiring OBD-II access) — not viable for India's 2-wheelers, autos, mini-trucks, or gig fleets.

**NaviCore AI** is a software-only, edge-native virtual odometer and GNSS fusion engine for standard Android phones, combining:
1. High-frequency 6-DOF IMU sensing
2. An on-device 1D-CNN/TCN neural odometer
3. Automated phone-to-vehicle calibration (LPF + PCA)
4. An Error-State Kalman Filter (ESKF)
5. AI-driven Zero-Velocity Updates (ZUPT)
6. Non-Holonomic Constraints (NHC)
7. Explicit heading-drift correction
8. Offline HMM/OSM map-matching (stretch goal)

**This PRD is written so that every requirement below is traceable to a specific phase and a specific person/role in the Roadmap.** Section 8 restates the phase-by-phase build plan; Sections 4 and 5 tag each requirement with the phase it belongs to.

### 1.2 Vision Statement
To bring practical, software-only dead-reckoning navigation to every vehicle using nothing more than a standard smartphone — reducing navigation blackouts and improving logistics reliability, without overstating what has been proven so far.

---

## 2. Problem Space & Market Opportunity

### 2.1 Problem Breakdown (detailed)

1. **GNSS Signal Blackouts & Multipath Interference**
   - *Mechanism*: line-of-sight obstruction (tunnels, underpasses, basements, high-rises) and multipath reflection off buildings/structures causing a GNSS chipset to report a plausible-looking but wrong fix.
   - *Why it matters for design*: the blackout **detector** (FR-07) must distinguish "no fix" (easy) from "bad fix" (hard — requires HDOP/satellite-count/SNR heuristics, PRD §4.1 SHOULD-HAVE).

2. **Absence of Hardware Wheel Odometry**
   - *Mechanism*: 2-wheelers/autos have no OBD-II port or CAN-bus telemetry exposed to a phone.
   - *Why it matters for design*: forces the entire "ground truth speed" problem onto the AI odometer (FR-03) — there is no cheap fallback sensor, so FR-03's accuracy is the single highest-leverage requirement in this document.

3. **Quadratic Double-Integration Drift of MEMS IMUs**
   - *Mechanism*: $s(t) = \iint (a(t) - b_a)\,dt^2$ — error from an uncorrected bias term grows as $O(t^2)$.
   - *Illustrative bound*: a constant 0.05 m/s² bias contributes ≈22.5 m of bias-driven error alone over 30 s (derivation in ML spec §1) — this is one term among several, not total system drift.
   - *Why it matters for design*: this is the entire reason ESKF bias estimation (FR-07) exists, not an optional add-on.

4. **Severe Environmental and Road Noise**
   - *Mechanism*: potholes, speed breakers, engine idle vibration (single-cylinder 2-wheelers especially), braking jerks, chassis tilt.
   - *Why it matters for design*: drives both the TCN's noise-invariance requirement (FR-03) and the spectral ZUPT engine's need to separate idle harmonics (15–30 Hz) from true translation (0.1–4 Hz) (ML spec §5).

5. **Arbitrary, Time-Varying Phone Mounting**
   - *Mechanism*: handlebar/dashboard mounts at arbitrary 3D angles, shifting under vibration or handling.
   - *Why it matters for design*: FR-02's auto-calibration must both (a) resolve an initial mount angle and (b) detect and recover from mid-ride reorientation without a full navigation restart.

6. **Heading (Yaw) Drift**
   - *Mechanism*: small uncorrected heading bias compounds with distance travelled — lateral error grows roughly as distance × sin(heading error).
   - *Why it matters for design*: elevated to its own functional requirement (FR-04) rather than left as an implicit side effect of map-matching, because it is typically the **dominant** error source in 2D vehicle dead reckoning, not a secondary one.

### 2.2 Target Personas & Use Cases

| Persona | Environment & Device | Pain Point | NaviCore AI Value Proposition | Primary Phase Serving This Persona |
| :--- | :--- | :--- | :--- | :--- |
| **Gig Delivery Driver (2-Wheeler)** *(Ramesh, Zomato/Swiggy)* | Budget Android phone (₹8,000–₹14,000), handlebar mount, heavy road vibration | Map freezes inside basement malls/underpasses; misses exits; penalized for delayed drop-offs | Continuous routing inside underground parking/basements, zero extra hardware | Phase 1–3 (core MVP) |
| **Cab / Ride-Hailing Driver** *(Suresh, Uber/Ola)* | Mid-range phone, windshield mount, urban canyons | GPS bounces across parallel lanes/flyover levels, confusing pickup location | HMM map-matching smooths tracking through multi-level road structures | Phase 3 (stretch) |
| **Long-Haul Logistics Fleet** *(Delhivery/Blue Dart)* | Commercial trucks, tunnels, mountain ghats | Navigation freezes; lost telemetry in long tunnels | Extended DR coverage, with stated accuracy limits beyond validated range | Post-hackathon |
| **Autonomous / Defense AGVs** *(Robotics, future)* | Jetson/ROS2 stack, higher-grade IMU | High cost of military-grade INS; needs GNSS-denial fallback | Potential ROS2-native integration | Post-hackathon (explicitly not SIH scope) |

---

## 3. Product Goals & Success Metrics (KPIs)

### 3.1 Primary Objective
Deliver continuous, real-time vehicle positioning at 10 Hz during GNSS outages, targeting single-digit-percent-of-distance drift for blackouts up to ~60–120 s, without external hardware. Numbers beyond this validated window are explicitly not claimed (see §3.2 footnote).

### 3.2 KPIs — Design Targets, Tagged by Validating Phase

| Metric | Target | Basis | Validated In Phase |
| :--- | :--- | :--- | :--- |
| Dead Reckoning Drift Rate | Single-digit % of distance, blackout ≤ 60 s | RoNIN/Brossard/WhONet literature ranges (not our measurement) | Phase 1 (offline sim), Phase 4 (buffer, optional live test) |
| Blackout Switch Latency | < 50 ms software target; < 10 ms stretch | Engineering estimate | Phase 3 (UI/demo integration) |
| Idle Drift (ZUPT) | Near-zero while genuinely stationary | Standard ZUPT behaviour at high classifier precision | Phase 2 (fusion core) |
| CPU / Battery Footprint | < 8% CPU / < 4%/hr target; < 4% CPU stretch with NPU | Needs on-device profiling | Phase 3–4 |
| Model Inference Latency | < 10 ms/window CPU fallback; < 3 ms stretch with NNAPI | Needs per-chipset benchmarking | Phase 2 (integration), Phase 3 (on-device profiling) |
| Auto-Calibration Time | < 5 s of forward motion | Engineering estimate | Phase 2 |
| UI Frame Rate & Jitter | Smooth 10 Hz, no snap-jumps | Standard interpolation | Phase 3 |

**Validated blackout duration range for any Phase 1–4 claim: up to ~60–120 seconds.** Anything longer is a stated stretch goal with expected degradation, never a guaranteed spec — the Fusion API's `withinValidatedRange` flag (see API.md) exists specifically to enforce this at runtime.

---

## 4. Feature Requirements & Capabilities

### 4.1 Feature Matrix & Priority (MoSCoW), Tagged by Phase

```
+-------------------------------------------------------------------------------+
|                            NAVICORE AI FEATURE MATRIX                         |
+-------------------------------------------------------------------------------+
| [MUST HAVE — SIH Prototype Scope]                                            |
|  - 6-DOF IMU Ingestion (Phase 3)                                             |
|  - Automated Dynamic Mount Calibration — LPF + PCA (Phase 2)                 |
|  - 1D-CNN/TCN Virtual Odometer, INT8 (Phase 1)                               |
|  - Heading/Yaw Drift Correction (Phase 2)                                     |
|  - Non-Holonomic Constraints — NHC (Phase 2)                                  |
|  - AI-Triggered ZUPT (Phase 1 model + Phase 2 integration)                    |
|  - ESKF with Online Bias Estimation (Phase 2)                                 |
|  - GNSS Blackout Detector & State-Machine Switch (Phase 3)                    |
|  - Smooth 10 Hz Navigation UI (Phase 3)                                       |
|                                                                               |
| [SHOULD HAVE — Stretch within hackathon window]                              |
|  - Offline HMM + Viterbi Map-Matching on OSM (Phase 3, if on schedule)        |
|  - Road-Roughness Adaptive Measurement Covariance (Phase 2, if time allows)   |
|  - Native C++/Eigen/JNI Engine (Phase 2, stretch — Kotlin fallback required)  |
|  - GNSS Signal Quality Indexer (HDOP/SNR) (Phase 3, if time allows)           |
|                                                                               |
| [COULD HAVE — Explicit post-hackathon roadmap]                               |
|  - ROS2 C++ Node                                                              |
|  - Trip Telemetry / Pothole Diagnostic Export                                |
|  - Barometer Multi-Sensor Fusion                                             |
|  - Multi-city live field trials                                              |
|                                                                               |
| [WON'T HAVE (Phase 1)]                                                       |
|  - OBD-II Dongle Hardware Dependencies                                       |
|  - Cloud-Dependent Inference                                                 |
+-------------------------------------------------------------------------------+
```

### 4.2 Detailed Functional Requirements (with acceptance criteria and owning phase)

#### FR-01: High-Frequency IMU Ingestion Pipeline — *Phase 3, Android Developer*
- Sample accelerometer (m/s²) and gyroscope (rad/s) at the highest rate the device reliably sustains (target 100 Hz; measure actual per device).
- Rolling circular buffer, 1.0 s window, 50% overlap.
- NDK Sensor APIs used where available to cut Java/Kotlin overhead.
- **Acceptance criteria**: buffer never drops more than 1% of samples under sustained 10-minute logging on the reference test device; measured (not assumed) sample-rate consistency reported.

#### FR-02: Zero-Touch Automated Coordinate Calibration — *Phase 2, Embedded/Systems Engineer*
- Resolve $\mathbf{R}_b^v$ via LPF gravity extraction ($f_c=0.5$ Hz) + PCA on accel/braking variance.
- Detect dislodgement/reorientation; trigger background recalibration without disrupting navigation.
- **Acceptance criteria**: calibration converges within a measured time bound on at least 3 recorded IO-VNBD-style motion segments before being trusted for the demo; recalibration does not reset the ESKF's learned bias state.

#### FR-03: AI Virtual Odometer (1D-CNN/TCN) — *Phase 1, AI/ML Engineer*
- Predict $V_x(t)$ from windowed 6-DOF IMU data; separate transient shocks from true translation.
- INT8-quantized for on-device inference.
- **Acceptance criteria**: reports an actual measured velocity RMSE on held-out IO-VNBD data (not a target number); reports the accuracy delta between Float32 and INT8.

#### FR-04: Heading (Yaw) Drift Correction — *Phase 2, Embedded/Systems Engineer* (elevated MUST-HAVE)
- Continuous yaw gyro-bias tracking as an explicit ESKF state component.
- Magnetometer heading fusion where reliable (flagged unreliable near ferrous mounts).
- Heading reset via high-confidence map-match events (Phase 3, if map-matching ships).
- **Acceptance criteria**: heading uncertainty is a first-class, monotonically-tracked quantity surfaced in `FusionState.headingUncertaintyRad` (see API.md) — not silently ignored.

#### FR-05: Non-Holonomic Constraints (NHC) & Kinematics — *Phase 2, Embedded/Systems Engineer*
- Inject $V_y \approx 0 \pm \sigma_y$, $V_z \approx 0 \pm \sigma_z$ pseudo-measurements into the ESKF.
- **Acceptance criteria**: unit-tested against synthetic straight-line and turning trajectories before integration with real IMU data.

#### FR-06: AI-Triggered Zero-Velocity Update (ZUPT) — *Phase 1 (classifier) + Phase 2 (integration)*
- Spectral + learned classification distinguishing true stop from idle vibration.
- **Acceptance criteria**: precision/recall reported on held-out data; false-positive rate specifically called out, since a false lock is a worse UX failure than residual drift (SECURITY.md §7).

#### FR-07: GNSS Blackout Detector & Error-State Kalman Filter (ESKF) — *Phase 2–3, Embedded/Systems Engineer + Android Developer*
- Open-sky: fuse GNSS velocity/position with IMU, estimate accel/gyro biases.
- Blackout: switch to AI-odometer + NHC + heading correction, subtracting learned biases.
- **Acceptance criteria**: switch latency measured on the actual demo device, not assumed from the target table.

#### FR-08: Offline HMM Map-Matching — *Phase 3, GIS Engineer (stretch)*
- Viterbi decoding against offline OSM road graph; emission from distance-to-segment, transition from topological connectivity.
- **Acceptance criteria**: only attempted if Phases 1–2 are on schedule per the Roadmap's buffer logic (Roadmap §2 Phase 4).

---

## 5. Non-Functional Requirements (NFRs)

### 5.1 Performance & Latency — *validated in Phase 3–4*
- End-to-end latency (IMU sample → UI update): target ≤ 50 ms, stretch < 15 ms.
- Cold start / calibration readiness: target ≤ 5 s.
- Memory footprint: target ≤ 150 MB including offline map cache.

### 5.2 Efficiency & Thermals — *validated in Phase 4*
- Battery drain target ≤ 4%/hour on mid-range hardware.
- Thermal behaviour profiled on ≥ 2 real budget devices before any temperature-resilience claim is made.

### 5.3 Reliability & Edge Autonomy — *validated across all phases*
- No cloud dependency for inference, ESKF, or map-matching.
- Graceful fallback to CPU/Eigen kernels (or pure Kotlin, per CODESTYLE.md) if NPU acceleration is unavailable.

### 5.4 Safety & Compliance — *governs Phase 3 UI design and Phase 4 field-test logistics*
- Passive navigation aid only; UI designed for glance-and-go use.
- Any live drive-testing (Phase 4, optional) uses a passenger operating the device, never the driver, and follows a documented safety checklist before it is attempted.

---

## 6. Competitive Analysis & Value Proposition

```
+---------------------------------------------------------------------------------------------+
|                                    COMPETITIVE COMPARISON MATRIX                            |
+--------------------------+---------------------+---------------------+----------------------+
| Feature                  | Standard Google Maps| Hardware INS        | NaviCore AI            |
|                          | / MapmyIndia        | (OBD-II / CAN-bus)  | (Target, unvalidated)  |
+--------------------------+---------------------+---------------------+----------------------+
| Tunnel & Basement Nav    | Poor (freezes/jumps)| Yes                 | Target: bounded drift  |
|                          |                     |                     | for short blackouts    |
| Hardware Cost            | ₹0                  | ₹20,000–₹1,00,000   | ₹0 (software only)     |
| 2-Wheeler/Auto Support   | Yes (degrades)      | No                  | Yes (design goal)      |
| Pothole/Shock Filter     | No                  | No                  | Target (1D-CNN)        |
| Traffic Idling ZUPT      | No                  | No                  | Target (near-zero)     |
| Dynamic Mounting Angle   | N/A                 | Rigid calibration   | Target (Auto PCA/LPF)  |
| Offline Edge Execution   | Limited caching     | Yes                 | Target (full edge)     |
| ROS2 Robotics Ready      | No                  | Yes                 | Post-hackathon roadmap |
+--------------------------+---------------------+---------------------+----------------------+
```

---

## 7. User Experience & UI/UX Workflows — *Phase 3 deliverable*

```
+-------------------------------------------------------------------------------+
|                             NAVICORE AI UI MODES (design targets)             |
+-------------------------------------------------------------------------------+
| 1. OPEN SKY MODE (Green Beacon)                                               |
|    - GNSS fix healthy; AI odometer idle/standby                              |
|    - ESKF continuously learning IMU biases                                    |
|                                                                               |
| 2. AI DEAD RECKONING MODE (Cyan Pulsing Halo)                                 |
|    - Trigger: tunnel/underground mall/flyover underpass                      |
|    - Shows elapsed blackout time and a visible confidence indicator          |
|    - Once blackoutDurationMs exceeds the validated window, UI visibly        |
|      downgrades confidence (per API.md's withinValidatedRange field)         |
|                                                                               |
| 3. TRAFFIC IDLE MODE (Gold Anchor)                                            |
|    - Trigger: ZUPT classifier confidence above threshold                     |
|    - Shows a confidence/uncertainty cue, not just a static "locked" label    |
|                                                                               |
| 4. RE-CALIBRATION NOTIFICATION (Subtle Toast)                                 |
|    - Trigger: phone dislodged/tilted                                        |
|    - Shows real elapsed recalibration time, not a fixed marketing number     |
+-------------------------------------------------------------------------------+
```

---

## 8. SIH 2026 Hackathon Scope & Deliverables — Phase-by-Phase Build Plan

**Current Status**: idea-stage submission. No field-tested prototype exists yet.

### Phase 1 (Weeks 1–2) — AI Engine & Dataset — *Owner: AI/ML Engineer*
1. Ingest IO-VNBD, verify actual sampling rate (10 Hz — see ML spec §2.1), document deviation from earlier 100 Hz assumption.
2. Decide and document the resampling strategy bridging 10 Hz training data to on-device deployment rate.
3. Build augmentation pipeline (pothole shocks, idle harmonics, orientation jitter, Gaussian noise).
4. Implement the 1D-TCN + SE-block architecture in PyTorch.
5. Implement the multi-task loss (NLL + ZUPT BCE).
6. Train, evaluate on held-out split, report actual RMSE and ZUPT precision/recall.
7. Quantize to INT8, report accuracy delta vs. Float32.
8. **Exit criteria**: a measured RMSE number and a measured ZUPT precision/recall number, both logged with the exact run config (CODESTYLE.md §4).

### Phase 2 (Weeks 3–5) — Fusion Core & Calibration — *Owner: Embedded/Systems Engineer*
1. Implement the 15-state ESKF (Kotlin-first; C++/Eigen/JNI as a parallel stretch track, not a blocker).
2. Implement LPF gravity extraction + PCA heading auto-calibration.
3. Implement yaw gyro-bias tracking as an explicit ESKF state, plus optional magnetometer fusion.
4. Implement NHC pseudo-measurement injection.
5. Integrate the Phase 1 odometer output and ZUPT signal into the fusion loop.
6. Unit-test fusion transitions against synthetic trajectories before wiring to real sensor data.
7. **Exit criteria**: fusion core runs end-to-end on a recorded IMU log (not live sensors yet) and produces a plausible trajectory with logged heading uncertainty growth during a simulated blackout.

### Phase 3 (Weeks 6–8) — Android UI & Demo Readiness — *Owner: Android Developer (+ GIS Engineer for stretch)*
1. Build the Kotlin app shell with Mapbox/Google Maps SDK rendering.
2. Wire live sensor ingestion (FR-01) to the Phase 2 fusion core.
3. Implement the 10 Hz interpolation and state-beacon UI (§7).
4. Implement the GNSS-blackout **simulation toggle**, clearly labeled as simulated in the UI copy itself.
5. Implement the `withinValidatedRange`-driven confidence downgrade in the UI.
6. If on schedule: implement offline HMM/OSM map-matching (FR-08).
7. **Exit criteria**: a live, on-device demo runs start-to-finish with real sensor data and a simulated blackout, showing real telemetry numbers on screen (not hardcoded targets).

### Phase 4 (Weeks 9–10) — Buffer, Contingency & Finale Prep — *Owner: whole team, QA/Documentation lead*
1. Triage and fix whatever is broken in the core demo path — no new features start here.
2. If time remains: one supervised, passenger-operated short live-blackout test, safety-reviewed per §5.4, only claimed publicly if it actually happens.
3. Write documentation and record the demo video reflecting exactly what was built.
4. Explicitly exclude ROS2, multi-city trials, and fleet SDK claims from the finale deck unless already delivered.
5. **Exit criteria**: finale deck contains only measured numbers and clearly-labeled future work.

### Explicitly Out of Scope for SIH (Post-Hackathon)
- ROS2/AGV robotics integration.
- Multi-tunnel, multi-city real-world field validation.
- Commercial fleet SDK packaging.