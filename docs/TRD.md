# Technical Requirements Document (TRD)

## Project Name: NaviCore AI
**Subtitle**: Edge-Native Virtual Odometer & Zero-Drift GNSS Fusion Engine  
**Smart India Hackathon 2026** | **Problem Statement ID**: 260168  
**Theme**: Smart Vehicles | **Category**: Software  
**Team**: @enigm@ (Team ID: 132834)

---

## 1. System Architecture Overview

NaviCore AI is structured as a low-latency, modular edge engine designed to execute across embedded Android mobile devices (via Kotlin + C++ NDK) and robotics edge platforms (via ROS2 C++).

```
+---------------------------------------------------------------------------------------------------------+
|                                      NAVICORE AI ARCHITECTURE PIPELINE                                  |
+---------------------------------------------------------------------------------------------------------+
|                                                                                                         |
|   [6-DOF Phone IMU @ 100 Hz]                  [GNSS Receiver @ 1-10 Hz]                                 |
|   (Acc: ax, ay, az | Gyro: wx, wy, wz)        (Lat, Lon, Alt, GroundSpeed, Heading, HDOP)                |
|             |                                                |                                          |
|             v                                                v                                          |
|   +-------------------+                           +----------------------+                              |
|   | Sensor Ingestion  |                           | GNSS Quality Monitor |                              |
|   | RingBuffer (100)  |                           | (Outage & Multipath) |                              |
|   +-------------------+                           +----------------------+                              |
|             |                                                |                                          |
|             v                                                v                                          |
|   +--------------------------------------------------------------------+                                |
|   | Auto-Calibration Engine (LPF Gravity + PCA Horizontal Heading)     |                                |
|   | Computes Dynamic Phone-to-Vehicle Rotation Matrix: R_b^v           |                                |
|   +--------------------------------------------------------------------+                                |
|             |                                                                                           |
|             +--------------------------------+                                                          |
|             |                                |                                                          |
|             v                                v                                                          |
|   +-------------------+            +----------------------------------+                                 |
|   | Path A: Physics   |            | Path B: AI Virtual Odometer      |                                 |
|   | Non-Holonomic     |            | 1D-CNN / TCN (INT8 TFLite)       |                                 |
|   | Constraints (NHC) |            | Input: 100x6 -> Output: Vx (m/s) |                                 |
|   | Vy = 0, Vz = 0    |            +----------------------------------+                                 |
|   +-------------------+                              |                                                  |
|             |                                        v                                                  |
|             |                      +----------------------------------+                                 |
|             |                      | AI ZUPT Idle-Engine Classifier   |                                 |
|             |                      | (FFT Energy / Harmonics -> V=0)  |                                 |
|             |                      +----------------------------------+                                 |
|             |                                        |                                                  |
|             +-------------------+--------------------+                                                  |
|                                 |                                                                       |
|                                 v                                                                       |
|   +--------------------------------------------------------------------+                                |
|   | 15-State Error-State Kalman Filter (ESKF) Fusion Engine            |                                |
|   | - Open Sky Mode: Fuses GNSS + IMU, Estimates Accelerometer/Gyro    |                                |
|   |   biases (b_a, b_g) online                                         |                                |
|   | - Blackout Mode (<10ms switch): Fuses AI Vx + NHC + Stored Biases  |                                |
|   +--------------------------------------------------------------------+                                |
|                                 |                                                                       |
|                                 v                                                                       |
|   +--------------------------------------------------------------------+                                |
|   | Offline HMM Map-Matching Engine (OpenStreetMap Vector Topology)     |                                |
|   | - Spatial R-Tree Indexing + Viterbi Dynamic Programming            |                                |
|   | - Snaps drifted coordinates to road centerline & heading           |                                |
|   +--------------------------------------------------------------------+                                |
|                                 |                                                                       |
|                                 v                                                                       |
|   +--------------------------------------------------------------------+                                |
|   | Output & Visualization Layer                                       |                                |
|   | - 10 Hz Smooth Kotlin / Mapbox Navigation UI                       |                                |
|   | - ROS2 Node Publisher (/navicore/odom, /navicore/pose)             |                                |
|   +--------------------------------------------------------------------+                                |
+---------------------------------------------------------------------------------------------------------+
```

---

## 2. Mathematical Formulation & Coordinate Frames

### 2.1 Coordinate Frame Definitions
1. **Earth-Centered Earth-Fixed (ECEF) Frame $\{e\}$**: Global reference for GNSS positioning.
2. **Local Navigation Frame $\{n\}$ (ENU / NED)**: Tangent plane to Earth at vehicle origin; East-North-Up (ENU) used for mapping.
3. **Phone Body IMU Frame $\{b\}$**: Physical sensor coordinates of the mobile device ($X_b$: right, $Y_b$: up, $Z_b$: out of screen).
4. **Vehicle Navigation Frame $\{v\}$**: Rigid vehicle frame where $X_v$ points forward (longitudinal), $Y_v$ points right (lateral), and $Z_v$ points down/up (vertical).

### 2.2 Auto-Calibration Mathematical Engine (Phone-to-Vehicle Alignment)

The unknown dynamic mounting transformation is defined by the Direction Cosine Matrix (DCM) $\mathbf{R}_b^v \in \text{SO}(3)$:

$$\mathbf{a}_v(t) = \mathbf{R}_b^v \, \mathbf{a}_b(t), \quad \boldsymbol{\omega}_v(t) = \mathbf{R}_b^v \, \boldsymbol{\omega}_b(t)$$

#### Step 1: Vertical Gravity Alignment via Low-Pass Filter
During quasi-static or steady motion, the low-frequency component of acceleration is pure gravitational acceleration $\mathbf{g}$:

$$\mathbf{g}_b = \text{LPF}(\mathbf{a}_b, f_c = 0.5\text{ Hz}) = \alpha \mathbf{g}_b^{(k-1)} + (1-\alpha) \mathbf{a}_b^{(k)}$$

The vehicle vertical unit vector $\mathbf{u}_z \in \mathbb{R}^3$ in phone frame is:

$$\mathbf{u}_z = \frac{\mathbf{g}_b}{\|\mathbf{g}_b\|}$$

#### Step 2: Longitudinal Heading Alignment via Horizontal PCA
Vehicle acceleration and deceleration occur predominantly along the vehicle's forward longitudinal axis $X_v$.
First, project dynamic acceleration $\mathbf{a}_{\text{dyn}} = \mathbf{a}_b - \mathbf{g}_b$ onto the horizontal plane:

$$\mathbf{a}_{\text{horiz}} = \mathbf{a}_{\text{dyn}} - (\mathbf{a}_{\text{dyn}} \cdot \mathbf{u}_z) \mathbf{u}_z$$

Compute the sample covariance matrix over window $N = 300$ (3 seconds):

$$\mathbf{C} = \frac{1}{N} \sum_{i=1}^N \mathbf{a}_{\text{horiz}}(i) \, \mathbf{a}_{\text{horiz}}(i)^T$$

The principal eigenvector $\mathbf{e}_1$ corresponding to the maximum eigenvalue $\lambda_{\max}$ of $\mathbf{C}$ identifies the forward/backward axis of motion:

$$\mathbf{C} \mathbf{e}_1 = \lambda_{\max} \mathbf{e}_1$$

The sign ambiguity ($\pm \mathbf{e}_1$) is resolved by correlating with positive forward speed changes from GNSS or early AI velocity predictions:

$$\mathbf{u}_x = \operatorname{sgn}\left(\sum (\mathbf{a}_{\text{horiz}} \cdot \mathbf{e}_1) \cdot \Delta v\right) \mathbf{e}_1$$

#### Step 3: Orthonormal Basis Construction (Gram-Schmidt)
The lateral axis $\mathbf{u}_y$ and final orthonormal rotation matrix $\mathbf{R}_b^v$ are constructed as:

$$\mathbf{u}_y = \mathbf{u}_z \times \mathbf{u}_x, \quad \mathbf{u}_x = \mathbf{u}_y \times \mathbf{u}_z$$

$$\mathbf{R}_b^v = \begin{bmatrix} \mathbf{u}_x^T \\ \mathbf{u}_y^T \\ \mathbf{u}_z^T \end{bmatrix}$$

---

## 3. Error-State Kalman Filter (ESKF) Formulation

### 3.1 State Representation
We define the true state $\mathbf{x}$, nominal state $\hat{\mathbf{x}}$, and error state $\delta \mathbf{x}$ using standard quaternion-based kinematics:

$$\mathbf{x} = \hat{\mathbf{x}} \oplus \delta \mathbf{x}$$

The 15-dimensional error state vector $\delta \mathbf{x} \in \mathbb{R}^{15}$ is:

$$\delta \mathbf{x} = \begin{bmatrix} \delta \mathbf{p}^n \\ \delta \mathbf{v}^n \\ \delta \boldsymbol{\theta}^n \\ \delta \mathbf{b}_a \\ \delta \mathbf{b}_g \end{bmatrix} \in \mathbb{R}^{15}$$

Where:
- $\delta \mathbf{p}^n \in \mathbb{R}^3$: Position error in navigation frame (meters).
- $\delta \mathbf{v}^n \in \mathbb{R}^3$: Velocity error in navigation frame (m/s).
- $\delta \boldsymbol{\theta}^n \in \mathbb{R}^3$: Small orientation error angle vector (rad) such that $\mathbf{q} \approx \hat{\mathbf{q}} \otimes [1, \frac{1}{2}\delta \boldsymbol{\theta}^T]^T$.
- $\delta \mathbf{b}_a \in \mathbb{R}^3$: Accelerometer bias error ($\text{m/s}^2$).
- $\delta \mathbf{b}_g \in \mathbb{R}^3$: Gyroscope bias error ($\text{rad/s}$).

### 3.2 Continuous-Time Error Dynamics
The linearized error-state differential equations are:

$$\delta \dot{\mathbf{p}}^n = \delta \mathbf{v}^n$$

$$\delta \dot{\mathbf{v}}^n = -[\mathbf{R}_b^n (\mathbf{a}_m - \hat{\mathbf{b}}_a)]_\times \delta \boldsymbol{\theta}^n - \mathbf{R}_b^n \delta \mathbf{b}_a - \mathbf{R}_b^n \mathbf{w}_a$$

$$\delta \dot{\boldsymbol{\theta}}^n = -[\boldsymbol{\omega}_m - \hat{\mathbf{b}}_g]_\times \delta \boldsymbol{\theta}^n - \delta \mathbf{b}_g - \mathbf{w}_g$$

$$\delta \dot{\mathbf{b}}_a = \mathbf{w}_{ba}, \quad \delta \dot{\mathbf{b}}_g = \mathbf{w}_{bg}$$

Where $[\mathbf{v}]_\times$ represents the skew-symmetric cross-product matrix.

### 3.3 Discrete-Time Propagation & Covariance Update
For sampling period $\Delta t = 0.01\text{ s}$ (100 Hz):

$$\delta \mathbf{x}_{k|k-1} = \mathbf{F}_k \delta \mathbf{x}_{k-1} = \mathbf{0} \quad (\text{nominal state integrates IMU})$$

$$\mathbf{P}_{k|k-1} = \mathbf{F}_k \mathbf{P}_{k-1|k-1} \mathbf{F}_k^T + \mathbf{Q}_k$$

Where the State Transition Matrix $\mathbf{F}_k \approx \mathbf{I}_{15} + \mathbf{F}_c \Delta t$:

$$\mathbf{F}_k = \begin{bmatrix}
\mathbf{I}_3 & \mathbf{I}_3 \Delta t & \mathbf{0}_3 & \mathbf{0}_3 & \mathbf{0}_3 \\
\mathbf{0}_3 & \mathbf{I}_3 & -[\mathbf{R}_b^n \hat{\mathbf{a}}_b]_\times \Delta t & -\mathbf{R}_b^n \Delta t & \mathbf{0}_3 \\
\mathbf{0}_3 & \mathbf{0}_3 & \mathbf{I}_3 - [\hat{\boldsymbol{\omega}}_b]_\times \Delta t & \mathbf{0}_3 & -\mathbf{I}_3 \Delta t \\
\mathbf{0}_3 & \mathbf{0}_3 & \mathbf{0}_3 & \mathbf{I}_3 & \mathbf{0}_3 \\
\mathbf{0}_3 & \mathbf{0}_3 & \mathbf{0}_3 & \mathbf{0}_3 & \mathbf{I}_3
\end{bmatrix}$$

### 3.4 Measurement Updates

```
+--------------------------------------------------------------------------------------+
|                              ESKF MEASUREMENT UPDATE MODES                           |
+--------------------------------------------------------------------------------------+
| 1. OPEN SKY GNSS UPDATE:                                                             |
|    z_gnss = [p_gnss; v_gnss]                                                         |
|    H_gnss = [I_3 0_3 0_3 0_3 0_3;                                                    |
|              0_3 I_3 0_3 0_3 0_3]                                                    |
|    Updates all 15 states, rapidly driving b_a and b_g errors to zero.                |
|                                                                                      |
| 2. BLACKOUT AI VIRTUAL ODOMETER + NHC UPDATE:                                        |
|    z_vehicle = [V_x^AI; 0; 0]   (Forward AI speed + NHC Vy=0, Vz=0)                 |
|    z_nav = R_v^n * z_vehicle                                                         |
|    H_ai = [0_3, I_3, 0_3, 0_3, 0_3]                                                 |
|    Innovation: y = z_nav - v_hat^n                                                   |
|    Kalman Gain: K = P * H^T * (H * P * H^T + R_adaptive)^-1                          |
|                                                                                      |
| 3. ZERO-VELOCITY UPDATE (ZUPT):                                                      |
|    Trigger: AI Engine Idle Classifier = 1 (Traffic Stop)                             |
|    z_zupt = [0; 0; 0]                                                                |
|    R_zupt = diag(1e-4, 1e-4, 1e-4) (Extremely high confidence)                       |
|    Instantly nullifies residual velocity drift and locks position.                   |
+--------------------------------------------------------------------------------------+
```

---

## 4. AI Virtual Odometer & Noise Invariance Pipeline

### 4.1 Neural Network Topology (1D-CNN / Temporal Convolutional Network)

```
Input: Tensor [Batch, 6 Channels (Ax, Ay, Az, Gx, Gy, Gz), 100 TimeSteps (1.0 s @ 100 Hz)]
  │
  ├──► [1D Conv: Filters=32, Kernel=7, Stride=1, Padding=Same, ReLU]
  ├──► [Batch Normalization] + [Spatial Dropout (p=0.1)]
  │
  ├──► [Residual Block 1: Dilation=1]
  │     ├── Conv1D(32 -> 32, k=3) -> BatchNorm -> ReLU
  │     ├── Conv1D(32 -> 32, k=3) -> BatchNorm
  │     └── Skip Connection (+) -> Squeeze-and-Excitation (SE Block) -> ReLU
  │
  ├──► [Residual Block 2: Dilation=2]
  │     ├── Conv1D(32 -> 64, k=3) -> BatchNorm -> ReLU
  │     ├── Conv1D(64 -> 64, k=3) -> BatchNorm
  │     └── Skip Connection (Conv 1x1) (+) -> SE Block -> ReLU
  │
  ├──► [Residual Block 3: Dilation=4]
  │     ├── Conv1D(64 -> 128, k=3) -> BatchNorm -> ReLU
  │     ├── Conv1D(128 -> 128, k=3) -> BatchNorm
  │     └── Skip Connection (Conv 1x1) (+) -> SE Block -> ReLU
  │
  ├──► [Global Average Pooling 1D]
  ├──► [Dense: 64 units, ReLU] -> [Dropout (0.2)]
  │
  ├──► [Head A: Forward Speed Regression] ─────────► Output: V_x (m/s) [Scalar]
  └──► [Head B: Speed Uncertainty / Variance] ────► Output: σ_v^2 (Adaptive Covariance)
```

### 4.2 AI Model Quantization & NNAPI Execution
- **Quantization Technique**: Full Post-Training Integer Quantization (PTQ) INT8 with representative dataset calibration from IO-VNBD drive logs.
- **Model Footprint**: 
  - Float32 Size: ~1.8 MB
  - INT8 Quantized Size: **~460 KB**
- **Inference Hardware Delegation**:
  - Primary: Android NNAPI (targeting Qualcomm Hexagon NPU, MediaTek APU).
  - Fallback: XNNPACK multi-threaded C++ backend.
  - Execution Time per Window: **1.8 ms to 2.8 ms**.

---

## 5. Offline Hidden Markov Model (HMM) Map-Matching

### 5.1 Formulation
Let $Z = \{z_1, z_2, \dots, z_T\}$ be the sequence of dead-reckoned positions output by the ESKF.  
Let $S = \{s_1, s_2, \dots, s_K\}$ be the candidate road segments extracted from offline OpenStreetMap (OSM) vector geometry.

```
                  s_11                   s_21                   s_31
                 /    \                 /    \                 /    \
Trajectory: z_1 ────►  s_12 ────► z_2 ────►  s_22 ────► z_3 ────►  s_32
                 \    /                 \    /                 \    /
                  s_13                   s_23                   s_33
```

#### 1. Emission Probability $p(z_t | s_i)$
The likelihood that dead-reckoned observation $z_t$ was generated by road segment $s_i$ is modeled as a Gaussian over orthogonal perpendicular distance $d_{\perp}(z_t, s_i)$:

$$p(z_t | s_i) = \frac{1}{\sqrt{2\pi}\sigma_z} \exp\left(-\frac{d_{\perp}(z_t, s_i)^2}{2\sigma_z^2}\right)$$

Where $\sigma_z = 4.0\text{ m}$ (standard deviation of dead reckoning error).

#### 2. Transition Probability $p(s_j | s_i)$
Evaluates the plausibility of transitioning from segment $s_i$ at $t-1$ to segment $s_j$ at $t$, comparing Euclidean dead-reckoning displacement $\Delta d_{\text{DR}} = \|z_t - z_{t-1}\|$ against the shortest topological road network distance $\Delta d_{\text{road}}(s_i \to s_j)$:

$$p(s_j | s_i) = \frac{1}{\beta} \exp\left(-\frac{|\Delta d_{\text{DR}} - \Delta d_{\text{road}}(s_i \to s_j)|}{\beta}\right)$$

Where $\beta = 3.0\text{ m}$.

#### 3. Viterbi Path Decoding
The most likely sequence of road segments $S^* = \{s_1^*, \dots, s_T^*\}$ is computed via dynamic programming:

$$V_{t}(j) = \max_{i} \left( V_{t-1}(i) \cdot p(s_j | s_i) \right) \cdot p(z_t | s_j)$$

---

## 6. Software Architecture & Interfaces

### 6.1 Module Hierarchy & Directory Layout
```
c:\Users\Manthan\Desktop\SIH168/
├── docs/
│   ├── PRD.md                         # Product Requirements Document
│   ├── TRD.md                         # Technical Requirements Document
│   ├── AI_ARCHITECTURE.md             # AI / ML Deep Dive Specification
│   └── ROADMAP.md                     # Engineering & Hackathon Roadmap
├── core_cpp/                          # C++ Native Kalman & Math Engine
│   ├── include/
│   │   ├── eskf.hpp                   # 15-state Error-State Kalman Filter
│   │   ├── auto_calib.hpp             # LPF + PCA Phone-to-Vehicle Engine
│   │   ├── nhc_zupt.hpp               # Non-Holonomic Constraints & ZUPT
│   │   ├── hmm_map_matcher.hpp        # HMM Viterbi Map Matching
│   │   └── navicore_pipeline.hpp      # Main Native Pipeline Orchestrator
│   └── src/
│       ├── eskf.cpp
│       ├── auto_calib.cpp
│       ├── nhc_zupt.cpp
│       ├── hmm_map_matcher.cpp
│       └── jni_bridge.cpp             # Zero-copy JNI Bridge to Android
├── ml_models/                         # Machine Learning Assets & Scripts
│   ├── train_virtual_odometer.py      # PyTorch Training on IO-VNBD
│   ├── quantize_tflite.py             # INT8 Calibration & Export Script
│   └── tflite/
│       └── navicore_odometer_int8.tflite
├── android_app/                       # Android Navigation Client (Kotlin)
│   ├── app/src/main/
│   │   ├── cpp/                       # CMakeLists.txt & NDK bindings
│   │   ├── java/org/enigma/navicore/
│   │   │   ├── sensor/                # High-frequency Sensor Ingestion
│   │   │   ├── ml/                    # TFLite NNAPI Inference Manager
│   │   │   ├── engine/                # Native Interface & State Machine
│   │   │   └── ui/                    # Mapbox / Compose 10Hz Navigation UI
│   │   └── assets/                    # Offline OSM PBF tiles & TFLite models
└── ros2_node/                         # Enterprise Edge Robotics Wrapper
    ├── include/navicore_ros2.hpp
    └── src/navicore_ros2_node.cpp
```

### 6.2 Zero-Copy JNI Native Interface

```cpp
// Direct memory buffer passing to avoid Java Garbage Collection overhead
extern "C" JNIEXPORT void JNICALL
Java_org_enigma_navicore_engine_NativeNavEngine_processImuBatch(
    JNIEnv* env,
    jobject /* this */,
    jobject byteBufferDirect,
    jint sampleCount,
    jlong timestampNanos
) {
    auto* imuDataPtr = static_cast<float*>(env->GetDirectBufferAddress(byteBufferDirect));
    NaviCore::GetEngineInstance().FeedImuBatch(imuDataPtr, sampleCount, timestampNanos);
}
```

---

## 7. Telemetry & Data Logging Schema

All runtime runs log binary or compact JSON telemetry for post-drive validation:

```json
{
  "timestamp_ms": 1774423850123,
  "gnss_status": "BLACKOUT",
  "gnss_hdop": 99.9,
  "calibrated_angles_deg": { "pitch": 14.2, "roll": -3.1, "yaw_offset": 82.5 },
  "imu_raw": { "ax": 0.42, "ay": 0.12, "az": 9.78, "gx": 0.01, "gy": -0.02, "gz": 0.05 },
  "estimated_bias": { "ba_x": 0.031, "ba_y": -0.012, "ba_z": 0.008, "bg_z": 0.0014 },
  "ai_inferred_speed_mps": 11.42,
  "ai_speed_std": 0.35,
  "zupt_active": false,
  "filtered_state": {
    "lat": 19.076090,
    "lon": 72.877426,
    "speed_mps": 11.38,
    "heading_deg": 184.2
  },
  "map_matched_segment_id": "osm_way_9841203"
}
```

---

## 8. Test, Validation & Verification Plan

1. **Synthetic Unit Testing**: Verify mathematical convergence of ESKF on simulated 90-degree turns, stop-and-go profiles, and known noise injection.
2. **IO-VNBD Benchmark Validation**: Evaluate Root Mean Square Error (RMSE) against ground truth CAN-bus vehicle speed across 100+ km of real-world driving.
3. **Simulated Blackout Stress Test**: Simulate 30s, 60s, 120s, and 300s GNSS loss at varying vehicle speeds (20 km/h to 80 km/h) and verify drift $< 10\%$.
4. **Physical Vehicle Road Trial**: Mount test phone on motorbike handlebar and car dashboard through tunnels (e.g. Mumbai Coastal Road Tunnel / Delhi Pragati Maidan Tunnel) and basement parking structures.
