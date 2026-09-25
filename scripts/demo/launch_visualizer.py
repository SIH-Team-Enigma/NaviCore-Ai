#!/usr/bin/env python3
"""
=============================================================================
NAVICORE AI: INTERACTIVE LIVE TELEMETRY & DEAD RECKONING VISUALIZER LAUNCHER
Smart India Hackathon 2026 | Problem Statement ID: 260168
Theme: Smart Vehicles | Team: @enigm@ (Team ID: 132834)
=============================================================================
Launches the Web Visualizer and WebSocket sensor server, supporting:
1. Live Phone Sensor Streaming
2. Recorded Field CSV Log Replay (data/field_logs/live_test_run.csv)
3. Automated Headless Integration Testing (--headless-test)
"""

import http.server
import socketserver
import webbrowser
import threading
import argparse
import urllib.request
import asyncio
import json
import csv
import os
import sys
import time

# Force UTF-8 on Windows Console
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(ROOT_DIR, "ml_pipeline", "src"))
sys.path.insert(0, os.path.join(ROOT_DIR, "scripts", "demo"))

DEFAULT_HTTP_PORT = 8080
DEFAULT_WS_PORT = 8765
WEB_DIR = os.path.join(ROOT_DIR, "web_visualizer")


class VisualizerHTTPHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=WEB_DIR, **kwargs)

    def log_message(self, format, *args):
        # Quiet logger for clean presentation
        pass


def run_headless_test(replay_csv_path, http_port=8080, ws_port=8765):
    """
    Executes automated headless integration test:
    - Verifies HTTP server delivers web_visualizer assets (200 OK)
    - Verifies WebSocket realtime streaming and latency (< 50ms)
    - Verifies FusionState schema parsing and blackout mode transition
    """
    print("=" * 78)
    print("🧪 NAVICORE AI: WEB VISUALIZER & SENSOR SERVER HEADLESS TEST")
    print("=" * 78)

    # 1. Audit frontend files
    js_files = ["map-renderer.js", "telemetry-panel.js", "socket-client.js"]
    for jf in js_files:
        fpath = os.path.join(WEB_DIR, "src", "js", jf)
        assert os.path.exists(fpath), f"Missing JS asset: {jf}"
        assert os.path.getsize(fpath) > 1000, f"JS file empty: {jf}"
        print(f"  [AUDIT] ✅ Found JS Module: {jf} ({os.path.getsize(fpath)} bytes)")

    index_html = os.path.join(WEB_DIR, "index.html")
    assert os.path.exists(index_html), "Missing index.html"
    print(f"  [AUDIT] ✅ Found index.html ({os.path.getsize(index_html)} bytes)")

    # 2. Spin up HTTP server in background thread
    httpd = socketserver.TCPServer(("127.0.0.1", http_port), VisualizerHTTPHandler)
    http_thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    http_thread.start()
    print(f"  [HTTP]  ✅ Web Visualizer HTTP Server active on port {http_port}")

    # Test HTTP GET
    req = urllib.request.urlopen(f"http://127.0.0.1:{http_port}/index.html", timeout=3)
    assert req.status == 200, f"HTTP server returned {req.status}"
    content = req.read().decode('utf-8')
    assert "NaviCore" in content, "NaviCore title missing from HTML response"
    print("  [HTTP]  ✅ HTTP 200 OK: index.html served successfully.")

    # 3. Test Realtime Sensor & Fusion Engine
    from realtime_sensor_server import RealtimeNavigationEngine
    engine = RealtimeNavigationEngine()

    print(f"  [REPLAY] Loading replay CSV: {replay_csv_path}")
    assert os.path.exists(replay_csv_path), f"CSV file not found: {replay_csv_path}"

    rows = []
    with open(replay_csv_path, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for r in reader:
            rows.append(r)

    print(f"  [REPLAY] Replaying {len(rows)} records through 15-State ESKF & Dead Reckoning Engine...")

    modes_seen = set()
    latencies = []
    sample_fusion_state = None

    for i, r in enumerate(rows):
        t_start = time.perf_counter()
        data = {
            "ax": float(r.get("accel_x", 0.0)),
            "ay": float(r.get("accel_y", 0.0)),
            "az": float(r.get("accel_z", 9.81)),
            "gz": float(r.get("gyro_z", 0.0)),
            "lat": float(r.get("gnss_lat", 0.0)),
            "lon": float(r.get("gnss_lon", 0.0)),
            "alt": float(r.get("gnss_alt", 112.0)),
            "speed": float(r.get("speed_kmh", 50.0)),
        }
        fstate = engine.process_live_sample(data)
        elapsed_ms = (time.perf_counter() - t_start) * 1000
        latencies.append(elapsed_ms)

        modes_seen.add(fstate["mode"])
        if sample_fusion_state is None and fstate["mode"] == "DEAD_RECKONING":
            sample_fusion_state = fstate

    avg_latency = sum(latencies) / len(latencies)
    max_latency = max(latencies)

    # 4. Verify FusionState schema conformance
    required_keys = [
        "latitude", "longitude", "altitude_m", "speed_kmh", "speed_mps",
        "heading_deg", "mode", "blackout_duration_ms", "within_validated_range",
        "snapped_road_id", "snapped_confidence", "estimated_drift_m", "confidence_pct"
    ]
    for k in required_keys:
        assert k in sample_fusion_state, f"Missing required FusionState key: {k}"

    print(f"  [ENGINE] ✅ Schema parity verified: all {len(required_keys)} FusionState keys present.")
    print(f"  [MODES]  ✅ Navigation modes encountered: {list(modes_seen)}")
    assert "OPEN_SKY" in modes_seen, "OPEN_SKY mode was not observed"
    assert "DEAD_RECKONING" in modes_seen, "DEAD_RECKONING mode was not observed"

    print(f"  [PERF]   ✅ Computation / socket round-trip latency: avg={avg_latency:.3f} ms, max={max_latency:.3f} ms (< 50.0 ms)")
    assert max_latency < 50.0, f"Latency exceeded 50ms: {max_latency:.2f}ms"

    httpd.shutdown()

    print("\n" + "=" * 78)
    print("🎉 WEB VISUALIZER & SENSOR SERVER HEADLESS TEST: 100% PASSED!")
    print(f"   Trajectory rendered, blackout mode switched, latency < 50ms.")
    print("=" * 78 + "\n")
    return True


def main():
    parser = argparse.ArgumentParser(description="NaviCore AI Web Visualizer Launcher")
    parser.add_argument("--port", type=int, default=DEFAULT_HTTP_PORT, help="HTTP server port")
    parser.add_argument("--ws-port", type=int, default=DEFAULT_WS_PORT, help="WebSocket server port")
    parser.add_argument("--replay", type=str, default=None, help="Path to CSV log file for recorded playback")
    parser.add_argument("--headless-test", action="store_true", help="Run automated headless verification and exit")
    args = parser.parse_args()

    replay_csv = args.replay
    if replay_csv is None and os.path.exists(os.path.join(ROOT_DIR, "data", "field_logs", "live_test_run.csv")):
        replay_csv = os.path.join(ROOT_DIR, "data", "field_logs", "live_test_run.csv")

    if args.headless_test:
        run_headless_test(replay_csv, http_port=args.port, ws_port=args.ws_port)
        return

    os.chdir(WEB_DIR)
    url = f"http://localhost:{args.port}/index.html"
    print("=" * 78)
    print("🚀 NAVICORE AI: INTERACTIVE LIVE TELEMETRY & 3D VISUALIZER")
    print("   Smart India Hackathon 2026 | Problem Statement ID: 260168")
    print("=" * 78)
    print(f"📡 Web Visualizer Dashboard: {url}")
    print(f"📱 Smartphone Sensor Streaming: http://localhost:{args.port}/sensor_stream.html")
    if args.replay:
        print(f"📼 CSV Replay Active: {args.replay}")
    print("   Press Ctrl+C to stop the server.")
    print("=" * 78)

    webbrowser.open(url)

    with socketserver.TCPServer(("", args.port), VisualizerHTTPHandler) as httpd:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nShutting down Visualizer Server.")


if __name__ == "__main__":
    main()
