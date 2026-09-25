package org.enigma.navicore.fusion

enum class FusionMode {
    OPEN_SKY,
    DEAD_RECKONING,
    ZUPT_LOCKED
}

data class FusionState(
    var lat: Double = 19.0760,
    var lon: Double = 72.8777,
    var alt: Double = 10.0,
    var speedMps: Float = 0.0f,
    var headingRad: Float = 0.0f,
    var headingUncertaintyRad: Float = 0.01f,
    var mode: FusionMode = FusionMode.OPEN_SKY,
    var blackoutDurationMs: Long = 0L,
    var withinValidatedRange: Boolean = true,
    var snappedRoadId: Long = 0L,
    var snappedConfidence: Float = 0.0f,
    var isRerouteNeeded: Boolean = false,
    var isDislodged: Boolean = false,
    var covarianceDiagonal: FloatArray = FloatArray(15)
) {
    val latitudeDeg: Double get() = lat
    val longitudeDeg: Double get() = lon
    val altitudeM: Double get() = alt

    /**
     * In-place update method invoked directly from JNI to avoid heap allocations in hot loops.
     */
    fun update(
        lat: Double,
        lon: Double,
        alt: Double,
        speedMps: Float,
        headingRad: Float,
        headingUncertaintyRad: Float,
        modeOrdinal: Int,
        blackoutDurationMs: Long,
        withinValidatedRange: Boolean,
        snappedRoadId: Long,
        snappedConfidence: Float,
        isRerouteNeeded: Boolean,
        isDislodged: Boolean,
        covDiag: FloatArray?
    ) {
        this.lat = lat
        this.lon = lon
        this.alt = alt
        this.speedMps = speedMps
        this.headingRad = headingRad
        this.headingUncertaintyRad = headingUncertaintyRad
        this.mode = when (modeOrdinal) {
            0 -> FusionMode.OPEN_SKY
            1 -> FusionMode.DEAD_RECKONING
            else -> FusionMode.ZUPT_LOCKED
        }
        this.blackoutDurationMs = blackoutDurationMs
        this.withinValidatedRange = withinValidatedRange
        this.snappedRoadId = snappedRoadId
        this.snappedConfidence = snappedConfidence
        this.isRerouteNeeded = isRerouteNeeded
        this.isDislodged = isDislodged
        if (covDiag != null && covDiag.size == 15 && covDiag !== this.covarianceDiagonal) {
            System.arraycopy(covDiag, 0, this.covarianceDiagonal, 0, 15)
        }
    }

    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (javaClass != other?.javaClass) return false

        other as FusionState

        if (lat != other.lat) return false
        if (lon != other.lon) return false
        if (alt != other.alt) return false
        if (speedMps != other.speedMps) return false
        if (headingRad != other.headingRad) return false
        if (headingUncertaintyRad != other.headingUncertaintyRad) return false
        if (mode != other.mode) return false
        if (blackoutDurationMs != other.blackoutDurationMs) return false
        if (withinValidatedRange != other.withinValidatedRange) return false
        if (snappedRoadId != other.snappedRoadId) return false
        if (snappedConfidence != other.snappedConfidence) return false
        if (isRerouteNeeded != other.isRerouteNeeded) return false
        if (isDislodged != other.isDislodged) return false
        if (!covarianceDiagonal.contentEquals(other.covarianceDiagonal)) return false

        return true
    }

    override fun hashCode(): Int {
        var result = lat.hashCode()
        result = 31 * result + lon.hashCode()
        result = 31 * result + alt.hashCode()
        result = 31 * result + speedMps.hashCode()
        result = 31 * result + headingRad.hashCode()
        result = 31 * result + headingUncertaintyRad.hashCode()
        result = 31 * result + mode.hashCode()
        result = 31 * result + blackoutDurationMs.hashCode()
        result = 31 * result + withinValidatedRange.hashCode()
        result = 31 * result + snappedRoadId.hashCode()
        result = 31 * result + snappedConfidence.hashCode()
        result = 31 * result + isRerouteNeeded.hashCode()
        result = 31 * result + isDislodged.hashCode()
        result = 31 * result + covarianceDiagonal.contentHashCode()
        return result
    }
}

data class OdometerOutput(
    val vx: Float,
    val varianceVx: Float,
    val stoppedProb: Float
)
