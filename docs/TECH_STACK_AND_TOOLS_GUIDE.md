# Technology Stack & Free/Open-Source Tools Guide

## Project: NaviCore AI
**Subtitle**: Comprehensive Guide to Recommended Free, Open-Source & Edge-Native Technologies  
**Smart India Hackathon 2026** | **Problem Statement ID**: 260168  
**Team**: @enigm@ (Team ID: 132834)

---

## 1. Executive Summary & Selection Philosophy

NaviCore AI is designed to operate **100% offline at the edge** with **zero recurring cloud API costs**, no expensive hardware dongles, and maximum cross-platform efficiency across budget Android devices and ROS2 robotics.

### Core Selection Criteria
1. **Zero-Cost & Open-Source (FOSS)**: Prioritize Permissive (MIT, Apache 2.0, BSD) and OpenStreetMap (ODbL) licensed software to prevent vendor lock-in and eliminate SaaS billing.
2. **Offline-First Resilience**: Every map tile, AI model, Kalman filter, and routing graph must execute locally without an internet connection.
3. **Sub-10ms Latency & Low Thermal Footprint**: Prefer native C++ (Eigen, NDK) and hardware-delegated INT8 neural networks (NNAPI) over garbage-collected JVM libraries.
4. **Developer Experience & Turnkey Setup**: Easy local configuration without complex corporate sign-ups or credit card requirements.

---

## 2. Layer-by-Layer Technology Recommendations

```
+---------------------------------------------------------------------------------------------------+
|                                  NAVICORE AI COMPLETE TECH STACK                                 |
+---------------------+-----------------------------------+--------------------+--------------------+
| Architecture Layer  | Primary Recommendation (FOSS/Free)| Alternative / Post | Cost / License     |
+---------------------+-----------------------------------+--------------------+--------------------+
| 1. Offline Maps     | MapLibre Native Android + PMTiles | Mapbox SDK (Freem.)| 100% Free (BSD-3)  |
| 2. Map & Road Graph | OpenStreetMap (OSM) via Geofabrik | Natural Earth Data | 100% Free (ODbL)   |
| 3. Map-Matching     | Valhalla (Meili HMM Engine) / C++ | GraphHopper (Java) | 100% Free (MIT)    |
| 4. AI Training      | PyTorch 2.x + SciPy FFT + Pandas  | JAX / TensorFlow   | 100% Free (BSD)    |
| 5. Edge ML Runtime  | TFLite INT8 + Android NNAPI       | ONNX Runtime Mobile| 100% Free (Apache) |
| 6. Sensor Ingestion | Android NDK C-API (ASensorManager)| Kotlin SensorMan.  | 100% Free (AOSP)   |
| 7. Math & Fusion    | C++20 + Eigen 3.4 (Header-only)   | Armadillo / Ceres  | 100% Free (MPL2)   |
| 8. Mobile UI/UX     | Jetpack Compose + Material 3 Dark | XML Views / Flutter| 100% Free (Apache) |
| 9. Edge Robotics    | ROS 2 Humble Hawksbill (C++)      | Micro-ROS / MQTT   | 100% Free (Apache) |
| 10. CI/CD & Build   | Gradle KTS + GitHub Actions       | GitLab CI          | 100% Free Tier     |
+---------------------+-----------------------------------+--------------------+--------------------+
```

---

## 3. Deep Dive by Functional Area

### 3.1 Offline Maps, Vector Tiles & Rendering

#### 🥇 Primary Recommendation: **MapLibre Native Android + PMTiles / MBTiles**
- **Why it's the best choice**:
  - Fork of Mapbox GL before it went proprietary. **100% free, open-source (BSD-3-Clause)**, actively maintained by the Linux Foundation.
  - Zero API key required, zero tracking, no usage limits, no credit card needed.
  - Native OpenGL/Vulkan rendering capable of rendering offline vector tiles at a smooth 60–120 FPS.
  - Supports **PMTiles** (single-file cloud-optimized/local archive) and **MBTiles** (SQLite-based vector tile format).
- **What You Must Provide**:
  - **Tile Data**: An extracted `.mbtiles` or `.pmtiles` file for your test city (e.g., Mumbai, Delhi, Bengaluru) generated from OpenStreetMap.
  - **Vector Style**: A free vector stylesheet (e.g., OpenMapTiles `osm-bright-style` or Positron Dark theme JSON).
  - **Glyphs & Sprites**: Bundled locally in the Android `assets/` folder for offline font rendering.
- **Where to Download Data (Free)**:
  - Free city/state extract: [Geofabrik OSM Downloads](https://download.geofabrik.de/asia/india.html) (`.osm.pbf`)
  - Pre-rendered free vector tiles: [Protomaps Extract Tool](https://protomaps.com/extracts) or [OpenMapTiles.org](https://openmaptiles.org/)
- **Android Gradle Dependency**:
  ```kotlin
  // build.gradle.kts (app)
  implementation("org.maplibre.gl:android-sdk:11.5.0")
  ```

---

### 3.2 Offline Map-Matching & Road Network Routing (HMM Viterbi)

#### 🥇 Primary Recommendation: **Valhalla (Meili HMM Engine) / Custom C++ OSM Graph Matcher**
- **Why it's the best choice**:
  - **Valhalla** is an ultra-fast, open-source (MIT License) routing and map-matching engine designed by Mapzen/Tesla.
  - Its **Meili** sub-module provides an industrial-grade Hidden Markov Model (HMM) Viterbi algorithm specifically built to match noisy GPS/dead-reckoning traces to road centerlines.
  - Memory-efficient tile hierarchy allows running lightweight city graphs offline on Android or Raspberry Pi.
- **Alternative (Simpler for Hackathon Prototype)**:
  - **Custom Lightweight C++ R-Tree + Viterbi matcher**: Use `boost::geometry::index::rtree` or header-only `nanoflann` to index road segments extracted from OSM `.pbf` into a local spatial index.
- **What You Must Provide**:
  - City bounding box coordinates (e.g., Mumbai: `[18.89, 72.77, 19.27, 73.01]`).
  - OSM `.pbf` file processed with `valhalla_build_tiles` or converted to GeoJSON/SQLite road segments.

---

### 3.3 Deep Learning & Neural Odometer Pipeline

#### 🥇 Primary Recommendation: **PyTorch 2.x $\to$ ONNX $\to$ TensorFlow Lite (INT8 PTQ)**
- **Why it's the best choice**:
  - **PyTorch**: Cleanest API for building 1D Temporal Convolutional Networks (TCN), custom multi-task loss functions (Gaussian NLL + ZUPT BCE), and PyTorch Lightning training harnesses.
  - **TFLite + NNAPI**: TFLite is the industry gold standard for on-device inference on Android. INT8 Post-Training Quantization shrinks model size from 490 KB down to **~125 KB**, delegating execution directly to the smartphone's NPU/DSP (Qualcomm Hexagon / MediaTek APU).
- **What You Must Provide**:
  - **Dataset**: Public **IO-VNBD** dataset (Coventry University) or Oxford Inertial Odometry Dataset (OxIOD). Free to download for research/academic use.
  - **Python Environment**: Python 3.10+, `torch`, `torchaudio`, `scipy`, `pandas`, `tflite-support`.
- **Requirements & Setup (Free)**:
  ```bash
  pip install torch torchvision torchaudio numpy scipy pandas onnx tensorflow
  ```

---

### 3.4 High-Frequency IMU Ingestion & Native Math Engine

#### 🥇 Primary Recommendation: **Android NDK C-API (`ASensorManager`) + Eigen 3.4 (Header-Only C++)**
- **Why it's the best choice**:
  - **Android NDK Sensor API**: Accesses hardware gyro and accelerometer registers at 100 Hz in native C/C++ memory, bypassing Java Garbage Collection (GC) pauses that cause timing jitter.
  - **Eigen 3.4**: Premier header-only C++ matrix linear algebra library (MPL2 license). Allows compile-time fixed-size matrix operations (e.g., `Eigen::Matrix<float, 15, 15>`) with zero dynamic heap allocation, SIMD vectorization (Arm Neon), and microsecond execution speed.
- **What You Must Provide**:
  - Android NDK (Side by side 25.x or 26.x) installed via Android Studio SDK Manager.
  - CMake 3.22.1+.
  - Eigen 3.4 headers placed in `core_cpp/third_party/eigen3/` (No compilation required, purely headers).

---

### 3.5 Mobile Application UI & Real-Time Visualization

#### 🥇 Primary Recommendation: **Jetpack Compose + Material 3 (Dark Theme) + Compose Charts**
- **Why it's the best choice**:
  - Modern declarative UI toolkit for Android, built by Google.
  - Highly optimized for dynamic state rendering (e.g., smoothly transitioning between Open-Sky, Dead-Reckoning Halo, and ZUPT Lock modes).
  - Modern, dark-mode automotive aesthetic with glassmorphism overlays and 10 Hz real-time telemetry gauges.
- **Android Dependencies**:
  ```kotlin
  // build.gradle.kts
  implementation(platform("androidx.compose:compose-bom:2024.02.00"))
  implementation("androidx.compose.material3:material3")
  implementation("androidx.compose.ui:ui")
  implementation("androidx.compose.ui:ui-tooling-preview")
  implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.7.0")
  ```

---

### 3.6 Edge Robotics & Enterprise Mode (Post-Hackathon / Stretch)

#### 🥇 Primary Recommendation: **ROS 2 Humble Hawksbill (Ubuntu 22.04 LTS)**
- **Why it's the best choice**:
  - Standard framework for autonomous ground vehicles (AGVs), drones, and defense robotics.
  - NaviCore's C++ core compiles directly into a native ROS 2 node publishing standard `nav_msgs/msg/Odometry` and `geometry_msgs/msg/PoseWithCovarianceStamped` topics.
- **What You Must Provide**:
  - Ubuntu 22.04 LTS (native or Docker container).
  - ROS 2 Humble base installation (`sudo apt install ros-humble-ros-base`).

---

## 4. Free Tools & Prerequisites Matrix

| Tool / Resource | Purpose | License | What YOU Need to Provide | Direct Source / Link |
| :--- | :--- | :--- | :--- | :--- |
| **MapLibre Native Android** | Offline Vector Map Rendering | BSD-3-Clause | Android Studio SDK 34, zero API keys | [github.com/maplibre/maplibre-native](https://github.com/maplibre/maplibre-native) |
| **Geofabrik OSM Extracts** | Free Regional OpenStreetMap Data | ODbL 1.0 | Select & download `.osm.pbf` for your city | [download.geofabrik.de](https://download.geofabrik.de/) |
| **Protomaps / Tilemaker** | Convert OSM `.pbf` to `.pmtiles`/`.mbtiles` | BSD / MIT | CLI tool execution: `tilemaker --input city.osm.pbf --output city.mbtiles` | [tilemaker.org](https://tilemaker.org/) |
| **Eigen 3.4** | C++ Fast Matrix & Kalman Math | MPL2 | Download zip and unpack into `include/` | [eigen.tuxfamily.org](https://eigen.tuxfamily.org/) |
| **IO-VNBD Dataset** | AI Odometer Training Data | Academic / CC | Download dataset files from repository | [Coventry University Repository](https://pureportal.coventry.ac.uk/) |
| **Android Studio Iguana / Jellyfish** | Complete Android IDE & NDK Toolchain | Free Google Tool | PC with 8GB+ RAM, Windows/Linux/macOS | [developer.android.com/studio](https://developer.android.com/studio) |
| **Netron** | Visualizing & Debugging TFLite Models | MIT | Drag and drop `.tflite` model to inspect layers | [netron.app](https://netron.app/) |

---

## 5. Step-by-Step Setup Guide for Developers

### Step 1: Prepare the Offline Map Package (Zero Cost)
1. Download the extract for your target region (e.g., `maharashtra-latest.osm.pbf`) from [Geofabrik](https://download.geofabrik.de/asia/india.html).
2. Clip to your test city bounding box using `osmium-tool`:
   ```bash
   osmium extract --bbox 72.77,18.89,73.01,19.27 maharashtra-latest.osm.pbf -o mumbai.osm.pbf
   ```
3. Generate `.mbtiles` using `tilemaker`:
   ```bash
   tilemaker --input mumbai.osm.pbf --output mumbai.mbtiles --process resources/process-openmaptiles.lua --config resources/config-openmaptiles.json
   ```
4. Copy `mumbai.mbtiles` and a dark-mode `style.json` into `android_app/app/src/main/assets/tiles/`.

### Step 2: Train & Export the AI Virtual Odometer
1. Run preprocessing and training on IO-VNBD:
   ```bash
   cd ml_pipeline
   python -m src.training.train --dataset-path ../data/iovnbd/ --epochs 50 --batch-size 64
   ```
2. Quantize model to INT8:
   ```bash
   python -m src.export.quantize_tflite --checkpoint models/checkpoints/best_tcn.pt --output ../android_app/app/src/main/assets/models/navicore_odometer_int8.tflite
   ```

### Step 3: Build & Deploy Android Application
1. Open `android_app/` in Android Studio.
2. Ensure Android NDK 26.x and CMake 3.22+ are installed in SDK Tools.
3. Sync Gradle and build the debug APK:
   ```bash
   ./gradlew assembleDebug
   ```
4. Install to test device:
   ```bash
   adb install -r app/build/outputs/apk/debug/app-debug.apk
   ```

---

## 6. Summary Comparison: Free Stack vs Proprietary Alternatives

```
+----------------------------------------------------------------------------------------------------+
|                                    FREE / OPEN STACK vs PROPRIETARY                                |
+-----------------------+---------------------------------------+------------------------------------+
| Layer                 | Our Recommended Stack (100% Free/FOSS)| Proprietary / Commercial Alternate |
+-----------------------+---------------------------------------+------------------------------------+
| Map SDK               | MapLibre Native (₹0 / Unlimited)      | Mapbox SDK ($5–$25 per 1k loads)   |
| Tile Data             | OpenStreetMap (₹0 / Self-Hosted)      | Google Maps SDK (High API costs)   |
| Matrix Library        | Eigen 3.4 (Free Header-Only)          | Intel MKL / Proprietary DSP libs   |
| Model Runtime         | TFLite + Android NNAPI (Free Built-in)| AWS Greengrass / Edge TPU hardware |
| Routing & Matcher     | Valhalla HMM / Custom R-Tree (Free)   | MapmyIndia / Google Roads API      |
| Telemetry & Charts    | Compose Canvas / MPAndroidChart (Free)| Datadog / Splunk Mobile APM        |
+-----------------------+---------------------------------------+------------------------------------+
```
