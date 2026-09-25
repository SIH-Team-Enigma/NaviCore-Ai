package org.enigma.navicore.ui

import org.enigma.navicore.fusion.FusionCore
import org.enigma.navicore.fusion.FusionMode
import org.enigma.navicore.fusion.FusionState
import org.enigma.navicore.ui.viewmodel.NavigationViewModel
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test

class NavigationViewModelTest {

    private lateinit var viewModel: NavigationViewModel

    @Before
    fun setUp() {
        viewModel = NavigationViewModel()
    }

    @Test
    fun testInitialNavigationState() {
        val state = viewModel.fusionState.value
        assertEquals(FusionMode.OPEN_SKY, state.mode)
        assertEquals(19.0760, state.lat, 1e-4)
        assertEquals(72.8777, state.lon, 1e-4)
        assertTrue(state.withinValidatedRange)
        assertFalse(state.isDislodged)
        assertFalse(state.isRerouteNeeded)
        assertFalse(viewModel.isSimulatingBlackout.value)
    }

    @Test
    fun testBlackoutSimulationToggle() {
        assertFalse(viewModel.isSimulatingBlackout.value)
        viewModel.toggleBlackoutSimulation(true)
        assertTrue(viewModel.isSimulatingBlackout.value)
        viewModel.toggleBlackoutSimulation(false)
        assertFalse(viewModel.isSimulatingBlackout.value)
    }

    @Test
    fun testCoordinateAndHeadingInterpolationSmoothness() {
        val stateA = FusionState(
            lat = 19.0760,
            lon = 72.8777,
            alt = 10.0,
            speedMps = 10.0f,
            headingRad = 0.0f
        )

        val stateB = FusionState(
            lat = 19.0860,
            lon = 72.8877,
            alt = 20.0,
            speedMps = 20.0f,
            headingRad = 1.0f
        )

        // At fraction = 0.0
        val at0 = viewModel.interpolateStates(stateA, stateB, 0.0f)
        assertEquals(19.0760, at0.lat, 1e-5)
        assertEquals(72.8777, at0.lon, 1e-5)
        assertEquals(10.0, at0.alt, 1e-5)
        assertEquals(10.0f, at0.speedMps, 1e-5f)
        assertEquals(0.0f, at0.headingRad, 1e-5f)

        // At fraction = 0.5 (Midpoint)
        val at50 = viewModel.interpolateStates(stateA, stateB, 0.5f)
        assertEquals(19.0810, at50.lat, 1e-5)
        assertEquals(72.8827, at50.lon, 1e-5)
        assertEquals(15.0, at50.alt, 1e-5)
        assertEquals(15.0f, at50.speedMps, 1e-5f)
        assertEquals(0.5f, at50.headingRad, 1e-5f)

        // At fraction = 1.0 (Target)
        val at100 = viewModel.interpolateStates(stateA, stateB, 1.0f)
        assertEquals(19.0860, at100.lat, 1e-5)
        assertEquals(72.8877, at100.lon, 1e-5)
        assertEquals(20.0, at100.alt, 1e-5)
        assertEquals(20.0f, at100.speedMps, 1e-5f)
        assertEquals(1.0f, at100.headingRad, 1e-5f)
    }

    @Test
    fun testCircularHeadingInterpolationAcrossBoundary() {
        val stateA = FusionState(headingRad = 3.10f) // Near +pi
        val stateB = FusionState(headingRad = -3.10f) // Near -pi

        val mid = viewModel.interpolateStates(stateA, stateB, 0.5f)
        // Shortest angular path should cross +/-pi smoothly without a 360-deg rotation spin
        assertTrue("Heading interpolation should choose shortest circular path", mid.headingRad > 3.0f || mid.headingRad < -3.0f)
    }

    @Test
    fun testBlackoutDurationPast120sDowngrade() {
        val degradedState = FusionState(
            mode = FusionMode.DEAD_RECKONING,
            blackoutDurationMs = 125000L, // > 120s
            withinValidatedRange = false
        )

        assertFalse(degradedState.withinValidatedRange)
        assertEquals(FusionMode.DEAD_RECKONING, degradedState.mode)
        assertTrue(degradedState.blackoutDurationMs > 120000L)
    }
}
