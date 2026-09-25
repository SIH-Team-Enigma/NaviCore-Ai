package org.enigma.navicore.service

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.util.Log
import androidx.core.app.NotificationCompat
import kotlinx.coroutines.*
import org.enigma.navicore.fusion.FusionCore
import org.enigma.navicore.fusion.FusionMode
import org.enigma.navicore.fusion.FusionState
import org.enigma.navicore.imu.ImuDiagnostics
import org.enigma.navicore.imu.ImuSensorManager
import org.enigma.navicore.odometer.LocalVirtualOdometer

/**
 * Hardened Android Foreground Service for NaviCore AI Dead Reckoning.
 *
 * Responsibilities:
 * 1. Sustained high-frequency 100 Hz sensor capture with PARTIAL_WAKE_LOCK.
 * 2. Non-dismissible foreground notification with live fusion status.
 * 3. Dual-loop processing:
 *    - 100 Hz individual IMU samples for ESKF prediction.
 *    - 2 Hz (every 500 ms) [6, 100] sliding windows for 1D-TCN Virtual Odometer inference.
 * 4. 10-second periodic sensor diagnostics logger (tracking Hz, drop rate, and jitter).
 */
class NavigationService : Service() {

    companion object {
        private const val TAG = "NaviCore:Service"
        const val CHANNEL_ID = "navicore_live_channel"
        const val NOTIFICATION_ID = 101

        @Volatile
        var currentFusionState: FusionState? = null
            private set

        @Volatile
        var latestDiagnostics: ImuDiagnostics? = null
            private set
    }

    private val serviceScope = CoroutineScope(Dispatchers.Default + SupervisorJob())
    private lateinit var sensorManager: ImuSensorManager
    private val fusionCore = FusionCore()
    private val virtualOdometer = LocalVirtualOdometer()
    private var wakeLock: PowerManager.WakeLock? = null
    private lateinit var notificationManager: NotificationManager

    override fun onCreate() {
        super.onCreate()
        notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        createNotificationChannel()

        // 1. Promote to Foreground Service immediately to prevent OS process killing
        val initialNotification = buildNotification("NaviCore AI: Calibrating Sensors & Acquiring Fix...")
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(
                NOTIFICATION_ID,
                initialNotification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION
            )
        } else {
            startForeground(NOTIFICATION_ID, initialNotification)
        }

        // 2. Acquire sustained PARTIAL_WAKE_LOCK to prevent CPU throttling
        val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
        wakeLock = powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "NaviCore:SensorWakeLock").apply {
            setReferenceCounted(false)
            acquire()
        }
        Log.i(TAG, "NaviCore Foreground Service created & WakeLock acquired.")

        // 3. Initialize & Start IMU Manager
        sensorManager = ImuSensorManager(this)
        sensorManager.startListening()

        // 4. Launch 100 Hz ESKF IMU sample processing loop
        serviceScope.launch {
            var lastTimestampNs = 0L
            sensorManager.imuFlow.collect { sample ->
                val dt = if (lastTimestampNs > 0L) {
                    ((sample.timestampNanos - lastTimestampNs) / 1e9f).coerceIn(0.001f, 0.1f)
                } else {
                    0.01f
                }
                lastTimestampNs = sample.timestampNanos

                // Feed 6-DOF IMU into native Kalman engine
                fusionCore.processImu(
                    sample.timestampNanos,
                    sample.ax, sample.ay, sample.az,
                    sample.gx, sample.gy, sample.gz,
                    dt
                )

                currentFusionState = fusionCore.getState()
            }
        }

        // 5. Launch 2 Hz (500 ms) 1D-TCN Window Tensor processing loop
        serviceScope.launch {
            sensorManager.windowFlow.collect { tensorWindow ->
                // Feed [6, 100] window tensor into neural odometer
                val odomOut = virtualOdometer.infer(tensorWindow)
                fusionCore.updateAiOdometer(odomOut)

                currentFusionState = fusionCore.getState()
            }
        }

        // 6. Periodic Diagnostics Logger & Notification updater (every 10 seconds)
        serviceScope.launch {
            while (isActive) {
                delay(10_000L)
                val diag = sensorManager.getDiagnostics()
                latestDiagnostics = diag

                val state = currentFusionState
                val modeStr = state?.mode?.name ?: "INITIALIZING"
                val speedKmh = (state?.speedMps ?: 0.0f) * 3.6f
                val driftM = state?.estimatedDriftM ?: 0.0f

                Log.i(
                    TAG,
                    "[Sensor Diagnostics]: Rate: ${String.format("%.1f", diag.meanHz)} Hz | " +
                    "Total: ${diag.totalSamples} | Dropped: ${diag.droppedSamples} (${String.format("%.2f", diag.dropPercentage)}%) | " +
                    "Max Jitter: ${String.format("%.2f", diag.maxJitterMs)} ms | StdDev: ${String.format("%.2f", diag.stdDevJitterMs)} ms | " +
                    "Mode: $modeStr"
                )

                if (diag.isDropRateExceeded) {
                    Log.w(TAG, "PERFORMANCE WARNING: IMU dropped sample rate (${String.format("%.2f", diag.dropPercentage)}%) exceeds 1.0% limit!")
                }

                // Update notification banner with live stats
                val statusText = "Mode: $modeStr | Speed: ${String.format("%.1f", speedKmh)} km/h | Drift: ${String.format("%.2f", driftM)} m"
                updateNotification(statusText)
            }
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        Log.i(TAG, "NavigationService onStartCommand received.")
        return START_STICKY
    }

    private fun buildNotification(statusText: String): Notification {
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("NaviCore AI Dead Reckoning")
            .setContentText(statusText)
            .setSmallIcon(android.R.drawable.ic_menu_compass)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .build()
    }

    private fun updateNotification(statusText: String) {
        try {
            val notification = buildNotification(statusText)
            notificationManager.notify(NOTIFICATION_ID, notification)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to update notification: ${e.message}")
        }
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "NaviCore AI Navigation Service",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Continuous 100 Hz high-frequency sensor fusion and dead reckoning"
                setShowBadge(false)
            }
            notificationManager.createNotificationChannel(channel)
        }
    }

    override fun onDestroy() {
        Log.i(TAG, "NaviCore Foreground Service destroying...")
        sensorManager.stopListening()
        serviceScope.cancel()
        wakeLock?.let {
            if (it.isHeld) {
                it.release()
                Log.i(TAG, "WakeLock released.")
            }
        }
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null
}
