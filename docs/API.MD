# API.md

## Project: NaviCore AI
**Scope**: Internal module interfaces for the SIH prototype (Kotlin ↔ native fusion core ↔ TFLite odometer), plus the post-hackathon ROS2 topic contract.
**Status**: Interface design — signatures describe intended contracts; nothing here should be read as a shipped, versioned API yet.

There is **no cloud/REST API** in the MUST-HAVE scope (PRD §4.1) — NaviCore AI is fully offline by design (PRD §5.3). This document covers on-device module boundaries instead.

---

## 1. Module Map

```
Android Sensor Layer (Kotlin/NDK)
        │  IMU samples (6-DOF)
        ▼
Ingestion & Calibration Module  ──────► Calibration API (§2)
        │  calibrated, windowed IMU tensor
        ▼
AI Odometer (TFLite, INT8)  ───────────► Odometer Inference API (§3)
        │  (Vx, σ², P(stopped))
        ▼
Fusion Core (ESKF, NHC, ZUPT, heading)  ► Fusion API (§4)
        │  (position, heading, covariance)
        ▼
Map-Matching (HMM/OSM, stretch)  ──────► Map-Matching API (§5)
        │  snapped coordinate
        ▼
Navigation UI (Kotlin)
```

Post-hackathon: the Fusion Core is also exposed as a **ROS2 node** for robotics use (§6), independent of the Android UI.

---

## 2. Calibration API

Resolves the phone-to-vehicle rotation matrix (PRD FR-02).

```kotlin
interface MountCalibrator {
    /**
     * Feed one raw IMU sample. Internally runs the LPF gravity extraction
     * and PCA heading extraction described in ML spec §1.
     */
    fun ingest(sample: ImuSample)

    /** Null until enough motion has been observed to resolve R_b^v. */
    fun currentRotation(): RotationMatrix?

    /** True if a dislodgement/reorientation was detected mid-session. */
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
- `currentRotation()` returning `null` must be handled by every downstream consumer — do not assume calibration has completed by a fixed time budget (PRD §3.2 lists calibration time as a *target*, not a guarantee).
- Recalibration must not discard in-flight fusion state; it should re-align frames without resetting the ESKF's learned biases (PRD FR-02).

---

## 3. Odometer Inference API

Wraps the TFLite model (ML spec §3).

```kotlin
interface VirtualOdometer {
    /**
     * @param window Calibrated, vehicle-frame IMU samples at the model's
     *   trained input rate (see ML spec §2.1 — NOT assumed to be 100 Hz;
     *   caller is responsible for the decimate/resample step before this call).
     */
    fun infer(window: FloatArray): OdometerOutput
}

data class OdometerOutput(
    val vx: Float,          // predicted forward speed, m/s
    val varianceVx: Float,  // sigma^2 — feeds adaptive R in the ESKF (ML spec §4)
    val stoppedProb: Float  // P(vehicle stopped), sigmoid output — ZUPT trigger input
)
```

**Contract notes**:
- `window` length and rate must match the model's actual training configuration exactly (ML spec §2.1/§3.1); a mismatch silently degrades accuracy rather than throwing, so the caller must assert the expected shape before calling `infer`.
- Model file integrity should be checked before load (see SECURITY.md §4) — this interface assumes a verified model is already in place.
- No accuracy/latency numbers are guaranteed by this interface; PRD §3.2 lists them as targets pending on-device benchmarking.

---

## 4. Fusion API (ESKF / NHC / ZUPT / Heading)

```kotlin
interface FusionCore {
    /** Called when a GNSS fix is available (open-sky, PRD FR-07). */
    fun updateGnss(fix: GnssFix)

    /** Called every odometer inference cycle (PRD FR-07, blackout path). */
    fun updateOdometer(output: OdometerOutput)

    /** Non-holonomic pseudo-measurement injection (PRD FR-05). */
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
    val headingUncertaintyRad: Float,  // must be surfaced to the UI, not hidden
    val mode: FusionMode,              // OPEN_SKY | DEAD_RECKONING | ZUPT_LOCKED
    val blackoutDurationMs: Long,      // 0 if not in blackout
    val withinValidatedRange: Boolean  // false once blackoutDurationMs exceeds
                                        // the ~60-120s validated window (PRD §3.1)
)
```

**Contract notes**:
- `withinValidatedRange` exists specifically so the UI can visibly downgrade confidence once the system is extrapolating beyond what's been validated (SECURITY.md §7, PRD §3.1) — this field is not optional to implement.
- `headingUncertaintyRad` must grow monotonically during blackout unless a correction (magnetometer or map-match reset, ML spec §5A) brings it down — a caller assuming it stays small is a bug, not a feature.
- ZUPT engagement/release must be observable by the caller (via `mode`), including a way to detect a *release* from a false lock, per SECURITY.md §7.

---

## 5. Map-Matching API (Stretch Goal)

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

**Contract notes**: `match` returning `null` is a valid, expected outcome (e.g. in a parking structure with no mapped road graph) and must be handled by the UI as "unmatched, showing raw fusion estimate" rather than treated as an error.

---

## 6. ROS2 Topic Contract (Post-Hackathon — Not Part of SIH Prototype)

Flagged as future scope per Roadmap §3 / PRD §4.1. Defined here early so the Fusion Core's internal API (§4) doesn't need breaking changes later.

| Topic | Type | Direction | Notes |
| :--- | :--- | :--- | :--- |
| `/navicore/imu` | `sensor_msgs/Imu` | Input | Raw 6-DOF stream, higher rate than the phone path (PRD persona table: up to 200 Hz FOG IMU) |
| `/navicore/odom` | `nav_msgs/Odometry` | Output | Fused position/velocity, mirrors `FusionState` |
| `/navicore/pose` | `geometry_msgs/PoseWithCovarianceStamped` | Output | Must populate covariance honestly from `headingUncertaintyRad` and the ESKF's position covariance — do not publish a fixed placeholder covariance |
| `/navicore/status` | custom `navicore_msgs/FusionStatus` | Output | Mirrors `mode` and `withinValidatedRange` — a robotics consumer must be able to detect "extrapolating beyond validated range" the same way the phone UI does |

**Security note**: per SECURITY.md §6, these topics should only run on a local, trusted robotics bus (e.g. within a single vehicle's ROS2 domain), not exposed on an open network without its own authentication layer — that layer is undesigned as of this document.

---

## 7. Versioning

No public API version is cut yet. Once the SIH prototype's module boundaries stabilize (post Roadmap Phase 3), adopt semantic versioning per module (`calibration-v1`, `fusion-v1`, etc.) so the ROS2 extension and any future fleet SDK (PRD §4.1, COULD-HAVE) can depend on a stable contract instead of the Android app's internal implementation details.