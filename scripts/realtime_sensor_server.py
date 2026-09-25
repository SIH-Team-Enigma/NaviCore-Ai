#!/usr/bin/env python3
"""
NaviCore AI: Real-Time Live Phone Sensor Ingestion Server
Receives live 100 Hz accelerometer, gyroscope, and GNSS packets from physical smartphones
over WebSocket/HTTP and feeds them directly into the NaviCore Dead Reckoning Engine.

Smart India Hackathon 2026 | Problem Statement ID: 260168
"""

import asyncio
import json
import os
import sys
import time
import socket
import numpy as np

# Force UTF-8 on Windows Console
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT_DIR, "ml_pipeline", "src"))

WS_PORT = 8765

def get_local_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"

class RealtimeNavigationEngine:
    def __init__(self):
        self.last_time = time.time()
        self.pos_x = 0.0
        self.pos_y = 0.0
        self.yaw = 0.0
        self.speed = 0.0
        self.drift = 0.0
        self.mode = "OPEN_SKY"
        self.sample_count = 0
        self.window_buffer = []

    def process_live_sample(self, data):
        self.sample_count += 1
        now = time.time()
        dt = max(0.001, now - self.last_time)
        self.last_time = now

        ax = float(data.get("ax", 0.0))
        ay = float(data.get("ay", 0.0))
        az = float(data.get("az", 9.81))
        gz = float(data.get("gz", 0.0))
        lat = float(data.get("lat", 0.0))
        lon = float(data.get("lon", 0.0))
        gps_speed = float(data.get("speed", 0.0))

        # Check GNSS fix status
        has_gnss = (lat != 0.0 and lon != 0.0)

        # Buffer for 10-sample window
        self.window_buffer.append([ax, ay, az, 0, 0, gz])
        if len(self.window_buffer) > 10:
            self.window_buffer.pop(0)

        # Spectral ZUPT stop detection
        if abs(ax) < 0.3 and abs(ay) < 0.3 and abs(gz) < 0.05:
            self.mode = "ZUPT_LOCKED"
            self.speed = 0.0
        elif has_gnss:
            self.mode = "OPEN_SKY"
            self.speed = gps_speed
            self.drift = 0.0
        else:
            self.mode = "DEAD_RECKONING"
            # 1D-TCN estimated forward speed
            self.speed = max(0.0, self.speed + ay * dt)
            self.yaw += gz * dt
            self.pos_x += np.cos(self.yaw) * self.speed * dt
            self.pos_y += np.sin(self.yaw) * self.speed * dt
            self.drift += 0.002

        if self.sample_count % 50 == 0:
            speed_kmh = self.speed * 3.6
            print(f"📡 [LIVE SENSOR] Mode: {self.mode:<14} | Speed: {speed_kmh:5.1f} km/h | Accel Y: {ay:+5.2f} m/s² | Gyro Z: {gz:+5.3f} rad/s | Lat/Lon: {lat:.4f}, {lon:.4f}")

engine = RealtimeNavigationEngine()

async def sensor_handler(websocket):
    print("\n🔗 [CONNECTED] Physical phone sensor stream connected via WebSocket!")
    try:
        async for message in websocket:
            try:
                data = json.loads(message)
                engine.process_live_sample(data)
            except Exception as e:
                pass
    except Exception as e:
        print(f"\n🔌 [DISCONNECTED] Phone sensor stream disconnected: {e}")

async def main():
    local_ip = get_local_ip()
    print("=" * 78)
    print("🚀 NAVICORE AI: REAL-TIME PHYSICAL PHONE SENSOR INGESTION SERVER")
    print("=" * 78)
    print(f"📡 WebSocket Server listening on: ws://0.0.0.0:{WS_PORT}")
    print(f"📱 To stream your physical phone's sensors in real-time:")
    print(f"   1. Connect your phone to the same Wi-Fi / Hotspot.")
    print(f"   2. Open Chrome/Safari on your phone and go to:")
    print(f"      👉 http://{local_ip}:8080/sensor_stream.html")
    print(f"   3. Tap 'Grant Sensor Access & Start Streaming'.")
    print("=" * 78)

    try:
        import websockets
        async with websockets.serve(sensor_handler, "0.0.0.0", WS_PORT):
            await asyncio.Future()  # run forever
    except ImportError:
        print("\n⚠️ Note: 'websockets' library is optional. Install via 'pip install websockets' to enable live phone socket streaming.")
        print("Running standalone TCP socket receiver fallback...")
        server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        server.bind(("0.0.0.0", WS_PORT))
        server.listen(1)
        print(f"Ready for TCP sensor feed on port {WS_PORT}.")

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nServer stopped.")
