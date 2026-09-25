package org.enigma.navicore.ui

import org.enigma.navicore.fusion.FusionMode
import org.enigma.navicore.fusion.FusionState
import org.enigma.navicore.ui.telemetry.*
import org.junit.Assert.*
import org.junit.Test

class TelemetryOverlayTest {

    @Test
    fun testOpenSkyStateFormatting() {
        val state = FusionState(
            lat = 19.0760,
            lon = 72.8777,
            alt = 10.0,
            speedMps = 15.0f,
            headingRad = 1.570796f, // 90 deg
            mode = FusionMode.OPEN_SKY,
            blackoutDurationMs = 0L,
            withinValidatedRange = true,
            covarianceDiagonal = FloatArray(15) { if (it < 2) 0.5f else 0.1f }
        )

        assertEquals("54.0 km/h", formatSpeed(state))
        assertEquals("090°", formatHeading(state))
        assertEquals("99.8%", formatConfidence(state))
        assertEquals("--", formatBlackoutElapsed(state))
        assertEquals("15.00 m/s", formatAiOdomVx(state))
        assertEquals("--", formatZuptProb(state))
        assertEquals("0.00 m", formatEstimatedDrift(state))
        assertEquals("UNMAPPED ROAD", formatSnappedRoadDisplay(state))
    }

    @Test
    fun testDeadReckoningValidStateFormatting() {
        val state = FusionState(
            lat = 19.0800,
            lon = 72.8800,
            alt = 15.0,
            speedMps = 16.667f, // 60 km/h
            headingRad = 0.0f,
            mode = FusionMode.DEAD_RECKONING,
            blackoutDurationMs = 45000L, // 45s
            withinValidatedRange = true,
            snappedRoadId = 10004L,
            snappedConfidence = 0.95f,
            covarianceDiagonal = FloatArray(15) { if (it < 2) 1.0f else 0.1f }
        )

        assertEquals("60.0 km/h", formatSpeed(state))
        assertEquals("000°", formatHeading(state))
        assertEquals("99.8%", formatConfidence(state))
        assertEquals("00:45s", formatBlackoutElapsed(state))
        assertEquals("16.67 m/s", formatAiOdomVx(state))
        assertEquals("0.00", formatZuptProb(state))
        assertTrue("Estimated drift must be computed", formatEstimatedDrift(state).endsWith(" m"))
        assertEquals("ROAD: #10004 (95%)", formatSnappedRoadDisplay(state))
    }

    @Test
    fun testDeadReckoningDegradedTimeoutStateFormatting() {
        val state = FusionState(
            lat = 19.0900,
            lon = 72.8900,
            speedMps = 15.0f,
            mode = FusionMode.DEAD_RECKONING,
            blackoutDurationMs = 135000L, // 2m 15s (>120s)
            withinValidatedRange = false,
            covarianceDiagonal = FloatArray(15) { 2.0f }
        )

        assertEquals("DEGRADED", formatConfidence(state))
        assertEquals("02:15s", formatBlackoutElapsed(state))
    }

    @Test
    fun testZuptLockedStateFormatting() {
        val state = FusionState(
            speedMps = 0.0f,
            mode = FusionMode.ZUPT_LOCKED,
            blackoutDurationMs = 20000L,
            withinValidatedRange = true,
            covarianceDiagonal = FloatArray(15)
        )

        assertEquals("0.0 km/h", formatSpeed(state))
        assertEquals("100.0%", formatConfidence(state))
        assertEquals("0.00 m/s", formatAiOdomVx(state))
        assertEquals("1.00 (LOCKED)", formatZuptProb(state))
        assertEquals("0.00 m (LOCK)", formatEstimatedDrift(state))
    }

    @Test
    fun testDislodgedReAlignmentStateFormatting() {
        val state = FusionState(
            isDislodged = true,
            mode = FusionMode.DEAD_RECKONING
        )

        assertEquals("RE-ALIGNING", formatConfidence(state))
    }
}
