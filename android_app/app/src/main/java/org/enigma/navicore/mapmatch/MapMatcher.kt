package org.enigma.navicore.mapmatch

import org.enigma.navicore.fusion.FusionState

data class SnappedCoordinate(
    val lat: Double,
    val lon: Double,
    val roadSegmentId: String,
    val confidence: Float
)

/**
 * Interface contract matching API.MD §5.
 */
interface MapMatcher {
    /**
     * Returns the nearest plausible road-snapped coordinate, or null if confidence is too low.
     */
    fun match(state: FusionState): SnappedCoordinate?
}

class SimpleOsmMapMatcher : MapMatcher {
    override fun match(state: FusionState): SnappedCoordinate? {
        // Returns null if unmapped area (e.g. basement parking)
        return null
    }
}
