package org.enigma.navicore.fusion

import java.io.Closeable

/**
 * High-performance Kotlin bridge to the native C++ NavicorePipeline.
 * Orchestrates 100 Hz IMU propagation, satellite GNSS corrections, Virtual AI Odometer updates,
 * mounting auto-calibration, and HMM map matching with zero allocations in hot paths.
 */
class FusionCore(config: String = "") : Closeable, AutoCloseable {

    var nativeHandle: Long = 0L
        private set

    private val cachedState: FusionState = FusionState()
    private val lock = Any()

    companion object {
        var isLibraryLoaded: Boolean = false
            private set

        init {
            try {
                System.loadLibrary("navicore_jni")
                isLibraryLoaded = true
            } catch (e: UnsatisfiedLinkError) {
                // Fallback for JVM host unit tests without compiled native library
                isLibraryLoaded = false
            }
        }
    }

    init {
        if (isLibraryLoaded) {
            nativeHandle = nativeInit(config)
        }
    }

    // ==========================================
    // JNI Native Method Declarations
    // ==========================================

    private external fun nativeInit(config: String): Long

    private external fun nativeFeedImu(
        handle: Long,
        ax: Float, ay: Float, az: Float,
        gx: Float, gy: Float, gz: Float,
        timestampNs: Long
    )

    private external fun nativeFeedGnss(
        handle: Long,
        lat: Double, lon: Double, alt: Double,
        hAcc: Float, vAcc: Float,
        timestampNs: Long
    )

    private external fun nativeFeedAiOdometer(
        handle: Long,
        vx: Float,
        variance: Float,
        stoppedProb: Float,
        timestampNs: Long
    )

    private external fun nativeGetState(
        handle: Long,
        stateOut: FusionState
    )

    private external fun nativeLoadRoadNetwork(
        handle: Long,
        segmentIds: Array<String>,
        startLats: DoubleArray,
        startLons: DoubleArray,
        endLats: DoubleArray,
        endLons: DoubleArray,
        headingRads: FloatArray,
        lengthsM: FloatArray
    )

    private external fun nativeDestroy(handle: Long)

    // ==========================================
    // Public Kotlin API (Primary Pipeline Methods)
    // ==========================================

    /**
     * Ingests 6-DOF IMU reading at 100 Hz.
     */
    fun feedImu(
        ax: Float, ay: Float, az: Float,
        gx: Float, gy: Float, gz: Float,
        timestampNs: Long = System.nanoTime()
    ) {
        synchronized(lock) {
            if (nativeHandle != 0L) {
                nativeFeedImu(nativeHandle, ax, ay, az, gx, gy, gz, timestampNs)
            }
        }
    }

    /**
     * Ingests GNSS Fix from satellite receiver.
     */
    fun feedGnss(
        lat: Double, lon: Double, alt: Double,
        hAcc: Float = 1.0f, vAcc: Float = 1.0f,
        timestampNs: Long = System.nanoTime()
    ) {
        synchronized(lock) {
            if (nativeHandle != 0L) {
                nativeFeedGnss(nativeHandle, lat, lon, alt, hAcc, vAcc, timestampNs)
            }
        }
    }

    /**
     * Ingests AI Virtual Odometer forward velocity and stopped probability.
     */
    fun feedAiOdometer(
        vx: Float,
        variance: Float = 0.01f,
        stoppedProb: Float = 0.0f,
        timestampNs: Long = System.nanoTime()
    ) {
        synchronized(lock) {
            if (nativeHandle != 0L) {
                nativeFeedAiOdometer(nativeHandle, vx, variance, stoppedProb, timestampNs)
            }
        }
    }

    /**
     * Retrieves the latest fused state into stateOut or returns a fresh copy.
     */
    fun getState(stateOut: FusionState? = null): FusionState {
        synchronized(lock) {
            val target = stateOut ?: cachedState
            if (nativeHandle != 0L) {
                nativeGetState(nativeHandle, target)
            }
            return if (stateOut != null) target else target.copy()
        }
    }

    /**
     * Loads offline road network segments into the native HMM map matching engine.
     */
    fun loadRoadNetwork(
        segmentIds: Array<String>,
        startLats: DoubleArray,
        startLons: DoubleArray,
        endLats: DoubleArray,
        endLons: DoubleArray,
        headingRads: FloatArray,
        lengthsM: FloatArray
    ) {
        synchronized(lock) {
            if (nativeHandle != 0L) {
                nativeLoadRoadNetwork(
                    nativeHandle,
                    segmentIds,
                    startLats,
                    startLons,
                    endLats,
                    endLons,
                    headingRads,
                    lengthsM
                )
            }
        }
    }

    // ==========================================
    // Backward Compatibility Overloads
    // ==========================================

    fun processImu(
        timestampNanos: Long,
        ax: Float, ay: Float, az: Float,
        gx: Float, gy: Float, gz: Float,
        dt: Float = 0.01f
    ) {
        feedImu(ax, ay, az, gx, gy, gz, timestampNanos)
    }

    fun updateGnss(
        timestampNanos: Long,
        lat: Double, lon: Double, alt: Double,
        speedMps: Float, headingDeg: Float
    ) {
        feedGnss(lat, lon, alt, 1.0f, 1.0f, timestampNanos)
    }

    fun updateAiOdometer(
        output: OdometerOutput,
        timestampNs: Long = System.nanoTime()
    ) {
        feedAiOdometer(output.vx, output.varianceVx, output.stoppedProb, timestampNs)
    }

    // ==========================================
    // Lifecycle & Memory Management
    // ==========================================

    fun destroy() {
        close()
    }

    override fun close() {
        synchronized(lock) {
            if (nativeHandle != 0L) {
                nativeDestroy(nativeHandle)
                nativeHandle = 0L
            }
        }
    }

    protected fun finalize() {
        close()
    }
}
