package org.enigma.navicore.fusion

import org.junit.Assert.*
import org.junit.Test

class FusionCoreTest {

    @Test
    fun testFusionStateDefaultValuesAndBackwardsCompatibility() {
        val state = FusionState()
        assertEquals(19.0760, state.lat, 1e-4)
        assertEquals(72.8777, state.lon, 1e-4)
        assertEquals(19.0760, state.latitudeDeg, 1e-4)
        assertEquals(72.8777, state.longitudeDeg, 1e-4)
        assertEquals(10.0, state.alt, 1e-4)
        assertEquals(10.0, state.altitudeM, 1e-4)
        assertEquals(0.0f, state.speedMps, 1e-4f)
        assertEquals(FusionMode.OPEN_SKY, state.mode)
        assertEquals(0L, state.blackoutDurationMs)
        assertTrue(state.withinValidatedRange)
        assertEquals(0L, state.snappedRoadId)
        assertEquals(0.0f, state.snappedConfidence, 1e-4f)
        assertFalse(state.isRerouteNeeded)
        assertFalse(state.isDislodged)
        assertEquals(15, state.covarianceDiagonal.size)
    }

    @Test
    fun testFusionStateInPlaceUpdate() {
        val state = FusionState()
        val cov = FloatArray(15) { (it + 1) * 0.1f }

        state.update(
            lat = 19.1234,
            lon = 72.5678,
            alt = 25.0,
            speedMps = 15.5f,
            headingRad = 1.57f,
            headingUncertaintyRad = 0.02f,
            modeOrdinal = 1, // DEAD_RECKONING
            blackoutDurationMs = 15000L,
            withinValidatedRange = true,
            snappedRoadId = 987654321L,
            snappedConfidence = 0.96f,
            isRerouteNeeded = true,
            isDislodged = false,
            covDiag = cov
        )

        assertEquals(19.1234, state.lat, 1e-4)
        assertEquals(72.5678, state.lon, 1e-4)
        assertEquals(25.0, state.alt, 1e-4)
        assertEquals(15.5f, state.speedMps, 1e-4f)
        assertEquals(1.57f, state.headingRad, 1e-4f)
        assertEquals(0.02f, state.headingUncertaintyRad, 1e-4f)
        assertEquals(FusionMode.DEAD_RECKONING, state.mode)
        assertEquals(15000L, state.blackoutDurationMs)
        assertTrue(state.withinValidatedRange)
        assertEquals(987654321L, state.snappedRoadId)
        assertEquals(0.96f, state.snappedConfidence, 1e-4f)
        assertTrue(state.isRerouteNeeded)
        assertFalse(state.isDislodged)
        assertEquals(0.1f, state.covarianceDiagonal[0], 1e-4f)
        assertEquals(1.5f, state.covarianceDiagonal[14], 1e-4f)
    }

    @Test
    fun testFusionCoreLifecycleAndFeedsWithoutCrash() {
        val core = FusionCore()
        val baseNs = 1000000000L

        // 10,000 sensor feeds in unit test loop
        for (i in 0 until 10000) {
            val tNs = baseNs + i * 10000000L
            core.feedImu(0.0f, 0.0f, 9.81f, 0.0f, 0.0f, 0.0f, tNs)
            if (i % 10 == 0) {
                core.feedGnss(19.0760, 72.8777, 10.0, 1.0f, 1.0f, tNs)
                core.feedAiOdometer(15.0f, 0.02f, 0.0f, tNs)
            }
        }

        val state = core.getState()
        assertNotNull(state)
        assertTrue(state.withinValidatedRange)

        core.destroy()
        assertEquals(0L, core.nativeHandle)
    }

    @Test
    fun testFusionStateDeadReckoningTimeout() {
        val state = FusionState()
        state.update(
            lat = 19.0,
            lon = 72.0,
            alt = 10.0,
            speedMps = 10.0f,
            headingRad = 0.0f,
            headingUncertaintyRad = 0.05f,
            modeOrdinal = 1,
            blackoutDurationMs = 130000L, // > 120s
            withinValidatedRange = false,
            snappedRoadId = 0L,
            snappedConfidence = 0.0f,
            isRerouteNeeded = false,
            isDislodged = false,
            covDiag = null
        )

        assertFalse(state.withinValidatedRange)
        assertEquals(FusionMode.DEAD_RECKONING, state.mode)
    }
}
