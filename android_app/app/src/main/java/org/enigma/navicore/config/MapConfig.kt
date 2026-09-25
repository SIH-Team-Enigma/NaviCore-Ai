package org.enigma.navicore.config

import org.enigma.navicore.BuildConfig

/**
 * Map Configuration & Provider Token Manager
 * Reads configured endpoints from BuildConfig / local.properties with zero-key fallback.
 */
object MapConfig {

    /**
     * Primary Vector / Raster Style URL.
     * Default: OpenFreeMap Liberty Vector Style (100% Free, No Key Required, 3D Buildings)
     */
    val defaultStyleUrl: String
        get() {
            val configured = BuildConfig.MAP_STYLE_URL
            return if (configured.isNotBlank()) {
                val apiKey = BuildConfig.MAP_TILE_API_KEY
                if (apiKey.isNotBlank() && configured.contains("{key}")) {
                    configured.replace("{key}", apiKey)
                } else if (apiKey.isNotBlank() && !configured.contains("key=")) {
                    if (configured.contains("?")) "$configured&key=$apiKey" else "$configured?key=$apiKey"
                } else {
                    configured
                }
            } else {
                "https://tiles.openfreemap.org/styles/liberty"
            }
        }

    /**
     * Offline Bundled Asset Style JSON path.
     */
    const val ASSET_STYLE_PATH = "asset://styles/navigation_dark_style.json"

    /**
     * OpenStreetMap Standard Raster Fallback Style URL.
     */
    const val OSM_RASTER_STYLE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png"
}
