package org.enigma.navicore.mapmatch

import org.enigma.navicore.fusion.FusionCore
import org.enigma.navicore.fusion.FusionState
import kotlin.math.*

/**
 * Snapped road coordinate contract matching PRD FR-08 & API.MD §5.
 */
data class SnappedCoordinate(
    val lat: Double,
    val lon: Double,
    val roadSegmentId: String,
    val confidence: Float
) {
    val latitudeDeg: Double get() = lat
    val longitudeDeg: Double get() = lon
}

/**
 * Interface contract matching API.MD §5.
 */
interface MapMatcher {
    /**
     * Returns the nearest plausible road-snapped coordinate, or null if confidence is too low / unmapped zone.
     */
    fun match(state: FusionState): SnappedCoordinate?
}

/**
 * High-performance Native & Offline HMM Viterbi Map-Matching Engine.
 * Interfaces with the native C++ HmmMapMatcher via FusionState / FusionCore,
 * and maintains local spatial projection fallback for JVM unit testing.
 */
class NativeOsmMapMatcher(
    private val fusionCore: FusionCore? = null,
    private val sigmaZ: Double = 25.0,
    private val maxSnapDistanceM: Double = 30.0
) : MapMatcher {

    private val segments: MutableList<RoadSegmentData> = mutableListOf()
    private var lastMatchedSegmentId: String? = null
    private val loader = OfflineRoadNetworkLoader()

    companion object {
        private const val EARTH_RADIUS_M = 6378137.0
        private const val DEG2RAD = Math.PI / 180.0
    }

    /**
     * Loads road network segments into memory and pushes them into the native pipeline if available.
     */
    fun loadRoadNetwork(segmentList: List<RoadSegmentData>) {
        synchronized(segments) {
            segments.clear()
            segments.addAll(segmentList)
        }

        fusionCore?.let { core ->
            if (segmentList.isNotEmpty()) {
                val count = segmentList.size
                val ids = Array(count) { segmentList[it].id }
                val startLats = DoubleArray(count) { segmentList[it].startLat }
                val startLons = DoubleArray(count) { segmentList[it].startLon }
                val endLats = DoubleArray(count) { segmentList[it].endLat }
                val endLons = DoubleArray(count) { segmentList[it].endLon }
                val headingRads = FloatArray(count) { segmentList[it].headingRad }
                val lengthsM = FloatArray(count) { segmentList[it].lengthM }

                core.loadRoadNetwork(
                    ids,
                    startLats,
                    startLons,
                    endLats,
                    endLons,
                    headingRads,
                    lengthsM
                )
            }
        }
    }

    /**
     * Helper to load road network directly from GeoJSON string.
     */
    fun loadFromGeoJson(geoJsonString: String) {
        val parsed = loader.loadFromJson(geoJsonString)
        loadRoadNetwork(parsed)
    }

    /**
     * Snaps the current dead-reckoned navigation state to the most probable road centerline.
     * Returns null when off-network, in parking basements, or confidence < 0.30.
     */
    override fun match(state: FusionState): SnappedCoordinate? {
        // 1. If native pipeline already performed HMM snapping with high confidence
        if (state.snappedRoadId > 0L && state.snappedConfidence >= 0.30f) {
            return SnappedCoordinate(
                lat = state.lat,
                lon = state.lon,
                roadSegmentId = state.snappedRoadId.toString(),
                confidence = state.snappedConfidence
            )
        }

        // 2. Perform topological HMM evaluation against loaded segments
        synchronized(segments) {
            if (segments.isEmpty()) return null

            var bestSnap: SnappedCoordinate? = null
            var bestScore = -1.0f

            for (seg in segments) {
                val (dPerp, snapLat, snapLon) = computePerpendicularProjection(
                    state.lat, state.lon, seg
                )

                // Only evaluate segments within max snap threshold (e.g. 30m)
                if (dPerp <= maxSnapDistanceM) {
                    // Gaussian emission likelihood
                    val emissionProb = exp(-0.5 * (dPerp * dPerp) / (sigmaZ * sigmaZ)).toFloat()

                    // Heading alignment weight
                    var deltaHeading = abs(state.headingRad - seg.headingRad)
                    while (deltaHeading > Math.PI) deltaHeading -= (2.0 * Math.PI).toFloat()
                    val headingWeight = max(0.2f, cos(deltaHeading.toDouble()).toFloat())

                    // Transition bonus for continuous track
                    val transitionBonus = if (seg.id == lastMatchedSegmentId) 1.2f else 1.0f

                    val score = min(1.0f, emissionProb * headingWeight * transitionBonus)

                    if (score > bestScore) {
                        bestScore = score
                        bestSnap = SnappedCoordinate(
                            lat = snapLat,
                            lon = snapLon,
                            roadSegmentId = seg.id,
                            confidence = score
                        )
                    }
                }
            }

            if (bestSnap != null && bestSnap.confidence >= 0.30f) {
                lastMatchedSegmentId = bestSnap.roadSegmentId
                return bestSnap
            }

            return null
        }
    }

    /**
     * Projects point (lat, lon) orthogonally onto road segment.
     * Returns Triple(orthogonalDistanceM, projectedLat, projectedLon).
     */
    private fun computePerpendicularProjection(
        lat: Double,
        lon: Double,
        seg: RoadSegmentData
    ): Triple<Double, Double, Double> {
        val latRad = lat * DEG2RAD
        val dx = (seg.endLon - seg.startLon) * DEG2RAD * EARTH_RADIUS_M * cos(latRad)
        val dy = (seg.endLat - seg.startLat) * DEG2RAD * EARTH_RADIUS_M
        val segLenSq = dx * dx + dy * dy

        if (segLenSq < 1e-4) {
            val px = (lon - seg.startLon) * DEG2RAD * EARTH_RADIUS_M * cos(latRad)
            val py = (lat - seg.startLat) * DEG2RAD * EARTH_RADIUS_M
            val dist = hypot(px, py)
            return Triple(dist, seg.startLat, seg.startLon)
        }

        val px = (lon - seg.startLon) * DEG2RAD * EARTH_RADIUS_M * cos(latRad)
        val py = (lat - seg.startLat) * DEG2RAD * EARTH_RADIUS_M

        val t = max(0.0, min(1.0, (px * dx + py * dy) / segLenSq))

        val snapLon = seg.startLon + t * (seg.endLon - seg.startLon)
        val snapLat = seg.startLat + t * (seg.endLat - seg.startLat)

        val perpX = px - t * dx
        val perpY = py - t * dy
        val perpDist = hypot(perpX, perpY)

        return Triple(perpDist, snapLat, snapLon)
    }
}

/**
 * Backward compatibility stub alias.
 */
class SimpleOsmMapMatcher(
    private val delegate: NativeOsmMapMatcher = NativeOsmMapMatcher()
) : MapMatcher {
    override fun match(state: FusionState): SnappedCoordinate? {
        return delegate.match(state)
    }
}
