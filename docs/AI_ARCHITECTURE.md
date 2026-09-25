# AI & Machine Learning Architecture Specification

## Project: NaviCore AI
**Module**: Edge-Native Virtual Odometer & Zero-Velocity Neural Engine
**Smart India Hackathon 2026** | **Problem Statement ID**: 260168
**Team**: @enigm@ (Team ID: 132834)
**Document Status**: Architecture design + literature-grounded targets. Section 7's benchmark table is projected/target ranges pending our own measurement — see notes.

---

## 1. Overview & AI Formulation

Commodity smartphone MEMS IMUs (e.g. Bosch BMI160, ST LSM6DSO, TDK ICM-42688) have low signal-to-noise ratio and temperature-dependent bias drift. Direct double-integration of acceleration:

$$s(t) = s(0) + v(0)t + \iint_{0}^{t} \left( \mathbf{R}_b^n(\tau) (\mathbf{a}_m(\tau) - \mathbf{b}_a(\tau)) - \mathbf{g}^n \right) d\tau^2$$

produces position error that grows as $O(t^2)$. As an illustrative bound: a constant, uncorrected accelerometer bias of 0.05 m/s² contributes roughly $\frac{1}{2}b_at^2 \approx 22.5$ m of *bias-driven* error alone over 30 seconds — this is one term among several error sources (noise integration, misalignment, heading error), not the full picture, and should not be read as "total system drift."

NaviCore AI replaces naive double-integration with a hybrid AI-physics approach:
1. **AI Neural Odometer** — regresses forward speed $V_x(t)$ from a sliding IMU window.
2. **Kinematic Decoupling** — NHC forces $V_y = 0, V_z = 0$ for wheeled vehicles under non-slip conditions.
3. **Heading (Yaw) Drift Correction** — continuous gyro-bias tracking plus magnetometer heading fusion, treated as a first-class error-budget item (see Section 5A). In practice, uncorrected heading error is typically the *dominant* contributor to 2D position drift over a route, more so than forward-speed error — this architecture reflects that.
4. **Physics-Guided ZUPT** — an on-device classifier identifies idle/stopped states and anchors velocity to 0.

---

## 2. Dataset & Training Pipeline

### 2.1 IO-VNBD (Inertial Odometry Vehicle Navigation Benchmark Dataset)
NaviCore AI's odometer is trained on the public **IO-VNBD** dataset (Onyekpe et al., Coventry University), which pairs:
- **Inputs**: smartphone IMU (accelerometer + gyroscope), and vehicle-side sensors, collected across the UK, Nigeria, and France.
- **Ground Truth**: vehicle CAN-bus / ECU data (wheel speed, yaw rate, GPS) collected alongside the phone data.

**Important correction versus earlier drafts of this document:** IO-VNBD's published sampling rate is **10 Hz** for both the smartphone and vehicle CAN-bus streams (per the original Data in Brief / arXiv publication), not 100 Hz. Our on-device ingestion pipeline targets a higher rate (up to 100 Hz, hardware-permitting) for low end-to-end latency. This creates a **rate mismatch between training ground truth and deployment input** that must be handled explicitly:

- **Training-time**: the model is trained and evaluated at the dataset's native 10 Hz (or a resampled rate consistent with it). We do not assume 100 Hz training data exists.
- **Deployment-time**: on-device IMU is captured at the best achievable rate and **downsampled/decimated (with appropriate anti-aliasing, e.g. a low-pass filter before decimation) to match the trained model's expected input rate**, rather than pretending the model was trained on 100 Hz data it never saw.
- **Future improvement**: self-collected 100 Hz calibration data (phone-only, using GPS speed as a coarse reference on open roads) is listed as a post-hackathon improvement to eventually retrain at higher rate — not assumed available for Phase 1.

This is a meaningful engineering decision, not a footnote, and should be presented as such rather than glossed over.

### 2.2 Data Preprocessing & Augmentation
```
Raw IMU Stream [ax, ay, az, gx, gy, gz] @ native device rate
                     │
                     ▼
  ┌────────────────────────────────────────────────────────┐
  │ 1. Anti-alias filter + decimate to training rate        │
  │    (matches IO-VNBD's 10 Hz ground truth — see 2.1)     │
  └────────────────────────────────────────────────────────┘
                     │
                     ▼
  ┌────────────────────────────────────────────────────────┐
  │ 2. Dynamic Gravity Decoupling (LPF fc = 0.5 Hz)         │
  │    Extracts dynamic acceleration: a_dyn = a_raw - g     │
  └────────────────────────────────────────────────────────┘
                     │
                     ▼
  ┌────────────────────────────────────────────────────────┐
  │ 3. Coordinate Auto-Normalization                        │
  │    Transforms body frame to estimated vehicle frame     │
  └────────────────────────────────────────────────────────┘
                     │
                     ▼
  ┌────────────────────────────────────────────────────────┐
  │ 4. Sliding Window Segmentation                          │
  │    Window length and stride set relative to the         │
  │    training sample rate (not hardcoded to 100 Hz)       │
  └────────────────────────────────────────────────────────┘
                     │
                     ▼
  ┌────────────────────────────────────────────────────────┐
  │ 5. Domain-Specific Data Augmentations                   │
  │    - Synthetic pothole shocks (amplitude spikes)         │
  │    - Engine idle harmonic injection                      │
  │    - Sensor noise perturbation (Gaussian jitter)         │
  │    - Orientation jitter (+/- 15°)                        │
  └────────────────────────────────────────────────────────┘
```

---

## 3. Deep Neural Network Architecture

### 3.1 1D Temporal Convolutional Network (TCN) — design, not yet trained/benchmarked

The odometer uses dilated 1D temporal convolutions with residual connections and Squeeze-and-Excitation attention. This table describes the *intended* architecture; parameter counts are computed from the layer definitions and are correct regardless of training status, but no accuracy numbers are claimed here — those belong in Section 7 as targets only.

```
==================================================================================================
Layer (type)                       Output Shape             Param #       Receptive Field*
==================================================================================================
Input_IMU_Tensor                   [Batch, 6, W]            0             1
Conv1D_Stem (k=7, s=1, f=32)       [Batch, 32, W]           1,376         7
BatchNorm1D + ReLU                 [Batch, 32, W]           64            7
SpatialDropout1D (p=0.1)           [Batch, 32, W]           0             7
--------------------------------------------------------------------------------------------------
Residual_Block_1 (Dilation d=1):
  ├─ Conv1D (k=3, d=1, f=32)       [Batch, 32, W]           3,104         9
  ├─ BatchNorm1D + ReLU            [Batch, 32, W]           64            9
  ├─ Conv1D (k=3, d=1, f=32)       [Batch, 32, W]           3,104         11
  ├─ BatchNorm1D                   [Batch, 32, W]           64            11
  ├─ SE_Attention (reduction=4)    [Batch, 32, W]           544           11
  └─ Add Skip Connection + ReLU    [Batch, 32, W]           0             11
--------------------------------------------------------------------------------------------------
Residual_Block_2 (Dilation d=2):
  ├─ Conv1D (k=3, d=2, f=64)       [Batch, 64, W]           6,208         15
  ├─ BatchNorm1D + ReLU            [Batch, 64, W]           128           15
  ├─ Conv1D (k=3, d=2, f=64)       [Batch, 64, W]           12,352        19
  ├─ BatchNorm1D                   [Batch, 64, W]           128           19
  ├─ 1x1 Conv Skip Projection      [Batch, 64, W]           2,112         19
  ├─ SE_Attention (reduction=4)    [Batch, 64, W]           2,112         19
  └─ Add Skip Connection + ReLU    [Batch, 64, W]           0             19
--------------------------------------------------------------------------------------------------
Residual_Block_3 (Dilation d=4):
  ├─ Conv1D (k=3, d=4, f=128)      [Batch, 128, W]          24,704        27
  ├─ BatchNorm1D + ReLU            [Batch, 128, W]          256           27
  ├─ Conv1D (k=3, d=4, f=128)      [Batch, 128, W]          49,280        35
  ├─ BatchNorm1D                   [Batch, 128, W]          256           35
  ├─ 1x1 Conv Skip Projection      [Batch, 128, W]          8,320         35
  ├─ SE_Attention (reduction=4)    [Batch, 128, W]          8,320         35
  └─ Add Skip Connection + ReLU    [Batch, 128, W]          0             35
--------------------------------------------------------------------------------------------------
GlobalAveragePooling1D             [Batch, 128]             0             Full Window
Dense_Bottleneck (units=64, ReLU)  [Batch, 64]              8,256         Full Window
Dropout (p=0.2)                    [Batch, 64]              0             Full Window
--------------------------------------------------------------------------------------------------
Head_1: Forward Speed (Vx)         [Batch, 1] (Linear)      65            Predicted Speed (m/s)
Head_2: Speed Variance (σ²)        [Batch, 1] (Softplus)    65            Feeds adaptive R in ESKF
Head_3: ZUPT Idle Classifier       [Batch, 1] (Sigmoid)     65            P(vehicle stopped)
==================================================================================================
Total Parameters: ~122,253 (~489 KB Float32, ~125 KB INT8 — arithmetic only; INT8 accuracy
                             delta must be measured, not assumed negligible)
==================================================================================================
```
*W = window length in samples at the **training** sample rate (see Section 2.1) — not assumed to be 100.

---

## 4. Multi-Task Loss Formulation

$$\mathcal{L}_{\text{total}} = \mathcal{L}_{\text{NLL}}(\hat{v}_x, \hat{\sigma}_v^2, v_x^*) + \lambda_{\text{ZUPT}} \mathcal{L}_{\text{BCE}}(\hat{z}, z^*) + \lambda_{\text{Smooth}} \mathcal{L}_{\text{reg}}$$

### 1. Gaussian Negative Log-Likelihood (NLL) Loss
$$\mathcal{L}_{\text{NLL}} = \frac{1}{2N} \sum_{i=1}^{N} \left( \frac{(v_{x,i}^* - \hat{v}_{x,i})^2}{\hat{\sigma}_{v,i}^2} + \ln \hat{\sigma}_{v,i}^2 \right)$$
Lets the network predict both speed and its own uncertainty, which feeds the ESKF's adaptive measurement covariance.

### 2. Binary Cross-Entropy (BCE) for ZUPT
$$\mathcal{L}_{\text{BCE}} = -\frac{1}{N} \sum_{i=1}^{N} \left[ z_i^* \ln \hat{z}_i + (1 - z_i^*) \ln (1 - \hat{z}_i) \right]$$
where $z_i^* = 1$ if ground-truth speed $v_{x,i}^* < 0.05$ m/s. **Precision/recall of this classifier must be reported once trained** — a false positive silently zeroes the velocity of a moving vehicle, which is a worse user-facing failure than a small amount of drift.

---

## 5. Spectral ZUPT Engine (Harmonic Vibration Filtering)

Engine idle vibration is a known confusion source for naive integration:
- Single-cylinder 2-wheeler idle (1200–1500 RPM): ≈ 20–25 Hz.
- 4-cylinder car idle (700–900 RPM): ≈ 23–30 Hz (second harmonic).

```
Frequency Spectrum Comparison (illustrative, not measured):
|
| Amplitude
|   ▲
|   │     [ True Translation: 0.1 - 4 Hz ]
|   │     ████
|   │     ████                    [ Engine Idle Harmonics: 20 - 30 Hz ]
|   │     ████                            ▓▓▓▓▓▓▓
|   └────────────────────────────────────────────────────────► Frequency (Hz)
|         0 Hz        5 Hz        10 Hz       20 Hz       30 Hz       50 Hz
```

Energy-ratio feature:
$$\text{Energy Ratio} = \frac{\int_{20\text{ Hz}}^{35\text{ Hz}} |X(f)|^2 \, df}{\int_{0.1\text{ Hz}}^{5\text{ Hz}} |X(f)|^2 \, df}$$

Note: computing a 20–35 Hz band cleanly requires a sample rate high enough to resolve it (Nyquist ≥ 70 Hz) — this is only valid at the on-device inference rate, **not** at IO-VNBD's native 10 Hz. The training-time ZUPT label (from thresholding ground-truth speed) is rate-independent, but this particular FFT-band feature is a deployment-time signal computed from the raw on-device stream, separately from the trained classifier — that separation should be made explicit in the implementation, not blurred.

---

## 5A. Heading (Yaw) Drift Correction — *new section, previously missing*

Forward-speed error alone does not explain most vehicle dead-reckoning failure; heading error typically dominates because a small heading bias compounds with distance travelled (lateral position error grows roughly as distance × sin(heading error)).

**Design**:
1. **Gyro-bias tracking**: continuously estimate the z-axis (yaw) gyro bias during GNSS-healthy periods, as part of the ESKF state vector — already implied by the 15-state ESKF but must be explicitly validated for the yaw channel specifically, not assumed to fall out of the general bias estimate.
2. **Magnetometer fusion**: where a reliable magnetometer reading is available (outside heavy magnetic interference — e.g. not clamped directly to a metal handlebar bracket), fuse it as a secondary heading observation with conservative measurement noise.
3. **Heading reset on map-matching**: once HMM map-matching is available (Section 4.1 of the PRD, stretch goal), use high-confidence road-snap events to reset accumulated heading error — this is a *correction of last resort*, not the primary mechanism.

This is elevated from an implicit side-effect (as in earlier drafts) to an explicit, separately-tested component.

---

## 6. On-Device Model Optimization & Hardware Acceleration

### 6.1 Post-Training Quantization (PTQ) Workflow
```
[ PyTorch Model (Float32) ]
                      │
                      ▼
        [ Export to ONNX / TorchScript ]
                      │
                      ▼
[ TFLite Converter (Representative Dataset Calibration) ]
   - Weight Quantization: INT8
   - Activation Quantization: INT8
   - Input/Output Types: Float32 (transparent IO wrappers)
                      │
                      ▼
[ navicore_odometer_int8.tflite — accuracy delta vs Float32 to be measured ]
```

### 6.2 Target Hardware Delegates
1. **Android NNAPI Delegate** where the device chipset actually exposes a working delegate (Hexagon DSP, MediaTek APU, Tensor TPU) — availability must be checked per test device, not assumed universal.
2. **Arm NEON / XNNPACK CPU fallback** — the baseline path that must work on every device, since NPU availability is not guaranteed on budget hardware.

---

## 7. Benchmarks & Evaluation — Targets, Not Measured Results

**Earlier drafts of this document presented a table of exact drift figures (e.g. "0.8 m over 30 s," "0.00 m locked") as "Experimental Benchmarks." No such experiments have been run yet, and those figures are removed.** What follows are literature-informed target *ranges*, to be replaced with our own measured numbers once training and testing are complete.

| Navigation Method | Typical Reported Behaviour (from literature, for context) |
| :--- | :--- |
| Raw IMU double-integration | Drift of tens to hundreds of metres within 15–30 s of blackout — well documented; matches our motivating derivation in Section 1. |
| Classical EKF (IMU-only, no learned odometer) | Meaningfully better than raw integration but still drifts substantially over tens of seconds without aiding. |
| Learned inertial odometry (RoNIN, AI-IMU / Brossard et al., WhONet-style approaches) | Report drift on the order of a few percent of distance under favorable conditions in their own evaluation setups — figures are **not directly transferable** to our dataset, sensors, or vehicle types without re-measurement. |

**Our target for Phase 1**: report an actual measured velocity RMSE (m/s) on held-out IO-VNBD data, and an actual measured position-drift-over-distance number from our own simulated-blackout evaluation script — both published with the exact test conditions (route length, blackout duration, vehicle/mount type), replacing this table once available.

**Explicitly not claimed until measured**: sub-1-metre drift figures, exact "0.00 m" ZUPT lock, or any single-number headline stat presented without a described test methodology.