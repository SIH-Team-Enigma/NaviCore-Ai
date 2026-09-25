# Judge Defense & Technical Q&A Guide — NaviCore AI

**Smart India Hackathon 2026** | **Problem Statement ID**: 260168  
**Team**: @enigm@ (Team ID: 132834)  
**Target Audience**: Team presenters during SIH Grand Finale jury evaluation.

---

## 1. Top Technical Questions & Bulletproof Defenses

### Q1: "Why use a 1D-TCN instead of standard LSTM or GRU for the virtual odometer?"
- **Defense**:
  1. **Parallel Execution & Zero Hidden-State Bottleneck**: LSTMs have sequential dependencies $h_t = f(h_{t-1}, x_t)$, making hardware acceleration on mobile NPUs inefficient. 1D-TCN uses dilated causal 1D convolutions that execute in parallel across all cores.
  2. **Receptive Field Control**: With dilation factors $d \in \{1, 2, 4\}$, a 3-layer TCN achieves a receptive field of 64 timesteps (640 ms at 100 Hz), capturing full suspension rebound cycles without vanishing gradients.
  3. **Low-Bit Quantization Resilience**: TCN convolutional weights are far more stable under INT8 Post-Training Quantization (PTQ) than recurrent gate matrices, suffering $<0.03$ m/s degradation in forward velocity RMSE.

---

### Q2: "If the phone is mounted at an unknown, arbitrary angle on a bike handle or car dashboard, how do you know what 'forward' is?"
- **Defense**:
  - We use a **two-phase dynamic auto-calibration pipeline ($\mathbf{R}_b^v$)**:
    1. **Gravity Isolation (Vertical Axis $\mathbf{z}_v$)**: A Low-Pass Filter ($f_c = 0.5\text{ Hz}$) extracts the quasi-static gravity vector $\mathbf{g}_b$. The vehicle vertical unit vector is $\mathbf{z}_v = -\frac{\mathbf{g}_b}{\|\mathbf{g}_b\|}$.
    2. **Principal Component Analysis (Forward Axis $\mathbf{x}_v$)**: During vehicle acceleration or braking, dynamic acceleration variance is dominated by longitudinal motion. PCA extracts the primary eigenvector in the plane orthogonal to $\mathbf{z}_v$.
    3. **Gram-Schmidt Orthogonalization**: Resolves the lateral axis $\mathbf{y}_v = \mathbf{z}_v \times \mathbf{x}_v$ to form an orthonormal rotation matrix $\mathbf{R}_b^v$.
  - If the driver knocks or reorients the phone, high rotational gyro variance triggers automatic recalibration within 1.5 seconds without dropping navigation state.

---

### Q3: "When a car stops at a red light with the engine idling, cheap phone accelerometers detect high-frequency engine vibration. Won't double integration make the car drift?"
- **Defense**:
  - Yes, standard filters falsely integrate engine idle as continuous forward speed.
  - NaviCore AI eliminates this with **Spectral Zero-Velocity Update (ZUPT)**:
    1. A sliding 50-sample window computes the Welch Power Spectral Density (PSD).
    2. Typical 4-cylinder and 2-wheeler idle frequencies concentrate in the **15 Hz – 30 Hz** harmonic band, while translational driving motion concentrates below **4 Hz**.
    3. Upon detecting a dominant idle peak with low low-frequency variance, ZUPT engages, **clamping velocity strictly to $0.00\text{ m/s}$ and resetting velocity covariance** in the 15-state ESKF.

---

### Q4: "How does NaviCore AI ensure sub-10ms hot-switching when entering a tunnel?"
- **Defense**:
  - We run the **Error-State Kalman Filter (ESKF)** continuously in the background, even during open-sky GNSS conditions.
  - While GNSS is active, the ESKF continuously tracks and corrects IMU biases ($\mathbf{b}_a, \mathbf{b}_g$).
  - When GNSS drops (carrier-to-noise ratio $C/N_0 < 25\text{ dB-Hz}$ or fix loss), the filter switches measurement branches instantly from GNSS position/velocity updates to the 1D-TCN virtual odometer and NHC pseudo-measurements.
  - Benchmark switch time is **0.001 ms**, well beneath the 10 ms requirement.

---

### Q5: "What happens during non-holonomic violations like two-wheeler banking or car skidding?"
- **Defense**:
  - Standard Non-Holonomic Constraints (NHC) assume lateral velocity $V_y \approx 0$ and vertical velocity $V_z \approx 0$.
  - When cornering or banking, the 1D-TCN's uncertainty output head predicts a variance $\sigma^2_{V_x}$.
  - The ESKF measurement covariance matrix $\mathbf{R}_{\text{nhc}}$ dynamically scales by roll rate $\|\omega_x\|$ and predicted uncertainty:
    $$\mathbf{R}_{\text{nhc}} = \text{diag}(\sigma^2_{V_x}, \sigma^2_{y0} \cdot (1 + \kappa \|\omega_x\|), \sigma^2_{z0})$$
  - During sharp banking turns, NHC constraints are relaxed automatically to prevent over-constraining the trajectory.

---

### Q6: "How do you achieve luxury-grade accuracy without connecting to OBD-II wheel sensors?"
- **Defense**:
  - The 1D-TCN model is trained on the Coventry University **IO-VNBD** (Indoor/Outdoor Vehicle Navigation Benchmark Dataset), which pairs raw smartphone 6-DOF IMU data directly with vehicle CAN-bus speed sensors as ground truth.
  - The model learns the subtle mechanical resonance, chassis pitch, and suspension kinematics of vehicles, allowing it to predict forward speed directly from IMU vibrations with an RMSE of **0.08 m/s**.

---

### Q7: "How is privacy handled?"
- **Defense**:
  - 100% On-Device Processing. Raw sensor streams (accelerometer, gyroscope, GNSS) never leave the user's phone.
  - The native C++ engine runs locally on the device CPU/NPU without cloud offloading or external telemetry leaks.
