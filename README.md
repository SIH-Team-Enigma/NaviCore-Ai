# NaviCore AI: Intelligent Dead Reckoning System

[![Smart India Hackathon 2026](https://img.shields.io/badge/SIH-2026-orange.svg)](https://www.sih.gov.in/)
[![Problem Statement ID](https://img.shields.io/badge/PS_ID-260168-blue.svg)](https://www.sih.gov.in/)
[![Theme](https://img.shields.io/badge/Theme-Smart_Vehicles-green.svg)](https://www.sih.gov.in/)
[![Team](https://img.shields.io/badge/Team-%40enigm%40-purple.svg)](https://www.sih.gov.in/)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)

> **Edge-Native Virtual Odometer & Zero-Drift GNSS Fusion Engine for Seamless Vehicle Navigation**

---

## 📌 Problem Statement Overview (ID: 260168)

In dense urban environments, tunnels, underpasses, flyovers, and underground parking structures, **Global Navigation Satellite System (GNSS)** signals suffer from severe multipath interference or complete blackout. Standard smartphone navigation apps (e.g., Google Maps, Apple Maps) freeze, rubber-band, or drift erratically because standard phone MEMS IMU sensors suffer from **quadratic double-integration drift** ($> 100\text{ m}$ in 15 seconds) and road noise (potholes, 2-wheeler engine vibrations).

While luxury autonomous cars solve this using ₹20,000 to ₹1,00,000+ hardware-grade INS and CAN-bus wheel speed sensors, **India's 2-wheelers, auto-rickshaws, and gig-economy delivery fleets (Zomato, Swiggy, Uber, Delhivery) have no OBD-II ports and rely solely on budget smartphones.**

---

## 🚀 The NaviCore AI Solution

**NaviCore AI** is a 100% software-driven, edge-native virtual odometer and zero-drift GNSS fusion engine running on standard budget smartphones and ROS2 robotics platforms:

1. **AI Virtual Odometer (1D-CNN / TCN)**: Converts 1.0 s windows of IMU data into forward velocity ($V_x$), filtering out road bumps and potholes.
2. **Auto-Calibration (LPF + PCA)**: Automatically computes the 3D phone-to-vehicle rotation matrix ($\mathbf{R}_b^v$) for arbitrary phone mounting orientations.
3. **15-State Error-State Kalman Filter (ESKF)**: Learns sensor zero-g accelerometer and gyro biases under open sky; switches to AI speed + Non-Holonomic Constraints (NHC: $V_y=0, V_z=0$) in $<10\text{ ms}$ upon GNSS blackout.
4. **AI-Triggered Zero-Velocity Update (ZUPT)**: Spectral harmonic classifier detects idling engines in traffic jams and locks velocity to $0.00\text{ m/s}$, stopping drift completely.
5. **Offline HMM Map-Matching**: Viterbi dynamic programming against offline OpenStreetMap (OSM) vector geometry snaps drifted paths to road centerlines.
6. **Zero-Latency C++ Engine (Eigen via JNI)**: Direct memory buffer sharing eliminates Java GC stutter, keeping CPU usage $< 4\%$ and battery drain $< 2.5\%/\text{hr}$.
7. **Enterprise ROS2 Ready**: Native C++ node streaming dead reckoning odometry to autonomous AGVs and robotics fleets.

---

## 📂 Project Documentation & Engineering Guides

Detailed documentation has been generated in the [`docs/`](file:///c:/Users/Manthan/Desktop/SIH168/docs/) directory:

| Document | Description | Link |
| :--- | :--- | :--- |
| **Product Requirements Document (PRD)** | Detailed user personas, functional/non-functional requirements, UX workflows, competitive matrix, and success KPIs. | [PRD.md](file:///c:/Users/Manthan/Desktop/SIH168/docs/PRD.md) |
| **Technical Requirements Document (TRD)** | Deep mathematical formulation, ESKF state equations, Auto-Calibration PCA/LPF math, HMM Viterbi formulation, JNI C++ architecture. | [TRD.md](file:///c:/Users/Manthan/Desktop/SIH168/docs/TRD.md) |
| **AI & ML Architecture** | 1D-TCN neural topology, IO-VNBD dataset pipeline, multi-task loss, spectral ZUPT harmonic analysis, INT8 quantization & NNAPI acceleration. | [AI_ARCHITECTURE.md](file:///c:/Users/Manthan/Desktop/SIH168/docs/AI_ARCHITECTURE.md) |
| **Project Roadmap & Timeline** | 6-phase development roadmap, Gantt chart, sprint tasks, team ownership matrix, risk mitigation, and SIH Grand Finale verification checklist. | [ROADMAP.md](file:///c:/Users/Manthan/Desktop/SIH168/docs/ROADMAP.md) |
| **Technology Stack & Tools Guide** | Comprehensive guide to free/open-source tools (MapLibre, OSM, Eigen, TFLite), prerequisites, and setup instructions. | [TECH_STACK_AND_TOOLS_GUIDE.md](file:///c:/Users/Manthan/Desktop/SIH168/docs/TECH_STACK_AND_TOOLS_GUIDE.md) |
| **Repository Folder Blueprint** | Advanced folder architecture, modular boundary contracts, and end-to-end data flow diagrams. | [FOLDER_STRUCTURE.md](file:///c:/Users/Manthan/Desktop/SIH168/docs/FOLDER_STRUCTURE.md) |
| **Internal Module API Contracts** | Signature definitions for Calibration, Virtual Odometer, FusionCore, and MapMatcher interfaces. | [API.MD](file:///c:/Users/Manthan/Desktop/SIH168/docs/API.MD) |
| **Code Style & Linters** | Multi-language coding standards for Kotlin, C++, Python, and commit conventions. | [CODE-STYLE.md](file:///c:/Users/Manthan/Desktop/SIH168/docs/CODE-STYLE.md) |
| **Security & Threat Model** | Data classification, least-privilege Android permissions, model verification, and safety-critical failure mitigations. | [SECURITY.md](file:///c:/Users/Manthan/Desktop/SIH168/docs/SECURITY.md) |

---

## 🔬 System Architecture Diagram

```
+---------------------------------------------------------------------------------------------------------+
|                                      NAVICORE AI ARCHITECTURE PIPELINE                                  |
+---------------------------------------------------------------------------------------------------------+
|   [6-DOF IMU @ 100 Hz] ──► [Auto-Calibration: LPF + PCA] ──► R_b^v (Dynamic Phone Mount Alignment)      |
|                                         │                                                               |
|             ┌───────────────────────────┴───────────────────────────┐                                   |
|             ▼                                                       ▼                                   |
|   [Path A: Non-Holonomic Physics]                        [Path B: AI Virtual Odometer]                  |
|   (Forces Vy = 0, Vz = 0)                                (1D-TCN INT8 predicts Vx & Pothole Filtering)  |
|             │                                                       │                                   |
|             └───────────────────────────┬───────────────────────────┘                                   |
|                                         ▼                                                               |
|                         [AI ZUPT Idle Engine Classifier]                                                |
|                         (Locks V = 0.00 m/s in Traffic Stops)                                           |
|                                         │                                                               |
|                                         ▼                                                               |
|                  [15-State Error-State Kalman Filter (ESKF)]                                            |
|                  (Open Sky: Learns Biases | Blackout: AI Speed + NHC)                                   |
|                                         │                                                               |
|                                         ▼                                                               |
|                  [Offline HMM Map-Matching Engine (OSM)]                                                |
|                  (Viterbi Lane Snapping & Road Topology Alignment)                                      |
|                                         │                                                               |
|                                         ▼                                                               |
|              [Smooth 10 Hz Kotlin UI]  &  [ROS2 Edge Robotics Node]                                     |
+---------------------------------------------------------------------------------------------------------+
```

---

## 📊 Comparative Performance Matrix

| Feature | Standard Google Maps / MapmyIndia | Hardware INS (OBD-II / CAN-bus) | NaviCore AI (Our Solution) |
| :--- | :--- | :--- | :--- |
| **Tracking in Tunnels / Basements** | ❌ No (Freezes / Jumps) | ✅ Yes | **✅ Yes (Sub-10% Drift)** |
| **Hardware Required** | Smartphone | Dedicated OBD-II Unit | **Smartphone (100% Software)** |
| **Cost** | Free (Fails in blackout) | ₹20,000 – ₹1,00,000+ | **Free / Zero Hardware Cost** |
| **2-Wheeler / Auto Support** | ❌ Inaccurate in shade | ❌ No OBD-II port | **✅ Universal Support** |
| **AI Pothole / Shock Filter** | ❌ No | ❌ No | **✅ Yes (1D-TCN AI)** |
| **Traffic Jam Idle Freeze** | ❌ No (Drifts randomly) | ❌ No | **✅ Yes (ZUPT Engine)** |
| **Arbitrary Mounting Angle** | N/A | ❌ Fixed rigid mount only | **✅ Yes (Auto LPF + PCA)** |
| **Offline Edge Execution** | ⚠️ Partial | ✅ Yes | **✅ 100% Local On-Device** |
| **ROS2 Robotics Ready** | ❌ No | ✅ Yes | **✅ Yes (C++ Node Included)** |

---

## 👥 Team Information
- **Team Name**: @enigm@ (Team ID: 132834)
- **Problem Statement ID**: 260168
- **Category**: Smart Vehicles (Software)
