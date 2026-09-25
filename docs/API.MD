# API.md — Extra-Detailed Edition

## Project: NaviCore AI
**Scope**: Internal module interfaces for the SIH prototype (Kotlin ↔ native fusion core ↔ TFLite odometer), plus the post-hackathon ROS2 topic contract. Each interface below is tagged with the Roadmap phase/day that builds it, so the module map doubles as an integration schedule.
**Status**: Interface design — signatures describe intended contracts, not a shipped, versioned API.

No cloud/REST API exists in MUST-HAVE scope — NaviCore AI is fully offline by design (PRD §5.3).

---

## 1. Module Map & Build Order

```
Android Sensor Layer (Kotlin/NDK)              — Phase 3, Day 27
        │  IMU samples (6-DOF)
        ▼
Ingestion & Calibration Module  ──────► Calibration API (§2)   — Phase 2, Days 11–15
        │  calibrated, windowed IMU tensor
        ▼
AI Odometer (TFLite, INT8)  ───────────► Odometer Inference API (§3)  — Phase 1, Days 6–10
        │  (Vx, σ², P(stopped))
        ▼
Fusion Core (ESKF, NHC, ZUPT, heading)  ► Fusion API (§4)   — Phase 2, Days 14–24
        │  (position, heading, covariance)
        ▼
Map-Matching (HMM/OSM, stretch)  ──────► Map-Matching API (§5)  — Phase 3, Days 35–36
        │  snapped coordinate
        ▼
Navigation UI (Kotlin)                          — Phase 3, Days 31–34
```

Post-hackathon: the Fusion Core is also exposed as a **ROS2 node** (§6), independent of the Android UI.

**Integration order matters**: §3 (odometer) must be frozen before §4 (fusion) integration begins, since the fusion core's `updateOdometer` call depends on the exact `OdometerOutput` shape. This is why Phase 1 (odometer) precedes Phase 2 (fusion) in the Roadmap rather than running in parallel from day one.

---

## 2. Calibration API — built Phase 2, Days 11–15

Resolves the phone-to-vehicle rotation matrix (PRD FR-02).

```kotlin
interface MountCalibrator {
    /**
     * Feed one raw IMU sample. Internally runs the LPF gravity extraction
     * (Day 11) and PCA heading extraction (Day 12) described in ML spec §1.
     */
    fun ingest(sample: ImuSample)

    /** Null until enough motion has been observed to resolve R_b^v. */
    fun currentRotation(): RotationMatrix?

    /** True if a dislodgement/reorientation was detected mid-session (Day 13). */
    fun isRecalibrating(): Boolean
}

data class ImuSample(
    val timestampNanos: Long,
    val ax: Float, val ay: Float, val az: Float,   // m/s^2, body frame
    val gx: Float, val gy: Float, val gz: Float,   // rad/s, body frame
    val mx: Float? = null, val my: Float? = null, val mz: Float? = null // µT, optional
)

data class RotationMatrix(val r: Array<FloatArray>) // 3x3
```

**Contract notes**:
- `currentRotation()` returning `null` must be handled by every downstream consumer.
- Recalibration (Day 13) must not discard in-flight fusion state — re-align frames without resetting the ESKF's learned biases, verified by a Phase 2 unit test (Day 23).

---

## 3. Odometer Inference API — built Phase 1, Days 6–10

Wraps the TFLite model (ML spec §3).

```kotlin
interface VirtualOdometer {
    /**
     * @param window Calibrated, vehicle-frame IMU samples at the model's
     *   trained input rate (ML spec §2.1 — NOT assumed 100 Hz; caller is
     *   responsible for the decimate/resample step before this call).
     */
    fun infer(window: FloatArray): OdometerOutput
}

data class OdometerOutput(
    val vx: Float,          // predicted forward speed, m/s
    val varianceVx: Float,  // sigma^2 — feeds adaptive R in the ESKF (Roadmap Phase 2 Day 17)
    val stoppedProb: Float  // P(vehicle stopped), sigmoid output — ZUPT trigger input (Day 21)
)
```

**Contract notes**:
- `window` length and rate must match the model's actual training configuration exactly (ML spec §2.1/§3.1) — asserted at call time, not just documented; this assertion is the Phase 1 Day 10 model-I/O-contract test.
- Model file integrity checked before load (SECURITY.md §4) — implemented Phase 3, when the model is bundled into the app.
- No accuracy/latency numbers guaranteed by this interface; PRD §3.2 lists them as targets pending Phase 3 Day 38 on-device benchmarking.

---

## 4. Fusion API (ESKF / NHC / ZUPT / Heading) — built Phase 2, Days 14–24

```kotlin
interface FusionCore {
    /** Called when a GNSS fix is available (open-sky, Day 16). */
    fun updateGnss(fix: GnssFix)

    /** Called every odometer inference cycle (Day 17, blackout path). */
    fun updateOdometer(output: OdometerOutput)

    /** Non-holonomic pseudo-measurement injection (Day 18). */
    fun applyNhcConstraint()

    /** Current best position/heading estimate, with explicit uncertainty. */
    fun state(): FusionState
}

data class GnssFix(
    val lat: Double, val lon: Double,
    val speedMps: Float?, val hdop: Float?, val satellites: Int?,
    val timestampNanos: Long
)

data class FusionState(
    val lat: Double, val lon: Double,
    val headingRad: Float,
    val headingUncertaintyRad: Float,  // Day 19-20 — must be surfaced to the UI, not hidden
    val mode: FusionMode,              // OPEN_SKY | DEAD_RECKONING | ZUPT_LOCKED
    val blackoutDurationMs: Long,      // 0 if not in blackout
    val withinValidatedRange: Boolean  // false once blackoutDurationMs exceeds
                                        // the ~60-120s validated window (PRD §3.1)
)
```

**Contract notes**:
- `withinValidatedRange` exists specifically so the Phase 3 UI can visibly downgrade confidence once the system extrapolates beyond what's validated — implemented Day 22, not optional.
- `headingUncertaintyRad` must grow monotonically during blackout unless a correction (magnetometer, Day 20, or a map-match reset, Phase 3 stretch) brings it down.
- ZUPT engagement/release (Day 21) must be observable via `mode`, including detecting a *release* from a false lock (SECURITY.md §7).

**Phase 2 Day 23–24 test plan**: synthetic straight-line trajectory, synthetic turning trajectory, synthetic stop-and-go, then a full run against a recorded IMU log (Day 24) before this interface is considered frozen for Phase 3 integration.

---

## 5. Map-Matching API (Stretch Goal) — built Phase 3, Days 35–36, only if Phases 1–2 are on schedule

```kotlin
interface MapMatcher {
    /** Returns the nearest plausible road-snapped coordinate, or null if
     *  confidence is too low to snap (never force a snap under low confidence). */
    fun match(state: FusionState): SnappedCoordinate?
}

data class SnappedCoordinate(
    val lat: Double, val lon: Double,
    val roadSegmentId: String,
    val confidence: Float
)
```

**Contract notes**: `match` returning `null` is a valid, expected outcome (e.g. in an unmapped parking structure) and must be handled by the UI as "unmatched, showing raw fusion estimate," not as an error.

---

## 6. ROS2 Topic Contract (Post-Hackathon — Not Part of SIH Prototype)

Defined early so the Fusion Core's internal API (§4) doesn't need breaking changes later.

| Topic | Type | Direction | Notes |
| :--- | :--- | :--- | :--- |
| `/navicore/imu` | `sensor_msgs/Imu` | Input | Raw 6-DOF stream, higher rate than the phone path (up to 200 Hz FOG IMU per PRD persona table) |
| `/navicore/odom` | `nav_msgs/Odometry` | Output | Fused position/velocity, mirrors `FusionState` |
| `/navicore/pose` | `geometry_msgs/PoseWithCovarianceStamped` | Output | Must populate covariance honestly from `headingUncertaintyRad` and the ESKF's position covariance — never a fixed placeholder |
| `/navicore/status` | custom `navicore_msgs/FusionStatus` | Output | Mirrors `mode` and `withinValidatedRange` |

**Security note**: per SECURITY.md §6, these topics run only on a local, trusted robotics bus, not an open network without its own authentication layer — undesigned as of this document.

---

## 7. Versioning

No public API version is cut yet. Once the SIH prototype's module boundaries stabilize (post Phase 3), adopt semantic versioning per module (`calibration-v1`, `fusion-v1`, etc.) so the ROS2 extension and any future fleet SDK can depend on a stable contract instead of the app's internal implementation details.