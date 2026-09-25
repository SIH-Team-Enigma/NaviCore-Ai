# Product Requirements Document (PRD)

## Project Name: NaviCore AI
**Subtitle**: Edge-Native Virtual Odometer & Zero-Drift GNSS Fusion Engine
**Smart India Hackathon 2026** | **Problem Statement ID**: 260168
**Theme**: Smart Vehicles | **Category**: Software
**Team**: @enigm@ (Team ID: 132834)
**Document Status**: Idea-stage PRD — design targets, not field-validated results.

---

## 1. Executive Summary & Vision

### 1.1 Executive Summary
In modern urban transit and logistics across India and emerging markets, Global Navigation Satellite System (GNSS) signals frequently suffer from degradation or total blackout. In urban canyons, underpasses, multi-level flyovers, tunnels, dense tree canopies, and subterranean parking structures, standard navigation apps freeze, rubber-band, or drift by hundreds of metres.

Luxury autonomous vehicles solve this with hardware-grade Inertial Navigation Systems (INS) tied to CAN-bus wheel speed sensors and RTK-GNSS — ₹20,000 to ₹1,00,000+ per vehicle, requiring physical OBD-II access. That is not viable for India's 2-wheelers, auto-rickshaws, mini-trucks, and gig-economy fleets (Zomato, Swiggy, Zepto, Blinkit, Uber, Ola, Delhivery).

**NaviCore AI** proposes a 100% software, edge-native virtual odometer and GNSS fusion engine running on standard Android smartphones. It combines high-frequency 6-DOF IMU sensing, an on-device 1D-CNN/TCN neural odometer, automated phone-to-vehicle calibration (LPF + PCA), an Error-State Kalman Filter (ESKF), AI-driven Zero-Velocity Updates (ZUPT), Non-Holonomic Constraints (NHC), heading-drift correction, and an offline HMM/OpenStreetMap map-matching engine.

This document defines the target product behaviour. **The performance figures below are engineering targets derived from the technical approach and published literature (see the ML Architecture spec), not yet measured on a built system.** Section 8 states plainly what exists today versus what is planned.

### 1.2 Vision Statement
To bring practical, software-only dead-reckoning navigation to every vehicle using nothing more than a standard smartphone — reducing navigation blackouts and improving logistics reliability, without overstating what has been proven so far.

---

## 2. Problem Space & Market Opportunity

### 2.1 Problem Breakdown
1. **GNSS Signal Blackouts & Multipath Interference** — tunnels, underpasses, basements, and high-rise corridors obstruct line-of-sight reception; multipath reflections cause large position jumps.
2. **Absence of Hardware Wheel Odometry** — a large share of Indian delivery fleets run on 2-wheelers and entry-level 3-wheelers with no accessible OBD-II port or CAN-bus telemetry; retrofitting sensors is not economically viable for gig fleets.
3. **Quadratic Double-Integration Drift of MEMS IMUs** — direct double integration of cheap accelerometer signals produces positional error that grows with $O(t^2)$; a 0.05 m/s² uncorrected bias alone can accumulate to ~22.5 m of error in 30 seconds from the bias term alone (see ML spec for derivation).
4. **Severe Environmental and Road Noise** — potholes, speed breakers, engine idle vibration (especially single-cylinder 2-wheelers), braking jerks, and chassis tilt corrupt naive kinematics and classical filters.
5. **Arbitrary, Time-Varying Phone Mounting** — handlebar/dashboard mounts sit at arbitrary 3D angles and can shift mid-ride.
6. **Heading (Yaw) Drift** — in 2D dead reckoning, small uncorrected heading error compounds with distance travelled and is typically a *larger* contributor to final position error than forward-speed error. This is a first-class design constraint, not an afterthought handled only by map-matching cleanup.

### 2.2 Target Personas & Use Cases

| Persona | Environment & Device | Pain Point | NaviCore AI Value Proposition |
| :--- | :--- | :--- | :--- |
| **Gig Delivery Driver (2-Wheeler)** *(Ramesh, Zomato/Swiggy)* | Budget Android phone (₹8,000–₹14,000), handlebar mount, heavy road vibration. | Map freezes inside basement malls/underpasses; misses exits; penalized for delayed drop-offs. | Continuous routing inside underground parking/basements with zero extra hardware. |
| **Cab / Ride-Hailing Driver** *(Suresh, Uber/Ola)* | Mid-range phone, windshield mount, urban canyons. | GPS bounces across parallel service lanes and flyover levels, confusing pickup location. | HMM map-matching with smoother tracking through multi-level road structures. |
| **Long-Haul Logistics Fleet** *(Delhivery / Blue Dart)* | Commercial freight trucks in tunnels, mountain ghats, remote corridors. | Navigation freezes; lost telemetry in long tunnels. | Extended dead-reckoning coverage across longer blackout stretches, with clearly stated accuracy limits beyond the validated range. |
| **Autonomous / Defense AGVs** *(Robotics & Industrial, future phase)* | Linux Edge IPC / Jetson / ROS2 stack, higher-grade IMU. | High cost of military-grade INS; needs fallback under jamming/spoofing. | Potential ROS2-native integration — **explicitly a post-hackathon extension, not part of the SIH prototype scope.** |

---

## 3. Product Goals & Success Metrics (KPIs)

### 3.1 Primary Objective
Deliver continuous, real-time vehicle positioning at 10 Hz update frequency during GNSS outages, targeting single-digit-percent-of-distance drift, without external hardware. Exact achievable drift depends on trip length, road type, and mount stability, and will be reported with confidence ranges once field data exists — not as single fixed numbers.

### 3.2 Key Performance Indicators (KPIs) — Design Targets

| Metric | Target Specification | Basis / Confidence | Industry Baseline (Phone GPS) |
| :--- | :--- | :--- | :--- |
| **Dead Reckoning Drift Rate** | Target: single-digit % of distance over short blackouts (≤60 s); expected to degrade beyond that. | Informed by RoNIN / Brossard et al. / WhONet published ranges — **not yet measured on our system.** | Drifts 100+ m within ~15 s of blackout |
| **Blackout Switch Latency** | Target < 50 ms (software state-machine switch; sub-10 ms is a stretch goal pending profiling) | Engineering estimate | 2,000–5,000 ms ("Searching for GPS" UI freeze) |
| **Idle Drift (ZUPT)** | Target: near-zero drift while genuinely stationary | Standard ZUPT behaviour reported in INS literature when classifier precision is high | Continuous random-walk drift |
| **CPU / Battery Footprint** | Target < 8% CPU, < 4% battery drain/hour on mid-range hardware (aspirational stretch: <4% CPU with NPU offload) | Needs on-device profiling before committing to a hard number | Variable, often worse if unoptimized ML runs on CPU |
| **Model Inference Latency** | Target < 10 ms/window on CPU fallback; < 3 ms achievable only with confirmed NNAPI/NPU delegate support on the target device | Needs benchmarking across chipsets | > 25 ms (unquantized) |
| **Auto-Calibration Time** | Target < 5 s of forward motion | Engineering estimate, to be validated | Manual calibration typically required |
| **UI Frame Rate & Jitter** | Target: smooth 10 Hz interpolation, no visible snap-jumps | Standard interpolation technique | 1 Hz stuttering GPS updates |

**Validated blackout duration range for Phase 1 claims: up to ~60–120 seconds.** Longer blackouts (multi-minute tunnels, multi-km stretches) are a stated stretch goal with expected accuracy degradation, not a guaranteed spec.

---

## 4. Feature Requirements & Capabilities

### 4.1 Feature Matrix & Priority (MoSCoW)

```
+-------------------------------------------------------------------------------+
|                            NAVICORE AI FEATURE MATRIX                         |
+-------------------------------------------------------------------------------+
| [MUST HAVE — SIH Prototype Scope]                                            |
|  - 6-DOF IMU Data Ingestion Engine (SensorManager, best-effort up to 100 Hz) |
|  - Automated Dynamic Mount Calibration (LPF Gravity + PCA Heading)            |
|  - 1D-CNN / TCN Edge-Native Virtual Odometer (INT8 TFLite)                   |
|  - Heading/Yaw Drift Correction (gyro-bias tracking + magnetometer fusion)    |
|  - Non-Holonomic Constraints (NHC: Vy=0, Vz=0) Kinematic Projection          |
|  - AI-Triggered Zero-Velocity Update (ZUPT) Engine for Traffic Idling        |
|  - Error-State Kalman Filter (ESKF) with Online Bias Estimation             |
|  - GNSS Blackout Detector & State-Machine Switch                            |
|  - Smooth 10 Hz Interpolated Kotlin Navigation UI                            |
|                                                                               |
| [SHOULD HAVE — Stretch within hackathon window]                              |
|  - Offline HMM (Hidden Markov Model) + Viterbi Map-Matching on OSM            |
|  - Road Roughness / Vibration Adaptive Measurement Covariance Scaling        |
|  - Native C++ Eigen Engine bridged via JNI                                   |
|  - GNSS Signal Quality Indexer (HDOP / Satellites / SNR monitor)              |
|                                                                               |
| [COULD HAVE — Explicit post-hackathon roadmap, not SIH deliverable]          |
|  - ROS2 C++ Node wrapper for AGV / robotics edge deployment                  |
|  - Trip Telemetry & Pothole / Road Quality Diagnostic Export                 |
|  - Multi-Sensor Fusion with Barometer for Multi-level Flyover Layer Snapping |
|  - Live driver-facing field trials in real tunnels/parking structures        |
|                                                                               |
| [WON'T HAVE (Phase 1)]                                                       |
|  - Proprietary OBD-II Dongle Hardware Dependencies                          |
|  - Cloud-dependent Inference (dead reckoning must be fully offline)         |
+-------------------------------------------------------------------------------+
```

### 4.2 Detailed Functional Requirements

#### FR-01: High-Frequency IMU Ingestion Pipeline
- Sample accelerometer (m/s²) and gyroscope (rad/s) at the highest rate the target device reliably sustains (design target 100 Hz; actual achievable rate varies by chipset and must be measured, not assumed).
- Rolling circular buffer (1.0 s window, 50% overlap).
- Use Android NDK Sensor APIs where available to reduce Java/Kotlin runtime overhead.

#### FR-02: Zero-Touch Automated Coordinate Calibration
- Resolve the rotation matrix $\mathbf{R}_{b}^{v}$ from phone body frame to vehicle frame.
- LPF ($f_c = 0.5$ Hz) extracts the gravity vector for the vertical axis.
- PCA on acceleration variance during accel/braking extracts the longitudinal axis.
- Detect dislodgement/reorientation and trigger background recalibration; target latency to be measured, not assumed sub-second.

#### FR-03: AI Virtual Odometer (1D-CNN / TCN)
- Predict forward longitudinal velocity $V_x(t)$ from windowed 6-DOF IMU data.
- Learn to separate high-frequency transient shocks (potholes) from true translational acceleration.
- INT8 quantized for on-device inference; NNAPI delegate used where the device exposes one, with a CPU/XNNPACK fallback that must meet a separately-stated (looser) latency budget.

#### FR-04: Heading (Yaw) Drift Correction — *new, elevated to a MUST-HAVE*
- Track gyroscope bias continuously during open-sky GNSS availability.
- Fuse magnetometer heading (with hard/soft-iron calibration) as a secondary heading observation where reliable.
- Treat heading error as a primary error budget item, not something corrected only after the fact by map-matching.

#### FR-05: Non-Holonomic Constraints (NHC) & Kinematics
- Inject pseudo-measurements $V_y \approx 0 \pm \sigma_y$, $V_z \approx 0 \pm \sigma_z$ into the ESKF update, standard for wheeled ground vehicles under non-slip conditions.

#### FR-06: AI-Triggered Zero-Velocity Update (ZUPT)
- Spectral + learned classification to detect true zero velocity (traffic lights, jams) versus engine-idle vibration.
- Clamp velocity to 0 and reset the relevant covariance terms when confidence is high; classifier precision/recall must be reported, since false positives silently freeze a moving vehicle.

#### FR-07: Error-State Kalman Filter (ESKF) Engine
- Open-sky: fuse GNSS velocity/position with IMU to estimate accelerometer and gyroscope biases.
- Blackout: switch to AI-odometer speed + NHC + heading-correction, subtracting learned biases.

#### FR-08: Offline HMM Map-Matching (stretch goal)
- Viterbi decoding against an offline OSM road graph.
- Emission probability from distance to candidate segments; transition probability from topological connectivity.

---

## 5. Non-Functional Requirements (NFRs)

### 5.1 Performance & Latency
- End-to-end latency (IMU sample → UI update): target ≤ 50 ms, with < 15 ms as a stretch goal once profiled.
- Cold start / calibration readiness: target ≤ 5 s.
- Memory footprint: target ≤ 150 MB including offline map cache (to be tightened once measured).

### 5.2 Efficiency & Thermals
- Battery drain: target ≤ 4%/hour on mid-range hardware; NPU-offload path targets lower drain but is not guaranteed on all chipsets.
- Thermal behaviour must be profiled on at least two budget devices before claiming a temperature-resilience spec.

### 5.3 Reliability & Edge Autonomy
- No cloud dependency for inference, ESKF, or map-matching.
- Graceful fallback to CPU/Eigen kernels if NPU acceleration is unavailable.

### 5.4 Safety & Compliance — *new section*
- The product is a passive navigation aid; it must not encourage unsafe phone handling while riding/driving. UI must be designed for glance-and-go use, consistent with applicable local regulations on mobile device use while driving.
- Any live drive-testing must follow standard road-safety practice (a passenger operating the device, not the driver).

---

## 6. Competitive Analysis & Value Proposition

```
+---------------------------------------------------------------------------------------------+
|                                    COMPETITIVE COMPARISON MATRIX                            |
+--------------------------+---------------------+---------------------+----------------------+
| Feature                  | Standard Google Maps| Hardware INS        | NaviCore AI           |
|                          | / MapmyIndia        | (OBD-II / CAN-bus)  | (Target, unvalidated) |
+--------------------------+---------------------+---------------------+----------------------+
| Tunnel & Basement Nav    | Poor (freezes/jumps)| Yes                 | Target: improved,     |
|                          |                     |                     | drift bounded for     |
|                          |                     |                     | short blackouts       |
| Hardware Cost            | ₹0 (Smartphone)     | ₹20,000 – ₹1,00,000 | ₹0 (100% Software)    |
| 2-Wheeler / Auto Support | Yes (degrades)      | No (no OBD-II port) | Yes (design goal)     |
| Pothole & Shock Filter   | No                  | No                  | Target (1D-CNN)       |
| Traffic Idling ZUPT      | No (drifts)         | No                  | Target (near-zero)    |
| Dynamic Mounting Angle   | N/A                 | Rigid calibration   | Target (Auto PCA/LPF) |
| Offline Edge Execution   | Limited caching     | Yes                 | Target (full edge)    |
| ROS2 Robotics Ready      | No                  | Yes                 | Post-hackathon roadmap|
+--------------------------+---------------------+---------------------+----------------------+
```

---

## 7. User Experience & UI/UX Workflows

### 7.1 Driver Experience & Visual States (design targets)

```
+-------------------------------------------------------------------------------+
|                             NAVICORE AI UI MODES                              |
+-------------------------------------------------------------------------------+
| 1. OPEN SKY MODE (Green Beacon)                                               |
|    - GNSS Fix healthy; AI odometer idle/standby to save battery              |
|    - Background: ESKF continuously learning IMU biases                       |
|                                                                               |
| 2. AI DEAD RECKONING MODE (Cyan Pulsing Halo)                                 |
|    - Trigger: Tunnel / underground mall / flyover underpass                  |
|    - Indicator: "NaviCore AI Active (Dead Reckoning)" + elapsed blackout time|
|    - Velocity: from 1D-CNN + NHC + heading correction                        |
|                                                                               |
| 3. TRAFFIC IDLE MODE (Gold Anchor)                                            |
|    - Trigger: ZUPT classifier confidence above threshold                     |
|    - Indicator: "ZUPT Locked" with a visible confidence/uncertainty cue      |
|                                                                               |
| 4. RE-CALIBRATION NOTIFICATION (Subtle Toast)                                 |
|    - Trigger: Phone dislodged or tilted                                     |
|    - Message: "Recalibrating mount orientation…" (duration shown, not fixed) |
+-------------------------------------------------------------------------------+
```

---

## 8. SIH 2026 Hackathon Scope & Deliverables — *rewritten for honesty*

### Current Status (as of this document)
This is an **idea-stage submission**. No field-tested prototype exists yet. The architecture is grounded in published research and a real public dataset (IO-VNBD), but nothing below should be read as already built or validated.

### Phase 1 Target: SIH Prototype (realistic scope for the hackathon window)
- Working Android app demonstrating: IMU ingestion, auto-calibration, AI odometer inference, ESKF fusion, and a simulated GNSS-blackout toggle for live judge demonstration.
- 1D-CNN virtual odometer trained on IO-VNBD, quantized to INT8, with reported (not assumed) velocity RMSE on a held-out test split.
- ESKF with basic heading-drift correction.
- Drift numbers reported from actual simulated-blackout runs on the training/test data, clearly labeled as offline/simulated results, not live tunnel trials.

### Phase 2 Target: SIH Grand Finale (stretch, contingent on Phase 1 landing on time)
- Offline HMM map-matching if time allows.
- A single supervised live drive test (short blackout, passenger-operated device) if logistics and safety review permit — explicitly optional, not promised.
- Side-by-side comparison screen (Google Maps vs NaviCore AI vs a reference track, e.g., a second phone's raw GPS log) — RTK ground truth is not assumed available for a student team and should not be claimed unless actually secured.

### Explicitly Out of Scope for SIH (moved to post-hackathon roadmap)
- ROS2/AGV robotics integration.
- Multi-tunnel, multi-city real-world field validation.
- Commercial fleet SDK packaging.