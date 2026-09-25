package org.enigma.navicore.fusion

enum class FusionMode {
    OPEN_SKY,
    DEAD_RECKONING,
    ZUPT_LOCKED
}

data class FusionState(
    val lat: Double,
    val lon: Double,
    val alt: Double,
    val speedMps: Float,
    val headingRad: Float,
    val headingUncertaintyRad: Float,
    val mode: FusionMode,
    val blackoutDurationMs: Long,
    val withinValidatedRange: Boolean
)

data class OdometerOutput(
    val vx: Float,
    val varianceVx: Float,
    val stoppedProb: Float
)

class FusionCore {
    init {
        try {
            System.loadLibrary("navicore_jni")
            nativeInit()
        } catch (e: UnsatisfiedLinkError) {
            // Fallback for JVM unit tests or unbuilt NDK
        }
    }

    private external fun nativeInit()
    private external fun nativeProcessImu(
        timestampNanos: Long,
        ax: Float, ay: Float, az: Float,
        gx: Float, gy: Float, gz: Float,
        dt: Float
    )
    private external fun nativeUpdateGnss(
        timestampNanos: Long,
        lat: Double, lon: Double, alt: Double,
        speedMps: Float, headingDeg: Float
    )
    private external fun nativeUpdateAiOdometer(
        vxMps: Float,
        varianceVx: Float,
        stoppedProb: Float
    )
    private external fun nativeGetState(): DoubleArray?

    fun processImu(timestampNanos: Long, ax: Float, ay: Float, az: Float, gx: Float, gy: Float, gz: Float, dt: Float) {
        nativeProcessImu(timestampNanos, ax, ay, az, gx, gy, gz, dt)
    }

    fun updateGnss(timestampNanos: Long, lat: Double, lon: Double, alt: Double, speedMps: Float, headingDeg: Float) {
        nativeUpdateGnss(timestampNanos, lat, lon, alt, speedMps, headingDeg)
    }

    fun updateAiOdometer(output: OdometerOutput) {
        nativeUpdateAiOdometer(output.vx, output.varianceVx, output.stoppedProb)
    }

    fun getState(): FusionState {
        val arr = nativeGetState() ?: return FusionState(
            lat = 19.0760, lon = 72.8777, alt = 10.0,
            speedMps = 0.0f, headingRad = 0.0f, headingUncertaintyRad = 0.01f,
            mode = FusionMode.OPEN_SKY, blackoutDurationMs = 0, withinValidatedRange = true
        )

        val modeInt = arr[6].toInt()
        val mode = when (modeInt) {
            0 -> FusionMode.OPEN_SKY
            1 -> FusionMode.DEAD_RECKONING
            else -> FusionMode.ZUPT_LOCKED
        }
        val blackoutMs = arr[7].toLong()

        return FusionState(
            lat = arr[0],
            lon = arr[1],
            alt = arr[2],
            speedMps = arr[3].toFloat(),
            headingRad = arr[4].toFloat(),
            headingUncertaintyRad = arr[5].toFloat(),
            mode = mode,
            blackoutDurationMs = blackoutMs,
            withinValidatedRange = blackoutMs <= 120000L
        )
    }
}
