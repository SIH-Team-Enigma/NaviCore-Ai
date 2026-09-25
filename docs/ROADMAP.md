# Project Roadmap & Execution Plan

## Project: NaviCore AI
**Subtitle**: Edge-Native Virtual Odometer & Zero-Drift GNSS Fusion Engine
**Smart India Hackathon 2026** | **Problem Statement ID**: 260168
**Team**: @enigm@ (Team ID: 132834)
**Document Status**: Planning document for an idea-stage submission. Status markers below reflect what is realistically true today, not a completed build.

---

## 1. Executive Roadmap Summary

NaviCore AI's plan is intentionally sequenced so that a working, honestly-scoped MVP exists early, with stretch features layered on only if time allows. Robotics/enterprise extensions and full field validation are explicitly **post-hackathon**, not part of the 10-week SIH cycle.

```
2026 — SIH Hackathon Window (10 weeks)
┌─────────────┬─────────────┬─────────────┬─────────────┐
│  Phase 1    │   Phase 2   │   Phase 3   │   Phase 4   │
│  AI Engine  │  Fusion +   │  UI + Demo  │  Buffer &   │
│  & Dataset  │  Calibration│  Readiness  │  Contingency│
└─────────────┴─────────────┴─────────────┴─────────────┘
                         │
                         ▼
        Post-Hackathon (not part of SIH deliverable)
┌─────────────┬─────────────┬─────────────┐
│ Map-Matching│  ROS2 /     │ Commercial  │
│ & Field     │  Robotics   │ SDK & Scale │
│ Validation  │  Extension  │             │
└─────────────┴─────────────┴─────────────┘
```

---

## 2. Detailed Phase Breakdown (SIH Window)

### Phase 1: Dataset Pipeline & AI Model Training (Weeks 1–2)
- **Goal**: Train the 1D-CNN/TCN virtual odometer on IO-VNBD and report actual (not assumed) forward-velocity RMSE on a held-out split.
- **Key Milestones**:
  - [x] IO-VNBD dataset ingestion and inspection. *(IO-VNBD is sampled at 10 Hz, not 100 Hz — see note below.)*
  - [ ] Resampling/interpolation strategy to bridge 10 Hz training data and a 100 Hz (or best-achievable) on-device inference rate — **must be decided and documented before training**, not assumed away.
  - [ ] Data augmentation pipeline (pothole noise injection, engine-idle harmonics, orientation perturbation).
  - [ ] PyTorch 1D-TCN with SE residual blocks — architecture drafted, training not yet run.
  - [ ] Multi-task loss (velocity NLL + ZUPT BCE) implementation.
  - [ ] Post-training INT8 quantization, with reported (not assumed) accuracy delta vs. Float32.
  - [ ] **Deliverable**: a measured velocity RMSE number on held-out IO-VNBD data, reported honestly even if it's mediocre.

### Phase 2: Fusion Core & Calibration (Weeks 3–5)
- **Goal**: Implement the ESKF, auto-calibration, and heading-drift correction — the actual differentiator versus naive double integration.
- **Key Milestones**:
  - [ ] 15-state Error-State Kalman Filter (Eigen, C++ or a Kotlin/Java prototype if native integration risks the timeline).
  - [ ] LPF gravity extraction + PCA heading auto-calibration.
  - [ ] Heading/yaw drift correction (gyro-bias tracking + magnetometer fusion) — elevated to a Phase-2 priority, not deferred to map-matching.
  - [ ] NHC and AI-ZUPT velocity injection routines.
  - [ ] JNI bridge — **stretch goal**; a pure-Kotlin fallback should exist so the demo isn't blocked on native integration succeeding.
  - [ ] TFLite runtime integration with NNAPI delegate where available, CPU fallback otherwise.

### Phase 3: Android UI & Demo Readiness (Weeks 6–8)
- **Goal**: A working, demoable Android app with a believable, honestly-labeled blackout simulation.
- **Key Milestones**:
  - [ ] Kotlin app with Mapbox/Google Maps SDK rendering.
  - [ ] 10 Hz smooth coordinate interpolation and state beacon (Open-Sky / AI-DR / ZUPT).
  - [ ] GNSS-blackout **simulation toggle** for judge demonstration — clearly labeled in the demo as simulated, not a live tunnel.
  - [ ] Offline HMM/OSM map-matching — **stretch goal**, only if Phases 1–2 land on schedule.
  - [ ] Drift/error telemetry overlay showing real numbers from the running session, not hardcoded target values.

### Phase 4: Buffer, Contingency & Finale Prep (Weeks 9–10)
- **Goal**: Absorb slippage from Phases 1–3 before committing to anything not yet built.
- **Key Milestones**:
  - [ ] Fix whatever is broken in the core demo path first — no new features start here.
  - [ ] If time remains: a single supervised, passenger-operated short live-blackout test (e.g., an underpass or short tunnel) — optional, safety-reviewed, and only claimed if it actually happens.
  - [ ] Documentation and video walkthrough reflecting what was actually built.
  - [ ] Explicitly do **not** promise ROS2, multi-city field trials, or a fleet SDK in the finale materials unless already delivered.

---

## 3. Post-Hackathon Roadmap (Not SIH Deliverables)

These are legitimate future directions and should be presented to judges as vision, not current capability:

- **Map-Matching hardening & multi-city field validation** — real tunnel/basement drive tests across multiple cities, with proper reference ground truth (e.g., a second RTK-capable device or a mapped reference route), run enough times to report a confidence interval rather than a single number.
- **ROS2 (C++) wrapper node** for AGV/robotics edge integration — genuinely useful, but a separate engineering effort from the smartphone app and should not share a timeline with it.
- **Fleet SDK packaging** for gig-economy apps (Zomato, Swiggy, Uber, etc.) — requires partner integration work outside the hackathon's control.
- **Barometer-based multi-floor altitude tracking** for flyover/basement layer disambiguation.
- **Crowdsourced road-quality/pothole mapping** — a plausible extension once the core odometer is validated.

---

## 4. Milestones & Timeline (Honest Gantt)

```
+---------------------------------------------------------------------------------------------------------+
|                                    NAVICORE AI SIH 2026 TIMELINE                                        |
+------------------------------+----+----+----+----+----+----+----+----+----+----+------------------------+
| Task Name                    | W1 | W2 | W3 | W4 | W5 | W6 | W7 | W8 | W9 | W10| Status                 |
+------------------------------+----+----+----+----+----+----+----+----+----+----+------------------------+
| IO-VNBD Ingestion & Analysis | ██ | ██ |    |    |    |    |    |    |    |    | In Progress            |
| Resampling Strategy (10→100Hz)|    | ██ |    |    |    |    |    |    |    |    | Planned                |
| 1D-TCN Model Training         |    | ██ | ██ |    |    |    |    |    |    |    | Planned                |
| INT8 Quantization & NNAPI     |    |    |    | ██ |    |    |    |    |    |    | Planned                |
| C++/Kotlin ESKF + Auto-Calib  |    |    | ██ | ██ | ██ |    |    |    |    |    | Planned                |
| Heading/Yaw Drift Correction  |    |    |    | ██ | ██ |    |    |    |    |    | Planned                |
| JNI Bridge (stretch)          |    |    |    |    | ██ |    |    |    |    |    | Stretch / At Risk      |
| Kotlin 10 Hz Navigation UI    |    |    |    |    |    | ██ | ██ |    |    |    | Planned                |
| Offline OSM & HMM Matching    |    |    |    |    |    |    | ██ | ██ |    |    | Stretch                |
| Demo Simulation & Telemetry   |    |    |    |    |    |    |    | ██ | ██ |    | Planned                |
| Buffer / Bug Fixing           |    |    |    |    |    |    |    |    | ██ | ██ | Planned                |
| Optional Supervised Live Test |    |    |    |    |    |    |    |    |    | ██ | Optional / Not Promised|
| SIH Grand Finale Demo Deck    |    |    |    |    |    |    |    |    |    | ██ | Planned                |
+------------------------------+----+----+----+----+----+----+----+----+----+----+------------------------+
```
Legend: `██` = active work window. Status column reflects real intent, not a completed build.

---

## 5. Resource Allocation & Team Responsibilities

| Team Member Role | Focus Area | Key Deliverables |
| :--- | :--- | :--- |
| **AI / ML Engineer** | Neural Virtual Odometer, Quantization | 1D-TCN model, INT8 export, ZUPT classifier, measured RMSE report |
| **Embedded / Systems Engineer** | Fusion Core | ESKF, auto-calibration, heading correction, NHC — Kotlin-first with native as stretch |
| **Android Developer** | App & Demo | Kotlin UI, sensor ingestion, blackout-simulation toggle, telemetry overlay |
| **GIS Engineer (stretch)** | Map-Matching | OSM parsing, HMM/Viterbi — only if core path is on schedule |
| **QA / Documentation** | Validation & Reporting | Honest benchmark reporting, demo video, technical write-up |

---

## 6. Risk Assessment & Mitigation Strategies

```
+---------------------------------------------------------------------------------------------------------+
|                                    RISK MATRIX & MITIGATION MATRIX                                      |
+--------------------+------------+----------+------------------------------------------------------------+
| Risk Description   | Likelihood | Severity | Mitigation Strategy                                        |
+--------------------+------------+----------+------------------------------------------------------------+
| 10Hz→100Hz data/    | High       | High     | Decide and document a resampling approach in Week 1–2,     |
| deployment mismatch |            |          | before model training starts, not after.                   |
+--------------------+------------+----------+------------------------------------------------------------+
| JNI/native fusion   | Medium     | Medium   | Build a pure-Kotlin ESKF fallback first; treat native C++  |
| integration slips   |            |          | as a stretch optimization, not a demo dependency.           |
+--------------------+------------+----------+------------------------------------------------------------+
| Heading drift       | High       | High     | Prioritize gyro-bias + magnetometer fusion in Phase 2       |
| dominates position  |            |          | rather than relying on map-matching to mask it.             |
| error               |            |          |                                                              |
+--------------------+------------+----------+------------------------------------------------------------+
| ZUPT false positives| Medium     | High     | Report classifier precision/recall explicitly; a false      |
| freeze a moving     |            |          | lock is worse for user trust than a small drift.            |
| vehicle             |            |          |                                                              |
+--------------------+------------+----------+------------------------------------------------------------+
| Thermal throttling  | Medium     | Medium   | Profile on at least two real budget devices before          |
| on budget devices   |            |          | publishing any CPU/battery number.                          |
+--------------------+------------+----------+------------------------------------------------------------+
| Overclaiming to     | High       | High     | Only present what is actually built and measured; label     |
| judges              |            |          | simulated results as simulated, targets as targets.         |
+--------------------+------------+----------+------------------------------------------------------------+
```

---

## 7. Success & Verification Checklist for SIH Grand Finale — *rewritten to be honest*

- [ ] **Working end-to-end demo**: IMU → AI odometer → ESKF → UI, on real (not scripted) sensor data.
- [ ] **Reported, not assumed, drift numbers**: from actual simulated-blackout runs, with the test conditions stated.
- [ ] **Reported ZUPT behaviour**: including any false-lock or false-unlock instances observed during testing.
- [ ] **Reported switch latency**: measured on the actual device used for the demo, not a spec-sheet number.
- [ ] **Smooth 10 Hz UI**: demonstrated live, not claimed.
- [ ] Anything not on this list (ROS2, multi-city field trials, RTK ground-truth comparison) is explicitly presented as future work in the finale deck, not implied as done.