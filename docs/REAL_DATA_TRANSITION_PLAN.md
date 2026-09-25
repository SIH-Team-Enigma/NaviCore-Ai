# Real-Time Data Transition & Physical Hardware Integration Plan

**NaviCore AI** | **Smart India Hackathon 2026** | **Problem Statement ID**: 260168  
**Team**: @enigm@ (Team ID: 132834)  

---

## 1. Objective

To transition NaviCore AI from simulated/synthetic validation to **100% real-world automotive and two-wheeler physical sensor data**, connecting live smartphone MEMS IMUs and benchmark automotive CAN-bus datasets directly into the navigation engine.

---

## 2. Hardware & Physical Setup Requirements

### A. Test Smartphones & IMU Chipsets
| Device Tier | Example Model | IMU Chipset | Ingestion Path |
| :--- | :--- | :--- | :--- |
| **Budget Android (Primary)** | Redmi 9A / Realme C-series | MediaTek / Bosch BMI160 | Android NDK / SensorManager (100 Hz) |
| **Mid-Range Android** | Samsung Galaxy A14 / OnePlus Nord | STMicroelectronics LSM6DSO | Android NDK / SensorManager (100 Hz) |
| **Universal Live Stream** | Any Smartphone (Android / iOS) | Native WebSensors API | WebSocket Streamer (`sensor_stream.html`) |

### B. Mechanical Mount Specifications
- **Car Dashboard**: Rigid mechanical claw mount fixed to air-vent or suction-clamped to windshield. *(Avoid loose magnetic mounts that pivot under sharp braking)*.
- **Two-Wheeler (Motorcycle/Scooter)**: Handlebar-clamped anti-vibration vibration-damped bracket.

---

## 3. Real Data Integration Modes

### Mode 1: Live Real-Time Physical Phone Streaming (Instant Test)
1. Start the visualizer and live sensor receiver server on your laptop:
   ```powershell
   # Terminal 1: Web Visualizer
   python scripts/launch_visualizer.py

   # Terminal 2: Live Sensor Server
   python scripts/realtime_sensor_server.py
   ```
2. Connect your smartphone and laptop to the same Wi-Fi network or mobile hotspot.
3. Open your mobile browser (Chrome/Safari) and navigate to:
   `http://<YOUR_LAPTOP_IP>:8080/sensor_stream.html`
4. Tap **"Grant Sensor Access & Start Streaming"**.
5. Physically move, tilt, or drive with your phone — your real 100 Hz accelerometer ($a_x, a_y, a_z$), gyroscope ($g_x, g_y, g_z$), and live GPS stream directly to the NaviCore Dead Reckoning engine!

---

### Mode 2: Automotive Benchmark Dataset Ingestion (IO-VNBD)
- **Dataset**: Coventry University **IO-VNBD** (Indoor/Outdoor Vehicle Navigation Benchmark Dataset).
- **Ground Truth**: High-precision vehicle OBD-II CAN-bus wheel speed sensors + RTK-GNSS reference.
- **Ingestion Script**: [`ml_pipeline/src/dataset/real_data_pipeline.py`](file:///c:/Users/Manthan/Desktop/SIH168/ml_pipeline/src/dataset/real_data_pipeline.py)
  ```python
  from dataset.real_data_pipeline import RealDataPipeline
  pipeline = RealDataPipeline(raw_rate_hz=100, target_rate_hz=10)
  data = pipeline.load_coventry_iovnbd_csv("path/to/coventry_run.csv")
  ```

---

### Mode 3: Native Android App Recording
- Compile and install [`android_app`](file:///c:/Users/Manthan/Desktop/SIH168/android_app) onto an Android phone.
- The app logs raw 100 Hz sensor streams and writes uncompressed CSV logs to `/sdcard/Android/data/org.enigma.navicore/files/telemetry_logs/`.

---

## 4. Real Data Preprocessing & Calibration Pipeline

```
[Raw 100 Hz Mobile IMU Stream]
             │
             ▼
[Anti-Aliasing Filter & Decimation (100 Hz -> 10 Hz)]
             │
             ▼
[Quasi-Static Gravity Decoupling (LPF fc=0.5 Hz)]  ──> Resolves Z_v (Vertical Axis)
             │
             ▼
[Principal Component Analysis (PCA on Dynamic Accel)] ──> Resolves X_v (Forward Axis)
             │
             ▼
[Gram-Schmidt Orthogonalization] ──> Resolves Y_v & Orthonormal Matrix R_b^v
             │
             ▼
[1D-TCN Virtual Odometer Inference (Vx)] ──> Evaluated against CAN-bus Wheel Speed
```

---

## 5. Execution Roadmap to Full Real-Data Verification

- [x] **Step 1: Phone-to-Engine Streaming Bridge**: [`web_visualizer/sensor_stream.html`](file:///c:/Users/Manthan/Desktop/SIH168/web_visualizer/sensor_stream.html) and [`scripts/realtime_sensor_server.py`](file:///c:/Users/Manthan/Desktop/SIH168/scripts/realtime_sensor_server.py) built and tested.
- [x] **Step 2: Real Dataset Parser**: [`ml_pipeline/src/dataset/real_data_pipeline.py`](file:///c:/Users/Manthan/Desktop/SIH168/ml_pipeline/src/dataset/real_data_pipeline.py) implemented with anti-aliasing decimation.
- [x] **Step 3: ROS2 Edge Robotics Wrapper**: [`ros2_node/src/navicore_node.cpp`](file:///c:/Users/Manthan/Desktop/SIH168/ros2_node/src/navicore_node.cpp) configured for ROS2 vehicle integration.
- [ ] **Step 4: Live In-Vehicle Drive Capture**: Record a 15-minute test drive through a city underpass/flyover and evaluate relative drift against reference odometer.
