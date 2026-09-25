# Field Test & Live Road Validation Safety Protocol — NaviCore AI

**Smart India Hackathon 2026** | **Problem Statement ID**: 260168  
**Team**: @enigm@ (Team ID: 132834)  

---

## 1. Safety Directive & Operational Mandate

Live validation on public roads (underpasses, highway tunnels, basement ramps) carries physical risks. Testing must strictly adhere to the following non-negotiable rules:

1. **Zero Driver Distraction**: The vehicle driver must **NEVER** interact with, monitor, or manipulate the testing devices while the vehicle is in motion.
2. **Designated Passenger Operator**: All test triggers, sensor recording sessions, and blackout simulation controls must be operated solely by a front-seat passenger or dedicated test engineer.
3. **Firm Mount Security**: Test smartphones must be rigidly mounted using commercial mechanical phone clamps (not magnetic mounts that slip during sharp braking).

---

## 2. Pre-Flight Test Checklist

Before turning on the vehicle engine:

- [ ] **Sensor Calibration Check**: Verify that the phone's accelerometer and gyroscope show realistic static readings ($|\mathbf{a}| \approx 9.81\text{ m/s}^2$, $\|\boldsymbol{\omega}\| < 0.05\text{ rad/s}$).
- [ ] **Battery Level**: Ensure test devices have $>50\%$ battery or are connected to a 5V/2A in-car USB charger to avoid low-power throttling.
- [ ] **Storage Space**: Ensure $>2\text{ GB}$ free internal storage for uncompressed 100 Hz CSV/HDF5 sensor logs.
- [ ] **GPS Open-Sky Lock**: Confirm a 3D GNSS fix with $\ge 8$ satellites visible before entering the blackout zone.

---

## 3. Test Procedures by Zone Type

### 1. Highway Tunnel Test (e.g., 500m – 1000m Tunnel)
1. Engage data logger 30 seconds prior to tunnel portal entrance under open-sky conditions.
2. Observe automatic GNSS loss transition to AI Dead Reckoning mode.
3. Maintain steady lane keeping within legal speed limit (50–80 km/h).
4. Upon exit, allow 15 seconds of open-sky GNSS reconnection to record ground truth position delta and verify re-convergence.

### 2. Multi-Storey Underground Basement Parking
1. Start recording in open outdoor parking.
2. Descend down spiral ramp at 10–15 km/h.
3. Navigate 3 right-angle turns.
4. Park vehicle and let engine idle for 30 seconds to verify Spectral ZUPT zero-drift lock.

---

## 4. Post-Test Data Extraction & Analysis

Sensor logs generated during field runs are saved to:
`/sdcard/Android/data/org.enigma.navicore/files/telemetry_logs/*.csv`

Run offline analysis using the repository script:
```powershell
python ml_pipeline/src/dataset/iovnbd_loader.py --input /path/to/recorded_log.csv
```
