# SECURITY.md — Extra-Detailed Edition

## Project: NaviCore AI
**Scope**: Android application, on-device ML pipeline (TFLite), native fusion core (C++/Eigen/JNI, stretch), and the post-hackathon ROS2 extension.
**Status**: Idea-stage security baseline, mapped onto the Roadmap's 4-phase, 10-week build so each control has an owner and a week, not just an abstract requirement.

---

## 1. Data Classification

| Data | Sensitivity | Where it lives | Introduced In Phase |
| :--- | :--- | :--- | :--- |
| Raw IMU stream (accel/gyro) | Medium | On-device only, in-memory circular buffer | Phase 3 (FR-01 ingestion) |
| GNSS position/velocity | High | On-device only | Phase 2 (ESKF GNSS update) |
| Magnetometer readings | Low–Medium | On-device only | Phase 2 (heading correction, Days 19–20) |
| Trained model weights (.tflite) | Low (IP-sensitive, not personal) | App bundle | Phase 1 (Day 9–10 export) |
| Calibration state (rotation matrix, biases) | Low | On-device, per-session | Phase 2 (Days 11–15) |
| Trip telemetry / road-quality export | High | Opt-in, on-device by default | Post-hackathon (not built in SIH scope) |
| OSM map tiles (offline cache) | Public | On-device | Phase 3 (map-matching stretch, Days 35–36) |

**Principle**: everything in the MUST-HAVE feature set is fully offline by design (PRD §5.3). Nothing in the core Phase 1–3 build path should request a network permission.

---

## 2. Threat Model

### 2.1 In scope, with the phase that must address it
- **Local data exposure** (Phase 3): another app or a malicious actor with device access reading IMU/GPS logs, calibration state, or cached routes off disk. Addressed by Section 4's storage rules, implemented alongside FR-01/FR-02 in Phase 3.
- **Permission over-reach** (Phase 3): the app requesting more Android permissions than the MUST-HAVE scope needs. Addressed by Section 3, reviewed at the Phase 3 Day 39 bug-fixing pass.
- **Supply-chain risk** (all phases): compromised third-party libraries or a poisoned public training dataset. Addressed by Section 6, starting with the Phase 1 Day 1 dataset-version logging step.
- **Model tampering** (Phase 1 export → Phase 3 integration): a modified `.tflite` substituted to produce plausible-but-wrong velocity. Addressed by Section 4's checksum verification, implemented when the model is bundled into the app in Phase 3.
- **GNSS spoofing/jamming poisoning the ESKF bias** (Phase 2): the open-sky bias-learning path (Roadmap Phase 2, Day 16) trusts GNSS as ground truth; a spoofed fix could poison the learned bias. Addressed by Section 2.1's mitigation below.
  - *Mitigation detail*: the ESKF's GNSS update step should sanity-check incoming fixes against HDOP/satellite-count thresholds (PRD §4.1 SHOULD-HAVE GNSS quality indexer) before trusting them for bias updates — a fix that looks anomalous (e.g. an implausible speed jump) should be down-weighted, not blindly fused.

### 2.2 Explicitly out of scope for the SIH prototype
- Nation-state-level GNSS jamming/spoofing defense (relevant to the ROS2/defense persona — PRD §2.2 — but that persona is post-hackathon).
- Server-side security (no server exists in MUST-HAVE scope).
- Physical device security (theft, lock-screen bypass) — standard Android OS responsibility.

---

## 3. Android Permissions — Least Privilege (Phase 3 implementation)

| Permission | Needed for | Roadmap Task | Justification discipline |
| :--- | :--- | :--- | :--- |
| `ACCESS_FINE_LOCATION` | GNSS fix for ESKF open-sky fusion | Phase 3, Day 26 (app shell) | Required; request at runtime with a clear in-app explanation |
| `HIGH_SAMPLING_RATE_SENSORS` (Android 12+) | IMU sampling above default OS throttle | Phase 3, Day 27 (sensor ingestion) | Only request if the target device actually benefits — verify per device |
| Foreground service permission | Keep sensor ingestion alive during navigation | Phase 3, Day 29 | Required for a navigation app; persistent, honest notification while active |
| Storage (scoped) | Offline OSM tile cache | Phase 3, Day 35–36 (map-matching stretch) | Scoped storage / app-private directory only |

**Explicitly do not request**: contacts, SMS, microphone, camera, background network access for the core app, or any permission not traceable to a MUST-HAVE feature. New permissions require a justification entry added to this table before they ship — a Phase 4 Day 49 review checks this.

---

## 4. Secure Storage & Handling

**Phase 3 implementation checklist** (owner: Android Developer, reviewed by whole team at Day 39):
1. IMU circular buffer (FR-01) and calibration state stay in-memory by default; do not persist to disk unless a specific feature needs it.
2. If persisted (e.g. crash-recovery of calibration), use `EncryptedSharedPreferences` or an encrypted local database — not plaintext files.
3. No raw IMU/GPS logs shipped off-device by default; any future telemetry export (post-hackathon) must be opt-in with explicit, plain-language disclosure.
4. Verify the `.tflite` model's checksum at load time (implemented when the model is bundled, Phase 3 Day 26–28); a checksum mismatch triggers a safe degraded mode — NHC + last-known ESKF bias, no AI odometer — rather than silently running an unverified model.

---

## 5. Telemetry & Opt-In Data Sharing (Post-Hackathon Feature — Design Now, Build Later)

Documented here so it isn't retrofitted without review. Any future feature sending data off-device must:
1. Be off by default.
2. Show the user exactly what leaves the device in plain language.
3. Be toggleable at any time without breaking core navigation.
4. Coarsen/aggregate location (e.g. grid-cell aggregation) before it leaves the device, if the feature only genuinely needs aggregate data rather than raw trajectories.

---

## 6. Supply-Chain & Dependency Hygiene, By Phase

| Phase | Task | Detail |
| :--- | :--- | :--- |
| Phase 1, Day 1 | Pin and log the IO-VNBD dataset version | Use the official Coventry University / GitHub source; record the exact commit, since model behaviour is safety-relevant |
| Phase 1, ongoing | Pin Python dependency versions (PyTorch, SciPy, etc.) | `requirements.txt`/lockfile checked in |
| Phase 2, Day 11–25 | Pin/vendor Eigen and any C++ dependencies pulled via JNI | Native layer has the broadest memory-safety attack surface (CODESTYLE.md §3) |
| Phase 3, Day 26 | Pin TFLite runtime, Mapbox/Google Maps SDK, all Kotlin/Java dependencies | Review license and maintenance status before adding anything touching sensor/location data |
| Post-hackathon | ROS2 topic security review | `/navicore/odom`, `/navicore/pose`, `/navicore/status` (see API.md §6) should only run on a local, trusted robotics bus, never an unauthenticated open network |

---

## 7. Safety-Relevant Failure Modes, By Phase

These sit at the intersection of security and functional safety (PRD §5.4):

- **ZUPT false-positive lock** (Phase 1 classifier, Phase 2 integration): a wrongly-triggered "stopped" state freezes the displayed position while the vehicle moves. Mitigation: report precision/recall/false-positive-rate at Phase 1 Day 9; the UI (Phase 3) must show uncertainty, not silent confidence, when classifier confidence is borderline.
- **Heading drift silently accepted** (Phase 2, Days 19–20): an unbounded, uncorrected heading error should trigger a UI warning ("accuracy degraded") rather than a confident-looking marker. Implemented via `headingUncertaintyRad` (API.md §4), surfaced in the Phase 3 UI.
- **Blackout duration beyond the validated range** (PRD §3.1 caps validated claims at ~60–120 s): the Phase 3 UI must visibly communicate reduced confidence via `withinValidatedRange` (API.md §4) rather than keep displaying a precise-looking marker.

**Phase 4 Day 49 review step**: cross-check that every safety-relevant UI behaviour above is actually implemented and demonstrable, not just documented, before the finale submission.

---

## 8. Reporting & Disclosure

Not required for the Phase 1–4 hackathon prototype without a public release. Before any post-hackathon public/commercial release:
- Publish a security-contact channel.
- Publish a basic responsible-disclosure policy.
- Add dependency scanning (`pip-audit`, equivalent JS/Android tooling) to CI.