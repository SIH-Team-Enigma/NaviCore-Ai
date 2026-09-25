package org.enigma.navicore.imu

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.util.Log
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import org.enigma.navicore.calibration.ImuSample
import kotlin.math.sqrt

/**
 * Diagnostic metrics for IMU ingestion pipeline.
 */
data class ImuDiagnostics(
    val totalSamples: Long,
    val droppedSamples: Long,
    val dropPercentage: Double,
    val meanHz: Double,
    val maxJitterMs: Double,
    val stdDevJitterMs: Double,
    val isDropRateExceeded: Boolean // true if dropPercentage > 1.0%
)

/**
 * High-Frequency 100 Hz IMU Data Ingestion Manager.
 *
 * Implements:
 * 1. Synchronized 100 Hz sampling (10 ms nominal interval).
 * 2. Rolling circular buffer: 1.0s window (100 samples) with 50% overlap (50 samples hop).
 *    Output shape: [6 channels, 100 timesteps] = 600 float tensor.
 * 3. Dropped-sample counter & jitter tracking (flags gaps > 15 ms).
 * 4. Diagnostics reporting with drop-rate warning threshold (< 1.0% over 10-minute session).
 */
class ImuSensorManager(
    context: Context? = null,
    private val targetSampleRateHz: Int = 100,
    private val windowSize: Int = 100,      // 1.0 s at 100 Hz
    private val stepSize: Int = 50          // 50% overlap = 0.5 s hop
) : SensorEventListener {

    companion object {
        private const val TAG = "NaviCore:IMU"
        private const val NOMINAL_INTERVAL_NS = 10_000_000L // 10 ms (100 Hz)
        private const val DROPPED_SAMPLE_THRESHOLD_NS = 15_000_000L // 15 ms
        private const val MAX_DROP_RATE_PERCENT = 1.0
    }

    private val sensorManager = context?.getSystemService(Context.SENSOR_SERVICE) as? SensorManager
    private val accel = sensorManager?.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)
    private val gyro = sensorManager?.getDefaultSensor(Sensor.TYPE_GYROSCOPE)
    private val mag = sensorManager?.getDefaultSensor(Sensor.TYPE_MAGNETIC_FIELD)

    // Flow for raw 100 Hz samples (consumed by Kalman filter)
    private val _imuFlow = MutableSharedFlow<ImuSample>(extraBufferCapacity = 256)
    val imuFlow: SharedFlow<ImuSample> = _imuFlow.asSharedFlow()

    // Flow for [6, 100] window tensors (consumed by TCN virtual odometer every 500 ms)
    private val _windowFlow = MutableSharedFlow<FloatArray>(extraBufferCapacity = 32)
    val windowFlow: SharedFlow<FloatArray> = _windowFlow.asSharedFlow()

    // Latest sensor values
    private var lastAx = 0f; private var lastAy = 0f; private var lastAz = 9.81f
    private var lastGx = 0f; private var lastGy = 0f; private var lastGz = 0f
    private var lastMx: Float? = null; private var lastMy: Float? = null; private var lastMz: Float? = null

    // Circular ring buffer for [6 channels, windowSize timesteps]
    // Layout: ax[100], ay[100], az[100], gx[100], gy[100], gz[100] (Channel-first, matching TCN input)
    private val ringAx = FloatArray(windowSize)
    private val ringAy = FloatArray(windowSize)
    private val ringAz = FloatArray(windowSize)
    private val ringGx = FloatArray(windowSize)
    private val ringGy = FloatArray(windowSize)
    private val ringGz = FloatArray(windowSize)

    private var writeHead = 0
    private var samplesSinceLastHop = 0
    private var totalSamplesAccumulated = 0L

    // Jitter & dropped sample tracking
    private var lastTimestampNs: Long = 0L
    private var totalSamples: Long = 0L
    private var droppedSamples: Long = 0L
    private var sumIntervalNs: Double = 0.0
    private var sumIntervalSqNs: Double = 0.0
    private var maxJitterNs: Long = 0L
    private var firstSampleTimestampNs: Long = 0L

    @Synchronized
    fun startListening() {
        resetCounters()
        accel?.let { sensorManager?.registerListener(this, it, SensorManager.SENSOR_DELAY_FASTEST) }
        gyro?.let { sensorManager?.registerListener(this, it, SensorManager.SENSOR_DELAY_FASTEST) }
        mag?.let { sensorManager?.registerListener(this, it, SensorManager.SENSOR_DELAY_UI) }
        Log.i(TAG, "IMU Sensor Manager listening started at target $targetSampleRateHz Hz.")
    }

    @Synchronized
    fun stopListening() {
        sensorManager?.unregisterListener(this)
        Log.i(TAG, "IMU Sensor Manager listening stopped.")
    }

    @Synchronized
    fun resetCounters() {
        totalSamples = 0L
        droppedSamples = 0L
        lastTimestampNs = 0L
        sumIntervalNs = 0.0
        sumIntervalSqNs = 0.0
        maxJitterNs = 0L
        firstSampleTimestampNs = 0L
        writeHead = 0
        samplesSinceLastHop = 0
        totalSamplesAccumulated = 0L
    }

    override fun onSensorChanged(event: SensorEvent?) {
        if (event == null) return

        when (event.sensor.type) {
            Sensor.TYPE_ACCELEROMETER -> {
                lastAx = event.values[0]
                lastAy = event.values[1]
                lastAz = event.values[2]
            }
            Sensor.TYPE_GYROSCOPE -> {
                lastGx = event.values[0]
                lastGy = event.values[1]
                lastGz = event.values[2]
            }
            Sensor.TYPE_MAGNETIC_FIELD -> {
                lastMx = event.values[0]
                lastMy = event.values[1]
                lastMz = event.values[2]
                return // Magnetometer runs at lower rate; don't trigger IMU step
            }
            else -> return
        }

        processSample(
            timestampNs = event.timestamp,
            ax = lastAx, ay = lastAy, az = lastAz,
            gx = lastGx, gy = lastGy, gz = lastGz,
            mx = lastMx, my = lastMy, mz = lastMz
        )
    }

    /**
     * Process an incoming 6-DOF IMU reading.
     * Accessible for testing with synthetic / replay data.
     */
    @Synchronized
    fun processSample(
        timestampNs: Long,
        ax: Float, ay: Float, az: Float,
        gx: Float, gy: Float, gz: Float,
        mx: Float? = null, my: Float? = null, mz: Float? = null
    ): Boolean {
        // 1. Dropped-sample & Jitter tracking
        if (firstSampleTimestampNs == 0L) {
            firstSampleTimestampNs = timestampNs
        }

        if (lastTimestampNs > 0L) {
            val deltaNs = timestampNs - lastTimestampNs
            if (deltaNs > 0) {
                sumIntervalNs += deltaNs
                sumIntervalSqNs += (deltaNs.toDouble() * deltaNs.toDouble())

                val jitterNs = kotlin.math.abs(deltaNs - NOMINAL_INTERVAL_NS)
                if (jitterNs > maxJitterNs) {
                    maxJitterNs = jitterNs
                }

                if (deltaNs > DROPPED_SAMPLE_THRESHOLD_NS) {
                    // Estimated missing samples
                    val estimatedDrops = (deltaNs / NOMINAL_INTERVAL_NS) - 1
                    if (estimatedDrops > 0) {
                        droppedSamples += estimatedDrops
                    }
                }
            }
        }
        lastTimestampNs = timestampNs
        totalSamples++

        // 2. Emit raw 100 Hz sample for ESKF prediction
        val sample = ImuSample(
            timestampNanos = timestampNs,
            ax = ax, ay = ay, az = az,
            gx = gx, gy = gy, gz = gz,
            mx = mx, my = my, mz = mz
        )
        _imuFlow.tryEmit(sample)

        // 3. Write into circular ring buffer
        ringAx[writeHead] = ax
        ringAy[writeHead] = ay
        ringAz[writeHead] = az
        ringGx[writeHead] = gx
        ringGy[writeHead] = gy
        ringGz[writeHead] = gz

        writeHead = (writeHead + 1) % windowSize
        totalSamplesAccumulated++
        samplesSinceLastHop++

        // 4. Emit 1.0s window tensor [6, 100] when stepSize (50 samples) is reached
        var windowEmitted = false
        if (totalSamplesAccumulated >= windowSize && samplesSinceLastHop >= stepSize) {
            samplesSinceLastHop = 0
            val tensor = extractCurrentWindowTensor()
            _windowFlow.tryEmit(tensor)
            windowEmitted = true
        }

        // 5. Periodic drop-rate sanity check (every 6000 samples ~ 1 minute)
        if (totalSamples % 6000 == 0L) {
            val diag = getDiagnostics()
            if (diag.isDropRateExceeded) {
                Log.w(TAG, "WARNING: IMU drop rate exceeded threshold! Rate: ${String.format("%.2f", diag.dropPercentage)}% (> $MAX_DROP_RATE_PERCENT%)")
            }
        }

        return windowEmitted
    }

    /**
     * Extracts an unrolled [6, 100] channel-first FloatArray from the ring buffer.
     * Channels: [0..99]=ax, [100..199]=ay, [200..299]=az, [300..399]=gx, [400..499]=gy, [500..599]=gz.
     */
    fun extractCurrentWindowTensor(): FloatArray {
        val tensor = FloatArray(6 * windowSize)
        val readStart = writeHead // The oldest sample in the circular buffer is at writeHead

        for (i in 0 until windowSize) {
            val ringIdx = (readStart + i) % windowSize
            tensor[0 * windowSize + i] = ringAx[ringIdx]
            tensor[1 * windowSize + i] = ringAy[ringIdx]
            tensor[2 * windowSize + i] = ringAz[ringIdx]
            tensor[3 * windowSize + i] = ringGx[ringIdx]
            tensor[4 * windowSize + i] = ringGy[ringIdx]
            tensor[5 * windowSize + i] = ringGz[ringIdx]
        }
        return tensor
    }

    /**
     * Compute and return empirical diagnostics statistics.
     */
    @Synchronized
    fun getDiagnostics(): ImuDiagnostics {
        val total = totalSamples + droppedSamples
        val dropPct = if (total > 0) (droppedSamples.toDouble() / total.toDouble()) * 100.0 else 0.0

        val n = totalSamples.toDouble()
        val meanIntervalNs = if (n > 1) sumIntervalNs / (n - 1) else NOMINAL_INTERVAL_NS.toDouble()
        val meanHz = if (meanIntervalNs > 0) 1e9 / meanIntervalNs else targetSampleRateHz.toDouble()

        val varianceNs = if (n > 2) {
            val mean = sumIntervalNs / (n - 1)
            (sumIntervalSqNs / (n - 1)) - (mean * mean)
        } else 0.0

        val stdDevMs = if (varianceNs > 0) (sqrt(varianceNs) / 1e6) else 0.0
        val maxJitterMs = maxJitterNs / 1e6

        return ImuDiagnostics(
            totalSamples = totalSamples,
            droppedSamples = droppedSamples,
            dropPercentage = dropPct,
            meanHz = meanHz,
            maxJitterMs = maxJitterMs,
            stdDevJitterMs = stdDevMs,
            isDropRateExceeded = dropPct > MAX_DROP_RATE_PERCENT
        )
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}
}
