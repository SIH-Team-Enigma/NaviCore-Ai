package org.enigma.navicore.mapmatch

import android.content.Context
import org.json.JSONObject
import java.io.File
import java.io.InputStream
import kotlin.math.*

/**
 * Data model for an offline road segment in the local topological spatial index.
 */
data class RoadSegmentData(
    val id: String,
    val name: String = "",
    val startLat: Double,
    val startLon: Double,
    val endLat: Double,
    val endLon: Double,
    val headingRad: Float,
    val lengthM: Float,
    val speedLimitKmh: Int = 50,
    val oneWay: Boolean = false,
    val roadType: String = "primary"
)

/**
 * Offline OSM GeoJSON / Vector Road Network Loader.
 * Loads pre-packaged bounding box extracts into memory at application boot
 * and marshals segments into the native HMM Map Matching pipeline.
 */
class OfflineRoadNetworkLoader {

    companion object {
        private const val EARTH_RADIUS_M = 6378137.0
        private const val DEG2RAD = Math.PI / 180.0

        /**
         * Calculates initial bearing (heading) in radians from point A to point B.
         */
        fun calculateHeadingRad(lat1: Double, lon1: Double, lat2: Double, lon2: Double): Float {
            val dLon = (lon2 - lon1) * DEG2RAD
            val phi1 = lat1 * DEG2RAD
            val phi2 = lat2 * DEG2RAD

            val y = sin(dLon) * cos(phi2)
            val x = cos(phi1) * sin(phi2) - sin(phi1) * cos(phi2) * cos(dLon)
            val heading = atan2(y, x).toFloat()
            return heading
        }

        /**
         * Calculates equirectangular / Haversine distance in meters.
         */
        fun calculateDistanceM(lat1: Double, lon1: Double, lat2: Double, lon2: Double): Float {
            val dLat = (lat2 - lat1) * DEG2RAD
            val dLon = (lon2 - lon1) * DEG2RAD
            val avgLat = ((lat1 + lat2) / 2.0) * DEG2RAD

            val x = dLon * cos(avgLat) * EARTH_RADIUS_M
            val y = dLat * EARTH_RADIUS_M
            return hypot(x, y).toFloat()
        }
    }

    /**
     * Parses a GeoJSON FeatureCollection string containing road segments.
     */
    fun loadFromJson(jsonString: String): List<RoadSegmentData> {
        val segments = mutableListOf<RoadSegmentData>()
        if (jsonString.isBlank()) return segments

        try {
            val root = JSONObject(jsonString)
            val features = root.optJSONArray("features") ?: return segments

            for (i in 0 until features.length()) {
                val feat = features.optJSONObject(i) ?: continue
                val props = feat.optJSONObject("properties") ?: JSONObject()
                val geom = feat.optJSONObject("geometry") ?: JSONObject()

                val segmentId = props.optString("segment_id", feat.optString("id", (i + 1).toString()))
                val name = props.optString("name", "")
                val speedLimit = props.optInt("speed_limit_kmh", props.optInt("speed_limit", 50))
                val oneWay = props.optBoolean("one_way", false)
                val roadType = props.optString("road_type", "primary")

                var sLat = props.optDouble("start_lat", 0.0)
                var sLon = props.optDouble("start_lon", 0.0)
                var eLat = props.optDouble("end_lat", 0.0)
                var eLon = props.optDouble("end_lon", 0.0)

                // Fallback to geometry coordinates if properties don't specify endpoints directly
                if (sLat == 0.0 && sLon == 0.0 && geom.optString("type") == "LineString") {
                    val coords = geom.optJSONArray("coordinates")
                    if (coords != null && coords.length() >= 2) {
                        val pStart = coords.optJSONArray(0)
                        val pEnd = coords.optJSONArray(coords.length() - 1)
                        if (pStart != null && pEnd != null) {
                            sLon = pStart.optDouble(0)
                            sLat = pStart.optDouble(1)
                            eLon = pEnd.optDouble(0)
                            eLat = pEnd.optDouble(1)
                        }
                    }
                }

                if (sLat == 0.0 && sLon == 0.0 && eLat == 0.0 && eLon == 0.0) continue

                val headingRad = if (props.has("heading_rad")) {
                    props.optDouble("heading_rad").toFloat()
                } else {
                    calculateHeadingRad(sLat, sLon, eLat, eLon)
                }

                val lengthM = if (props.has("length_m")) {
                    props.optDouble("length_m").toFloat()
                } else {
                    calculateDistanceM(sLat, sLon, eLat, eLon)
                }

                segments.add(
                    RoadSegmentData(
                        id = segmentId,
                        name = name,
                        startLat = sLat,
                        startLon = sLon,
                        endLat = eLat,
                        endLon = eLon,
                        headingRad = headingRad,
                        lengthM = lengthM,
                        speedLimitKmh = speedLimit,
                        oneWay = oneWay,
                        roadType = roadType
                    )
                )
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }

        return segments
    }

    /**
     * Loads road network from an Android Assets file.
     */
    fun loadFromAssets(context: Context, assetName: String = "demo_osm_bbox.json"): List<RoadSegmentData> {
        return try {
            context.assets.open(assetName).use { inputStream ->
                loadFromStream(inputStream)
            }
        } catch (e: Exception) {
            emptyList()
        }
    }

    /**
     * Loads road network from an InputStream.
     */
    fun loadFromStream(inputStream: InputStream): List<RoadSegmentData> {
        val json = inputStream.bufferedReader().use { it.readText() }
        return loadFromJson(json)
    }

    /**
     * Loads road network from a local filesystem file.
     */
    fun loadFromFile(file: File): List<RoadSegmentData> {
        if (!file.exists()) return emptyList()
        val json = file.readText()
        return loadFromJson(json)
    }
}
