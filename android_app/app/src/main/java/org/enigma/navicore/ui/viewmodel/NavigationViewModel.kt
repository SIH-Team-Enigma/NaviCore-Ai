package org.enigma.navicore.ui.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import org.enigma.navicore.fusion.FusionCore
import org.enigma.navicore.fusion.FusionMode
import org.enigma.navicore.fusion.FusionState
import org.enigma.navicore.odometer.LocalVirtualOdometer
import kotlin.math.*

/**
 * Navigation ViewModel managing 4 visual UI modes, 10 Hz butter-smooth coordinate interpolation,
 * simulated blackout transitions, and telemetry data bindings.
 */
class NavigationViewModel(
    val fusionCore: FusionCore = FusionCore(),
    val virtualOdometer: LocalVirtualOdometer = LocalVirtualOdometer()
) : ViewModel() {

    private var previousState: FusionState = FusionState()
    private var targetState: FusionState = FusionState()
    private var interpolationProgress: Float = 1.0f

    private val _fusionState = MutableStateFlow(
        FusionState(
            lat = 19.0760,
            lon = 72.8777,
            alt = 10.0,
            speedMps = 0.0f,
            headingRad = 0.0f,
            headingUncertaintyRad = 0.01f,
            mode = FusionMode.OPEN_SKY,
            blackoutDurationMs = 0,
            withinValidatedRange = true,
            isDislodged = false,
            isRerouteNeeded = false
        )
    )
    val fusionState: StateFlow<FusionState> = _fusionState.asStateFlow()

    private val _isSimulatingBlackout = MutableStateFlow(false)
    val isSimulatingBlackout: StateFlow<Boolean> = _isSimulatingBlackout.asStateFlow()

    private var interpolatorJob: Job? = null

    init {
        startInterpolationLoop()
    }

    /**
     * Ticker loop running at 10 Hz to interpolate between raw sensor / GNSS updates.
     */
    fun startInterpolationLoop(tickIntervalMs: Long = 100L) {
        interpolatorJob?.cancel()
        interpolatorJob = viewModelScope.launch {
            while (isActive) {
                if (interpolationProgress < 1.0f) {
                    interpolationProgress = min(1.0f, interpolationProgress + 0.33f)
                    _fusionState.value = interpolateStates(previousState, targetState, interpolationProgress)
                }
                delay(tickIntervalMs)
            }
        }
    }

    /**
     * Spherical / Linear coordinate and circular heading interpolator.
     */
    fun interpolateStates(from: FusionState, to: FusionState, fraction: Float): FusionState {
        val clampedFraction = fraction.coerceIn(0.0f, 1.0f)

        val interpLat = from.lat + (to.lat - from.lat) * clampedFraction
        val interpLon = from.lon + (to.lon - from.lon) * clampedFraction
        val interpAlt = from.alt + (to.alt - from.alt) * clampedFraction
        val interpSpeed = from.speedMps + (to.speedMps - from.speedMps) * clampedFraction

        // Circular angular heading interpolation
        val dHeading = ((to.headingRad - from.headingRad + Math.PI) % (2.0 * Math.PI) - Math.PI).toFloat()
        val interpHeading = (from.headingRad + dHeading * clampedFraction).toFloat()

        return to.copy(
            lat = interpLat,
            lon = interpLon,
            alt = interpAlt,
            speedMps = interpSpeed,
            headingRad = interpHeading
        )
    }

    /**
     * Stepping function for deterministic unit testing.
     */
    fun stepInterpolation(fraction: Float) {
        _fusionState.value = interpolateStates(previousState, targetState, fraction)
    }

    fun toggleBlackoutSimulation(enabled: Boolean) {
        _isSimulatingBlackout.value = enabled
    }

    fun onImuReceived(
        timestampNanos: Long,
        ax: Float, ay: Float, az: Float,
        gx: Float, gy: Float, gz: Float,
        dt: Float = 0.01f
    ) {
        fusionCore.processImu(timestampNanos, ax, ay, az, gx, gy, gz, dt)
        updateTargetState(fusionCore.getState())
    }

    fun onGnssReceived(
        timestampNanos: Long,
        lat: Double, lon: Double, alt: Double,
        speedMps: Float, headingDeg: Float
    ) {
        if (!_isSimulatingBlackout.value) {
            fusionCore.updateGnss(timestampNanos, lat, lon, alt, speedMps, headingDeg)
            updateTargetState(fusionCore.getState())
        }
    }

    fun onAiOdometerReceived(
        vx: Float,
        variance: Float = 0.01f,
        stoppedProb: Float = 0.0f,
        timestampNs: Long = System.nanoTime()
    ) {
        fusionCore.feedAiOdometer(vx, variance, stoppedProb, timestampNs)
        updateTargetState(fusionCore.getState())
    }

    private fun updateTargetState(newState: FusionState) {
        previousState = _fusionState.value
        targetState = newState
        interpolationProgress = 0.0f
        _fusionState.value = interpolateStates(previousState, targetState, 0.0f)
    }

    public override fun onCleared() {
        super.onCleared()
        interpolatorJob?.cancel()
        fusionCore.close()
    }
}
