package org.enigma.navicore.imu

import org.junit.Assert.*
import org.junit.Before
import org.junit.Test

class ImuSensorManagerTest {

    private lateinit var imuManager: ImuSensorManager

    @Before
    fun setUp() {
        // Instantiate without Android Context for pure JVM unit test
        imuManager = ImuSensorManager(
            context = null,
            targetSampleRateHz = 100,
            windowSize = 100,
            stepSize = 50
        )
    }

    @Test
    fun testCircularWindowBufferEmitsOnHop() {
        var emittedWindows = 0

        // Ingest 250 sequential samples (nominal 10ms intervals)
        for (i in 0 until 250) {
            val timestampNs = (i + 1) * 10_000_000L
            val windowEmitted = imuManager.processSample(
                timestampNs = timestampNs,
                ax = i.toFloat(),
                ay = (i * 2).toFloat(),
                az = 9.81f,
                gx = 0.01f,
                gy = 0.02f,
                gz = 0.03f
            )
            if (windowEmitted) {
                emittedWindows++
            }
        }

        // Window size = 100, step size = 50
        // Window 1: at sample 100
        // Window 2: at sample 150
        // Window 3: at sample 200
        // Window 4: at sample 250
        assertEquals("Should emit exactly 4 windows for 250 samples", 4, emittedWindows)

        val tensor = imuManager.extractCurrentWindowTensor()
        assertEquals("Tensor should have length 600 (6 channels x 100 timesteps)", 600, tensor.size)

        // Verify channel-first layout for the latest window (samples 150..249)
        // Channel 0 (ax): oldest sample in window is 150.0f, newest is 249.0f
        assertEquals(150.0f, tensor[0], 0.001f)
        assertEquals(249.0f, tensor[99], 0.001f)

        // Channel 1 (ay): oldest sample is 300.0f, newest is 498.0f
        assertEquals(300.0f, tensor[100], 0.001f)
        assertEquals(498.0f, tensor[199], 0.001f)

        // Channel 2 (az)
        assertEquals(9.81f, tensor[200], 0.001f)
        assertEquals(9.81f, tensor[299], 0.001f)
    }

    @Test
    fun testDroppedSampleDetectionAndDropPercentage() {
        var timestampNs = 1_000_000_000L

        // Ingest 1000 samples with 3 simulated gaps (> 15ms)
        for (i in 0 until 1000) {
            if (i == 200 || i == 500 || i == 800) {
                // Gap of 40ms -> 3 missing samples
                timestampNs += 40_000_000L
            } else {
                // Nominal 10ms
                timestampNs += 10_000_000L
            }

            imuManager.processSample(
                timestampNs = timestampNs,
                ax = 0.1f, ay = 0.2f, az = 9.81f,
                gx = 0.0f, gy = 0.0f, gz = 0.01f
            )
        }

        val diag = imuManager.getDiagnostics()
        assertEquals("Should detect 1000 total received samples", 1000L, diag.totalSamples)
        assertEquals("Should detect 9 dropped samples (3 gaps * 3 drops)", 9L, diag.droppedSamples)
        assertTrue("Drop percentage should be less than 1.0%", diag.dropPercentage < 1.0)
        assertFalse("isDropRateExceeded should be false when < 1.0%", diag.isDropRateExceeded)
        assertTrue("Mean Hz should be around 100 Hz", diag.meanHz in 90.0..110.0)
    }

    @Test
    fun testExcessiveDropRateWarningFlag() {
        var timestampNs = 1_000_000_000L

        // Ingest 100 samples with heavy drops (50ms gap every 10 samples)
        for (i in 0 until 100) {
            if (i % 10 == 0 && i > 0) {
                timestampNs += 50_000_000L // 4 dropped samples each time
            } else {
                timestampNs += 10_000_000L
            }

            imuManager.processSample(
                timestampNs = timestampNs,
                ax = 0.0f, ay = 0.0f, az = 9.81f,
                gx = 0.0f, gy = 0.0f, gz = 0.0f
            )
        }

        val diag = imuManager.getDiagnostics()
        assertTrue("Dropped samples should be > 30", diag.droppedSamples >= 30)
        assertTrue("Drop percentage should exceed 1.0%", diag.dropPercentage > 1.0)
        assertTrue("isDropRateExceeded should be true", diag.isDropRateExceeded)
    }
}
