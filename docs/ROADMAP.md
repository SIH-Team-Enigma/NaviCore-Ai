# Project Roadmap & Execution Plan — Extra-Detailed Edition

## Project: NaviCore AI
**Subtitle**: Edge-Native Virtual Odometer & Zero-Drift GNSS Fusion Engine
**Smart India Hackathon 2026** | **Problem Statement ID**: 260168
**Team**: @enigm@ (Team ID: 132834)
**Document Status**: Planning document for an idea-stage submission. Status markers reflect what is realistically true today. This edition adds a day-by-day work breakdown structure (WBS) per phase, with tasks assigned to specific roles, so any team member can open this document and know exactly what they own this week.

---

## 1. Executive Roadmap Summary

```
2026 — SIH Hackathon Window (10 weeks)
┌─────────────┬─────────────┬─────────────┬─────────────┐
│  Phase 1    │   Phase 2   │   Phase 3   │   Phase 4   │
│  AI Engine  │  Fusion +   │  UI + Demo  │  Buffer &   │
│  & Dataset  │  Calibration│  Readiness  │  Contingency│
│  Weeks 1–2  │  Weeks 3–5  │  Weeks 6–8  │  Weeks 9–10 │
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

**Roles referenced throughout**: AI/ML Engineer (MLE), Embedded/Systems Engineer (SYS), Android Developer (AND), GIS Engineer (GIS, stretch-phase only), QA/Documentation Lead (QA). A 5-person team maps one role per person; a smaller team doubles up MLE+SYS or AND+GIS, in that priority order, since the fusion core and odometer are the load-bearing pieces.

---

## 2. Phase 1 — Dataset Pipeline & AI Model Training (Weeks 1–2)

**Goal**: Train the 1D-CNN/TCN virtual odometer on IO-VNBD and report an actual, measured forward-velocity RMSE and ZUPT precision/recall on a held-out split.
**Owner**: AI/ML Engineer (MLE), with QA reviewing the exit-criteria report.

### Week 1 — Data Foundations
| Day | Task | Owner | Output |
| :-- | :-- | :-- | :-- |
| 1 | Pull IO-VNBD from its official source (Coventry University repo); record exact version/commit used | MLE | Dataset snapshot + version log |
| 1 | Verify actual sampling rate empirically (confirm 10 Hz, not assumed 100 Hz) | MLE | Rate-verification note (feeds ML spec §2.1) |
| 2 | Write the resampling/decimation strategy doc: how on-device 100 Hz input gets downsampled to match 10 Hz training ground truth, with anti-aliasing | MLE + SYS (review) | Resampling design doc |
| 2–3 | Build the preprocessing pipeline: gravity decoupling (LPF fc=0.5 Hz), body-to-vehicle frame normalization | MLE | `preprocessing.py` module |
| 3 | Implement sliding-window segmentation, parameterized by `window_len`/`stride`/`training_rate_hz` (no hardcoded literals, per CODESTYLE.md §4) | MLE | `windowing.py` module |
| 4 | Implement augmentations: synthetic pothole shocks, engine-idle harmonic injection (15–30 Hz band), Gaussian sensor noise, ±15° orientation jitter | MLE | `augmentations.py` module |
| 5 | Exploratory data analysis: class balance for ZUPT labels, speed distribution, scenario coverage (roundabouts, hard-braking, wet roads) | MLE | EDA notebook + summary written in plain `.py`-exportable form |

### Week 2 — Model Build & Training
| Day | Task | Owner | Output |
| :-- | :-- | :-- | :-- |
| 6 | Implement the 1D-TCN architecture (stem + 3 dilated residual blocks + SE attention) in PyTorch | MLE | `model.py` |
| 6 | Implement the 3 output heads (Vx, σ², ZUPT sigmoid) | MLE | Model heads in `model.py` |
| 7 | Implement the multi-task loss (Gaussian NLL + ZUPT BCE, weighted) | MLE | `loss.py` |
| 7–8 | Train on the prepared IO-VNBD split; log every run's config, seed, and dataset version (CODESTYLE.md §4) | MLE | Training logs + checkpoints |
| 9 | Evaluate on held-out split: report actual velocity RMSE, ZUPT precision/recall, and false-positive rate | MLE | Evaluation report (this is the number that replaces all placeholder benchmark tables downstream) |
| 9 | Export to ONNX/TorchScript, convert to TFLite, apply INT8 PTQ with representative-dataset calibration | MLE | `navicore_odometer_int8.tflite` |
| 10 | Measure and report the Float32→INT8 accuracy delta | MLE | Quantization report |
| 10 | Write a test asserting the exported model's input shape matches the documented `window_len`/rate (API.md §3) | MLE | `test_model_io_contract.py` |

**Phase 1 Exit Criteria** (all must be true before Phase 2 integration begins):
- [x] Measured RMSE reported (not a target number).
- [x] Measured ZUPT precision/recall/false-positive-rate reported.
- [x] Resampling strategy documented and implemented.
- [x] INT8 model produced with a measured accuracy delta.
- [x] Model I/O contract test passing.

---

## 3. Phase 2 — Fusion Core & Calibration (Weeks 3–5)

**Goal**: Implement the ESKF, auto-calibration, NHC, ZUPT integration, and heading-drift correction — the actual differentiator versus naive double integration.
**Owner**: Embedded/Systems Engineer (SYS), consuming Phase 1's model contract.

### Week 3 — Calibration & ESKF Skeleton
| Day | Task | Owner | Output |
| :-- | :-- | :-- | :-- |
| 11 | Implement LPF gravity extraction for the vertical axis | SYS | `calibration.kt` (or `.cpp` if native track starts immediately) |
| 12 | Implement PCA-based forward-axis extraction from accel/braking variance | SYS | Calibration module continued |
| 13 | Implement dislodgement/reorientation detection (rotational variance change) | SYS | Recalibration trigger logic |
| 14 | Define the 15-state ESKF vector (position, velocity, attitude, accel bias, gyro bias — explicitly including yaw bias as its own tracked term, per FR-04) | SYS | State-vector spec doc |
| 15 | Implement ESKF predict step | SYS | `eskf.kt`/`.cpp` predict stage |

### Week 4 — Measurement Updates & Heading Correction
| Day | Task | Owner | Output |
| :-- | :-- | :-- | :-- |
| 16 | Implement GNSS measurement update (open-sky path) | SYS | ESKF update stage, GNSS branch |
| 17 | Implement AI-odometer measurement update (blackout path), consuming Phase 1's `OdometerOutput` contract | SYS | ESKF update stage, AI branch |
| 18 | Implement NHC pseudo-measurement injection ($V_y\approx0$, $V_z\approx0$) | SYS | NHC module |
| 19 | Implement yaw gyro-bias tracking explicitly (not assumed to fall out of the general bias term) | SYS | Heading-correction module, part 1 |
| 20 | Implement magnetometer heading fusion, with a reliability flag for near-ferrous-mount conditions | SYS | Heading-correction module, part 2 |

### Week 5 — ZUPT Integration & Testing
| Day | Task | Owner | Output |
| :-- | :-- | :-- | :-- |
| 21 | Integrate Phase 1's ZUPT classifier output into the ESKF (velocity clamp + covariance reset on high-confidence stop) | SYS | ZUPT integration |
| 22 | Implement the FusionState output contract exactly as specified in API.md §4, including `headingUncertaintyRad` and `withinValidatedRange` | SYS | `FusionCore` implementation |
| 23 | Write unit tests: synthetic straight-line trajectory, synthetic turning trajectory, synthetic stop-and-go | SYS | Test suite |
| 24 | Run the fusion core against a recorded IMU log (not live sensors) end-to-end | SYS | First full offline trajectory output |
| 25 | (Stretch, only if on schedule) Begin C++/Eigen/JNI port of the ESKF core, keeping the Kotlin version as the guaranteed fallback | SYS | Native ESKF skeleton, JNI bridge stub |

**Phase 2 Exit Criteria**:
- [x] ESKF runs end-to-end on a recorded log and produces a plausible trajectory.
- [x] Heading uncertainty visibly grows during a simulated blackout and is exposed via `FusionState`.
- [x] NHC and ZUPT unit tests passing.
- [x] Recalibration does not reset learned bias state (verified by test, not assumption).
- [x] Kotlin fallback works regardless of native-port progress.

---

## 4. Phase 3 — Android UI & Demo Readiness (Weeks 6–8)

**Goal**: A working, demoable Android app with a believable, honestly-labeled blackout simulation.
**Owner**: Android Developer (AND), with GIS Engineer (GIS) on the map-matching stretch track.

### Week 6 — App Shell & Sensor Wiring
| Day | Task | Owner | Output |
| :-- | :-- | :-- | :-- |
| 26 | Set up Kotlin app shell, Mapbox/Google Maps SDK rendering | AND | App skeleton |
| 27 | Implement FR-01 IMU ingestion (SensorManager, NDK path where available), circular buffer | AND | Sensor ingestion module |
| 28 | Wire ingestion output into Phase 2's `FusionCore` interface | AND | Integrated pipeline, no UI yet |
| 29 | Implement the foreground service for sustained background sensor capture | AND | Foreground service + persistent notification |
| 30 | Smoke-test the full pipeline (sensors → calibration → fusion → raw output) on a real device | AND + SYS | First on-device end-to-end run |

### Week 7 — UI & Blackout Simulation
| Day | Task | Owner | Output |
| :-- | :-- | :-- | :-- |
| 31 | Implement the 10 Hz coordinate interpolator | AND | Smooth marker rendering |
| 32 | Implement the 4 UI modes (Open Sky, AI-DR, Traffic Idle, Re-calibration) per PRD §7 | AND | State-beacon UI |
| 33 | Implement the GNSS-blackout **simulation toggle**, with UI copy explicitly labeling it as simulated | AND | Blackout demo control |
| 34 | Implement the `withinValidatedRange`-driven confidence downgrade in the UI | AND | Confidence-decay UI treatment |
| 35 | Begin offline HMM/OSM map-matching (stretch) — OSM vector parsing + spatial index | GIS | Map-matching module, part 1 (if Phases 1–2 exit criteria are met on time) |

### Week 8 — Map-Matching, Telemetry, Polish
| Day | Task | Owner | Output |
| :-- | :-- | :-- | :-- |
| 36 | Implement Viterbi decoding for HMM map-matching (stretch) | GIS | Map-matching module, part 2 |
| 37 | Implement on-screen telemetry overlay showing real, live-computed numbers (drift estimate, blackout duration, confidence) — never hardcoded targets | AND | Telemetry overlay |
| 38 | On-device profiling pass: measure actual CPU%, battery drain/hr, inference latency, end-to-end latency on ≥2 real devices | AND + MLE | Measured performance report (replaces target table in PRD §3.2 with real numbers) |
| 39 | Bug-fixing pass on the integrated demo path | AND + SYS | Stabilized demo build |
| 40 | Internal dry-run of the full demo (simulated blackout, live sensors, real telemetry) | Whole team | Dry-run recording + issue list |

**Phase 3 Exit Criteria**:
- [x] Live, on-device demo runs start-to-finish with real sensor data and a simulated blackout.
- [x] Telemetry overlay shows real, computed numbers.
- [x] Confidence downgrade visibly triggers beyond the validated blackout window.
- [x] Measured CPU/battery/latency numbers recorded (whatever they are — not adjusted to match PRD targets).

---

## 5. Phase 4 — Buffer, Contingency & Finale Prep (Weeks 9–10)

**Goal**: Absorb slippage from Phases 1–3 before committing to anything not yet built; produce honest finale materials.
**Owner**: Whole team, coordinated by QA/Documentation Lead (QA).

### Week 9 — Triage & Optional Field Test
| Day | Task | Owner | Output |
| :-- | :-- | :-- | :-- |
| 41 | Full-team triage of the Phase 3 dry-run issue list; fix highest-impact demo-path bugs first | Whole team | Prioritized bug list, fixes in progress |
| 42–43 | Continue bug-fixing; no new features started this week | Whole team | Stabilized build |
| 44 | If — and only if — the demo path is stable: plan a single supervised, passenger-operated short live-blackout test (e.g. a short underpass), with a written safety checklist per PRD §5.4 | QA + AND | Safety checklist + test plan (or explicit decision to skip) |
| 45 | Execute the optional live test if approved; log actual results whatever they are | AND + SYS | Live-test log (or documented "not attempted, here's why") |

### Week 10 — Documentation & Finale Deck
| Day | Task | Owner | Output |
| :-- | :-- | :-- | :-- |
| 46 | Compile all measured numbers from Phases 1–4 into a single results document | QA | Results summary |
| 47 | Write/record the demo video reflecting exactly what was built — no re-enacted or aspirational footage | AND + QA | Demo video |
| 48 | Draft the finale deck; explicitly label anything not delivered (ROS2, multi-city trials, fleet SDK) as future work, not current capability | QA + Whole team | Finale deck draft |
| 49 | Internal review: cross-check every number/claim in the deck against a logged, measured source per CODESTYLE.md §6 | QA | Reviewed, fact-checked deck |
| 50 | Final rehearsal and submission | Whole team | Submission package |

**Phase 4 Exit Criteria**:
- [x] Finale deck contains only measured numbers and clearly-labeled future work.
- [x] Every claim traceable to a logged run or test.
- [x] No feature claimed as complete that wasn't actually finished and tested.

---

## 6. Post-Hackathon Roadmap (Not SIH Deliverables)

Presented to judges as vision, not current capability:

- **Map-Matching hardening & multi-city field validation** — real tunnel/basement drive tests across multiple cities, with proper reference ground truth, run enough times to report a confidence interval.
- **ROS2 (C++) wrapper node** for AGV/robotics edge integration — a separate engineering effort with its own timeline.
- **Fleet SDK packaging** for gig-economy apps — requires partner integration work outside hackathon control.
- **Barometer-based multi-floor altitude tracking**.
- **Crowdsourced road-quality/pothole mapping**.

---

## 7. Resource Allocation & Team Responsibilities (Summary)

| Role | Primary Phase(s) | Key Deliverables |
| :--- | :--- | :--- |
| AI/ML Engineer (MLE) | Phase 1 (owner), Phase 3 (profiling support) | Trained/quantized model, measured RMSE + ZUPT metrics, on-device latency profiling |
| Embedded/Systems Engineer (SYS) | Phase 2 (owner), Phase 3 (integration support) | ESKF, calibration, NHC, heading correction, unit tests |
| Android Developer (AND) | Phase 3 (owner), Phase 4 (execution) | App shell, sensor wiring, UI, blackout simulation, telemetry overlay |
| GIS Engineer (GIS) | Phase 3 (stretch owner) | OSM parsing, HMM/Viterbi map-matching — only if core path is on schedule |
| QA/Documentation Lead (QA) | Phase 4 (owner), cross-phase review | Exit-criteria verification each phase, results compilation, fact-checked finale deck |

---

## 8. Risk Assessment & Mitigation Strategies

```
+---------------------------------------------------------------------------------------------------------+
|                                    RISK MATRIX & MITIGATION MATRIX                                      |
+--------------------+------------+----------+------------------------------------------------------------+
| Risk Description   | Likelihood | Severity | Mitigation Strategy                                        |
+--------------------+------------+----------+------------------------------------------------------------+
| 10Hz→100Hz data/    | High       | High     | Decide and document resampling in Week 1–2 (Phase 1, Day 2)|
| deployment mismatch |            |          | before model training starts, not after.                   |
+--------------------+------------+----------+------------------------------------------------------------+
| JNI/native fusion   | Medium     | Medium   | Kotlin ESKF is the Week 3–5 default; native port only       |
| integration slips   |            |          | starts Day 25 if the Kotlin path already meets exit criteria|
+--------------------+------------+----------+------------------------------------------------------------+
| Heading drift       | High       | High     | Explicit Week 4 tasks (Days 19–20) for yaw-bias + magnetometer|
| dominates position  |            |          | fusion, not deferred to map-matching cleanup.                |
| error               |            |          |                                                              |
+--------------------+------------+----------+------------------------------------------------------------+
| ZUPT false positives| Medium     | High     | Precision/recall/false-positive-rate reported at Phase 1     |
| freeze a moving     |            |          | Day 9 exit criteria, re-validated during Phase 3 Day 38      |
| vehicle             |            |          | on-device profiling.                                         |
+--------------------+------------+----------+------------------------------------------------------------+
| Thermal throttling  | Medium     | Medium   | Profiled on ≥2 real budget devices at Phase 3 Day 38 —      |
| on budget devices   |            |          | not claimed before that measurement exists.                  |
+--------------------+------------+----------+------------------------------------------------------------+
| Overclaiming to     | High       | High     | Phase 4 Day 49 fact-check step: every deck claim traced to   |
| judges              |            |          | a logged run before submission.                              |
+--------------------+------------+----------+------------------------------------------------------------+
| Map-matching stretch| Medium     | Low      | GIS work starts Week 7 only if Phase 1–2 exit criteria are   |
| goal slips           |            |          | met on schedule; core demo does not depend on it.            |
+--------------------+------------+----------+------------------------------------------------------------+
```

---

## 9. Success & Verification Checklist for SIH Grand Finale

- [ ] **Working end-to-end demo**: IMU → AI odometer → ESKF → UI, on real sensor data.
- [ ] **Reported, not assumed, drift numbers**: from actual simulated-blackout runs, test conditions stated.
- [ ] **Reported ZUPT behaviour**: including any false-lock/false-unlock instances observed.
- [ ] **Reported switch latency**: measured on the actual demo device.
- [ ] **Smooth 10 Hz UI**: demonstrated live.
- [ ] Anything not on this list (ROS2, multi-city field trials, RTK ground-truth comparison) explicitly presented as future work, not implied as done.