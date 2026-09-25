package org.enigma.navicore.calibration

data class ImuSample(
    val timestampNanos: Long,
    val ax: Float, val ay: Float, val az: Float,
    val gx: Float, val gy: Float, val gz: Float,
    val mx: Float? = null, val my: Float? = null, val mz: Float? = null
)

data class RotationMatrix(val r: Array<FloatArray>) {
    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (javaClass != other?.javaClass) return false
        other as RotationMatrix
        return r.contentDeepEquals(other.r)
    }

    override fun hashCode(): Int = r.contentDeepHashCode()
}

/**
 * Interface contract matching API.MD §2.
 */
interface MountCalibrator {
    fun ingest(sample: ImuSample)
    fun currentRotation(): RotationMatrix?
    fun isRecalibrating(): Boolean
}
