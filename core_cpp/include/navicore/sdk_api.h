#pragma once

#ifdef __cplusplus
extern "C" {
#endif

#include <stdint.h>
#include <stdbool.h>

typedef struct {
    double latitude_deg;
    double longitude_deg;
    float altitude_m;
    float speed_mps;
    float heading_deg;
    float estimated_drift_m;
    float confidence_score;
    int nav_mode; // 0: OPEN_SKY, 1: DEAD_RECKONING, 2: ZUPT_LOCKED, 3: CALIBRATION
} NaviCoreFusionStateC;

typedef void* NaviCoreEngineHandle;

// C API bindings for integration into third-party mobile & embedded applications
NaviCoreEngineHandle navicore_create_engine(int vehicle_type);
void navicore_destroy_engine(NaviCoreEngineHandle handle);

void navicore_feed_imu(NaviCoreEngineHandle handle, uint64_t timestamp_ns, float ax, float ay, float az, float gx, float gy, float gz);
void navicore_feed_gnss(NaviCoreEngineHandle handle, uint64_t timestamp_ns, double lat, double lon, float alt, float speed, float accuracy);
void navicore_feed_barometer(NaviCoreEngineHandle handle, float pressure_hpa);

NaviCoreFusionStateC navicore_get_state(NaviCoreEngineHandle handle);
void navicore_reset_engine(NaviCoreEngineHandle handle);

#ifdef __cplusplus
}
#endif
