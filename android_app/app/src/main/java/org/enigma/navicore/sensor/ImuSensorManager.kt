package org.enigma.navicore.sensor

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import org.enigma.navicore.calibration.ImuSample

/**
 * High-Frequency 100 Hz IMU Data Ingestion Manager.
 * Collects Accelerometer, Gyroscope, and Magnetometer streams.
 */
class ImuSensorManager(context: Context) : SensorEventListener {

    private val sensorManager = context.getSystemService(Context.SENSOR_SERVICE) as SensorManager
    private val accel = sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)
    private val gyro = sensorManager.getDefaultSensor(Sensor.TYPE_GYROSCOPE)
    private val mag = sensorManager.getDefaultSensor(Sensor.TYPE_MAGNETIC_FIELD)

    private val _imuFlow = MutableSharedFlow<ImuSample>(extraBufferCapacity = 128)
    val imuFlow: SharedFlow<ImuSample> = _imuFlow

    private var lastAx = 0f; private var lastAy = 0f; private var lastAz = 9.81f
    private var lastGx = 0f; private var lastGy = 0f; private var lastGz = 0f
    private var lastMx: Float? = null; private var lastMy: Float? = null; private var lastMz: Float? = null

    fun startListening() {
        // Sample at SENSOR_DELAY_FASTEST or SENSOR_DELAY_GAME (~100 Hz)
        accel?.let { sensorManager.registerListener(this, it, SensorManager.SENSOR_DELAY_FASTEST) }
        gyro?.let { sensorManager.registerListener(this, it, SensorManager.SENSOR_DELAY_FASTEST) }
        mag?.let { sensorManager.registerListener(this, it, SensorManager.SENSOR_DELAY_UI) }
    }

    fun stopListening() {
        sensorManager.unregisterListener(this)
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
            }
        }

        // Emit sample
        _imuFlow.tryEmit(
            ImuSample(
                timestampNanos = event.timestamp,
                ax = lastAx, ay = lastAy, az = lastAz,
                gx = lastGx, gy = lastGy, gz = lastGz,
                mx = lastMx, my = lastMy, mz = lastMz
            )
        )
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}
}
