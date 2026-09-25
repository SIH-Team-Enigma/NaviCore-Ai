# NaviCore AI: 3D Vector Map Engine & Multi-Vehicle Kinematics Reference

**Smart India Hackathon 2026 | Problem Statement ID: 260168**  
**Team:** @enigm@ (Team ID: 132834)  
**Theme:** Smart Vehicles  

---

## 1. High-Definition 3D Vector Map System

### 1.1 Base Layer Options (Zero API Key Required)
1. **CartoDB Voyager HD (`voyager`)** *(Default)*:
   - High-contrast road outlines, visible street names, highway labels, and landmarks.
2. **ESRI Satellite Hybrid (`satellite`)**:
   - Sub-meter high-resolution aerial photography coupled with global road vector boundary overlays.
3. **CartoDB Dark Matter (`dark`)**:
   - Low-light night mode with glowing neon cyan trajectory overlays.
4. **OpenStreetMap Standard (`osm`)**:
   - Universal global road geometries and localized community metadata.

### 1.2 Geocoding & Smart Nominatim Integration
- **Reverse Geocoding on Map Pin Drag / Click**:
  - Automatically queries `https://nominatim.openstreetmap.org/reverse` to convert `(lat, lon)` into human-readable street, district, and city names.
- **Global Address Search**:
  - Resolves any landmark, highway, or city worldwide via OpenStreetMap Nominatim Geocoding API.
- **Device GPS Lock**:
  - Requests W3C Geolocation API (`navigator.geolocation.getCurrentPosition`) for live on-device navigation.

---

## 2. Multi-Vehicle Kinematics Dynamic Presets

| Vehicle Profile | Max Speed | Max Yaw Agility | Lateral Stiffness ($V_y \approx 0$) | Roll Tolerance | ZUPT Idle Band | Dynamic Characteristics |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **1. Passenger Sedan** | 200 km/h | 1.5 rad/s | 0.98 (Strict) | $\pm 8.6^\circ$ | 15–25 Hz | Standard Ackerman steering; strict non-holonomic constraint. |
| **2. Two-Wheeler / Bike** | 160 km/h | 2.8 rad/s | 0.80 (Flexible) | $\pm 34.4^\circ$ | 18–28 Hz | Lean angle dynamic roll compensation during cornering. |
| **3. Commercial Freight Truck**| 110 km/h | 0.8 rad/s | 0.99 (Rigid) | $\pm 4.5^\circ$ | 10–18 Hz | Low turn rate, heavy pitch damping, high inertia. |
| **4. Urban Transit Bus** | 90 km/h | 0.7 rad/s | 0.99 (Rigid) | $\pm 3.4^\circ$ | 10–16 Hz | Automated bus stop ZUPT idle clamping and restart cycles. |
| **5. Autonomous Delivery AGV**| 30 km/h | 3.5 rad/s | 0.95 (Holonomic)| $\pm 2.8^\circ$ | N/A (Electric) | Zero-turn radius, indoor zero-slip wheel dynamics. |

---

## 3. Real-Time Turn-by-Turn Guidance & HUD

1. **Dynamic Maneuver Guidance**:
   - Computes delta heading $\Delta \theta$ between successive road nodes.
   - Triggers dynamic visual cues: `Turn Right`, `Turn Left`, `Continue Straight`, `Tunnel GNSS Blackout`, `Destination Arrived`.
2. **Satellite Constellation Tracker**:
   - Displays real-time satellite count in HUD: `18 SATS (GNSS 3D FIX)` $\to$ drops to `0 SATS` during tunnel blackouts $\to$ resumes instantly upon exit.
3. **G-Force & Attitude Horizon**:
   - Real-time pitch/roll artificial horizon with $+3.5\text{G}$ pothole shock rejection and dynamic motorcycle banking angles.

---

## 4. Verification & Testing Commands

```bash
# 1. Run Master 10-Stage Test Suite
python scripts/test_end_to_end.py

# 2. Verify Multi-Vehicle Kinematics
python scripts/verify_vehicle_kinematics.py

# 3. Launch Interactive 3D Web Visualizer
python scripts/launch_visualizer.py

# 4. Run Grand Finale Defense Mode
python scripts/presentation_mode.py --fast
```
