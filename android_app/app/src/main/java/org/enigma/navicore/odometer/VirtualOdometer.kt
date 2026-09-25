package org.enigma.navicore.odometer

import org.enigma.navicore.fusion.OdometerOutput

/**
 * Interface contract matching API.MD §3.
 */
interface VirtualOdometer {
    /**
     * @param window Calibrated, vehicle-frame IMU samples at the model's trained input rate.
     */
    fun infer(window: FloatArray): OdometerOutput
}

/**
 * Pure Kotlin fallback runner and TFLite execution placeholder.
 */
class LocalVirtualOdometer(
    private val windowLength: Int = 10
) : VirtualOdometer {

    override fun infer(window: FloatArray): OdometerOutput {
        require(window.size == windowLength * 6) {
            "Input window size mismatch: expected ${windowLength * 6} floats, got ${window.size}"
        }

        // Compute dynamic forward acceleration energy across the window
        var sumAx = 0.0f
        var energyIdle = 0.0f
        for (i in 0 until windowLength) {
            val ax = window[i * 6 + 0]
            val az = window[i * 6 + 2]
            sumAx += ax
            energyIdle += Math.abs(az - 9.81f)
        }
        val meanAx = sumAx / windowLength
        val idleMetric = energyIdle / windowLength

        // Speed prediction heuristic (integrated with deep learning model when .tflite is attached)
        val predictedVx = Math.max(0.0f, meanAx * 1.2f)
        val isStopped = idleMetric > 0.3f && Math.abs(meanAx) < 0.1f
        val stoppedProb = if (isStopped) 0.95f else 0.05f

        return OdometerOutput(
            vx = if (isStopped) 0.0f else predictedVx,
            varianceVx = 0.02f,
            stoppedProb = stoppedProb
        )
    }
}
