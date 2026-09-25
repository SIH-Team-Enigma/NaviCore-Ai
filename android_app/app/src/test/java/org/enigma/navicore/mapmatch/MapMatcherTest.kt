package org.enigma.navicore.mapmatch

import org.enigma.navicore.fusion.FusionMode
import org.enigma.navicore.fusion.FusionState
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test

class MapMatcherTest {

    private val sampleGeoJson = """
    {
      "type": "FeatureCollection",
      "features": [
        {
          "type": "Feature",
          "id": "10001",
          "properties": {
            "segment_id": "10001",
            "name": "BKC Central Avenue",
            "speed_limit_kmh": 60,
            "one_way": false,
            "start_lat": 19.060000,
            "start_lon": 72.860000,
            "end_lat": 19.070000,
            "end_lon": 72.870000,
            "heading_rad": 0.785398,
            "length_m": 1490.5
          },
          "geometry": {
            "type": "LineString",
            "coordinates": [
              [72.860000, 19.060000],
              [72.870000, 19.070000]
            ]
          }
        },
        {
          "type": "Feature",
          "id": "10004",
          "properties": {
            "segment_id": "10004",
            "name": "BKC Urban Underpass Arterial",
            "speed_limit_kmh": 50,
            "one_way": false,
            "start_lat": 19.076000,
            "start_lon": 72.877700,
            "end_lat": 19.086000,
            "end_lon": 72.877700,
            "heading_rad": 0.000000,
            "length_m": 1113.2
          },
          "geometry": {
            "type": "LineString",
            "coordinates": [
              [72.877700, 19.076000],
              [72.877700, 19.086000]
            ]
          }
        }
      ]
    }
    """.trimIndent()

    private lateinit var mapMatcher: NativeOsmMapMatcher

    @Before
    fun setUp() {
        mapMatcher = NativeOsmMapMatcher(sigmaZ = 25.0, maxSnapDistanceM = 30.0)
        mapMatcher.loadFromGeoJson(sampleGeoJson)
    }

    @Test
    fun testOfflineRoadNetworkLoaderParsing() {
        val loader = OfflineRoadNetworkLoader()
        val segments = loader.loadFromJson(sampleGeoJson)

        assertEquals(2, segments.size)
        assertEquals("10001", segments[0].id)
        assertEquals("BKC Central Avenue", segments[0].name)
        assertEquals(19.060000, segments[0].startLat, 1e-6)
        assertEquals(72.860000, segments[0].startLon, 1e-6)
        assertEquals(19.070000, segments[0].endLat, 1e-6)
        assertEquals(72.870000, segments[0].endLon, 1e-6)
        assertEquals(60, segments[0].speedLimitKmh)
        assertFalse(segments[0].oneWay)

        assertEquals("10004", segments[1].id)
        assertEquals("BKC Urban Underpass Arterial", segments[1].name)
    }

    @Test
    fun testGpsPointsWithin15mSnapWithHighConfidence() {
        // Road segment 10004 runs from (19.0760, 72.8777) to (19.0860, 72.8777) along meridian (heading 0 rad / North)
        // Simulate a vehicle at (19.0800, 72.87775), which is approx 5.2 meters east of the road centerline
        val state = FusionState(
            lat = 19.080000,
            lon = 72.877750, // ~5 meters offset
            alt = 10.0,
            speedMps = 15.0f,
            headingRad = 0.0f,
            mode = FusionMode.DEAD_RECKONING
        )

        val snapped = mapMatcher.match(state)

        assertNotNull("Point within 5m of road must snap", snapped)
        snapped?.let {
            assertEquals("10004", it.roadSegmentId)
            assertEquals(19.080000, it.lat, 1e-4)
            assertEquals(72.877700, it.lon, 1e-4)
            assertTrue("Confidence within 15m must be > 0.85, got ${it.confidence}", it.confidence > 0.85f)
        }
    }

    @Test
    fun testGpsPointsInUnmappedZonesReturnNull() {
        // Point far off-grid (e.g. 500 meters away in basement or unmapped zone)
        val state = FusionState(
            lat = 19.050000,
            lon = 72.840000,
            alt = -15.0, // Basement level
            speedMps = 2.0f,
            headingRad = 0.0f,
            mode = FusionMode.DEAD_RECKONING
        )

        val snapped = mapMatcher.match(state)
        assertNull("Points far from any mapped road network must return null", snapped)
    }

    @Test
    fun testNativePipelineSnappedMetadataPropagation() {
        // When FusionState already contains snapped road ID from native C++ pipeline
        val state = FusionState(
            lat = 19.0760,
            lon = 72.8777,
            alt = 10.0,
            speedMps = 12.0f,
            headingRad = 0.0f,
            mode = FusionMode.OPEN_SKY,
            snappedRoadId = 10004L,
            snappedConfidence = 0.94f
        )

        val snapped = mapMatcher.match(state)
        assertNotNull(snapped)
        assertEquals("10004", snapped?.roadSegmentId)
        assertEquals(0.94f, snapped?.confidence ?: 0.0f, 1e-3f)
    }
}
