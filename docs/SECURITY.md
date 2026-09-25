# SECURITY.md

## Project: NaviCore AI
**Scope**: Android application, on-device ML pipeline (TFLite), native fusion core (C++/Eigen/JNI), and the post-hackathon ROS2 extension.
**Status**: Idea-stage security baseline — defines requirements the implementation must meet, not an audit of code that exists yet.

---

## 1. Data Classification

| Data | Sensitivity | Where it lives | Notes |
| :--- | :--- | :--- | :--- |
| Raw IMU stream (accel/gyro) | Medium | On-device only, in-memory circular buffer | Can reveal driving behaviour/route patterns if exfiltrated; not inherently identifying on its own |
| GNSS position/velocity | High | On-device only | Location data — treat as personal data under India's DPDP Act and any applicable local regulation |
| Magnetometer readings | Low–Medium | On-device only | Combined with IMU, can assist route reconstruction |
| Trained model weights (.tflite) | Low (IP-sensitive, not personal) | App bundle | No user data embedded; protect as intellectual property, not as PII |
| Calibration state (rotation matrix, biases) | Low | On-device, per-session | Not personally identifying in isolation |
| Trip telemetry / road-quality export (post-hackathon feature) | High | Opt-in, on-device by default | Only leaves the device if the user explicitly enables sharing (Section 5) |
| OSM map tiles (offline cache) | Public | On-device | No special handling required |

**Principle**: everything in the MUST-HAVE feature set (PRD §4.1) is designed to be fully offline. Nothing in the core dead-reckoning path requires network access, so nothing in that path should silently acquire a network permission.

---

## 2. Threat Model

### 2.1 In scope
- **Local data exposure**: another app or a malicious actor with device access reading IMU/GPS logs, calibration state, or cached routes off disk.
- **Permission over-reach**: the app requesting more Android permissions than the MUST-HAVE feature set needs (Section 3).
- **Supply-chain risk**: compromised third-party libraries (TFLite runtime, Mapbox/Maps SDK, Eigen, ROS2 packages) or a poisoned public training dataset.
- **Model tampering**: a modified `.tflite` file substituted to produce plausible-looking but wrong velocity estimates — safety-relevant given this feeds a navigation UI.
- **GNSS spoofing/jamming**: NaviCore AI's blackout-detection state machine must fail toward "trust GNSS less," not silently trust spoofed coordinates as ground truth for bias learning (ESKF §FR-07 in the PRD updates biases from GNSS — a spoofed fix could poison the learned bias).

### 2.2 Explicitly out of scope for the SIH prototype
- Nation-state-level GNSS jamming/spoofing defense (relevant to the ROS2/defense persona in the PRD, but that persona and the ROS2 integration are post-hackathon — see Roadmap §3).
- Server-side security (there is no server in the MUST-HAVE scope; if a future fleet SDK adds one, it needs its own threat model before shipping).
- Physical security of the phone itself (theft, lock-screen bypass) — standard Android OS responsibility, not NaviCore-specific.

---

## 3. Android Permissions — Least Privilege

Only request what the MUST-HAVE feature set (PRD §4.1) actually needs:

| Permission | Needed for | Justification discipline |
| :--- | :--- | :--- |
| `ACCESS_FINE_LOCATION` | GNSS fix for ESKF open-sky fusion | Required; request at runtime with a clear in-app explanation, not buried in a blanket onboarding flow |
| `HIGH_SAMPLING_RATE_SENSORS` (Android 12+) | IMU sampling above the default OS-throttled rate | Only request if the target device actually benefits; do not request unconditionally |
| Foreground service permission | Keep sensor ingestion alive during navigation | Required for a navigation app; must show a persistent, honest notification while active |
| Storage (scoped) | Offline OSM tile cache | Use scoped storage / app-private directory; do not request broad external storage access |

**Explicitly do not request**: contacts, SMS, microphone, camera, background network access for the core app, or any permission not traceable to a MUST-HAVE feature in the PRD. If a future feature needs a new permission, it gets added here with justification before it ships, not silently in a manifest diff.

---

## 4. Secure Storage & Handling

- **In-memory by default**: the 1.0 s IMU circular buffer (PRD FR-01) and calibration state should not be persisted to disk unless a feature explicitly needs it (e.g. crash-recovery of calibration).
- **If persisted**, use Android's `EncryptedSharedPreferences` or an encrypted local database (SQLCipher or equivalent) for anything derived from location/IMU history — not plaintext files.
- **No raw IMU/GPS logs shipped off-device** by default. The PRD's telemetry/road-quality export (COULD-HAVE / post-hackathon) must be opt-in, and the opt-in copy must say what's collected and why, not a generic "improve our service" line.
- **Model integrity**: ship the `.tflite` model with a checksum verified at load time, so a corrupted or substituted model fails closed (falls back to a safe degraded mode: NHC + last-known ESKF bias, no AI odometer) rather than silently running an unverified model.

---

## 5. Telemetry & Opt-In Data Sharing

Any feature that sends data off the device (crash reports, road-quality heatmaps, fleet SDK telemetry) must:
1. Be off by default.
2. Show the user, in plain language, exactly what leaves the device (e.g. "anonymized speed + road roughness by GPS grid cell, no raw video, no exact home/work addresses").
3. Allow the user to turn it off at any time without breaking core navigation.
4. Strip or coarsen location to a level that doesn't reconstruct a full personal route history (e.g. grid-cell aggregation) before it leaves the device, if the feature genuinely needs aggregate road-quality data rather than raw trajectories.

---

## 6. Supply-Chain & Dependency Hygiene

- **Training pipeline** (Python/PyTorch/SciPy): pin dependency versions; do not train on an unverified fork of IO-VNBD — use the dataset from its official source (Coventry University / the published GitHub repo) and record the exact commit/version used, since model behaviour is safety-relevant.
- **Mobile app**: pin TFLite runtime, Mapbox/Google Maps SDK, and any Kotlin/Java dependency versions; review license and maintenance status before adding a new library, especially for anything touching sensor or location data.
- **Native core**: Eigen and any C++ dependencies pulled via JNI should be vendored or pinned, not fetched unpinned at build time, given the native layer has the broadest memory-safety attack surface in the stack.
- **ROS2 extension (post-hackathon)**: out of scope for the SIH security baseline, but flagged here so it isn't retrofitted without its own review — ROS2 topics (`/navicore/odom`, `/navicore/pose`, see API.md) should not be exposed on an unauthenticated network interface in any deployment beyond a local, trusted robotics bus.

---

## 7. Safety-Relevant Failure Modes

These sit at the intersection of security and functional safety, called out because the PRD's NFR §5.4 already flags driver-safety concerns:

- **ZUPT false-positive lock** (PRD FR-06 / ML spec §4): a wrongly-triggered "vehicle stopped" state could show a frozen position while the vehicle is actually moving. This must fail toward showing uncertainty in the UI, not toward silent confidence.
- **Heading drift silently accepted**: per the ML spec's heading-correction section (§5A), an unbounded, uncorrected heading error should trigger a UI warning ("accuracy degraded") rather than continuing to render a confident-looking marker.
- **Blackout duration beyond the validated range** (PRD §3.1 caps validated claims at ~60–120 s): beyond that window, the UI must visibly communicate reduced confidence rather than keep displaying a precise-looking blue dot.

---

## 8. Reporting & Disclosure

Since this is a hackathon prototype without a public release yet, formal vulnerability-disclosure infrastructure (security.txt, bug bounty) is not required for Phase 1. Before any public/commercial release (Roadmap §3, post-hackathon), add:
- A published contact for security reports.
- A basic responsible-disclosure policy.
- Dependency scanning (e.g. `pip-audit`, `npm audit` equivalents, or Android's dependency-check tooling) in CI before it becomes a distributed app.