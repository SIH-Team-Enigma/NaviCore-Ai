#!/usr/bin/env python3
"""
NaviCore AI: Interactive Live Telemetry & Dead Reckoning Visualizer Launcher
SIH 2026 Problem ID: 260168 | Team: @enigm@ (132834)

Launches a local HTTP server and opens the browser to the real-time visualizer.
"""

import http.server
import socketserver
import webbrowser
import os
import sys

PORT = 8080
DIRECTORY = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "web_visualizer")

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)
    def log_message(self, format, *args):
        # Quiet logger
        pass

def main():
    os.chdir(DIRECTORY)
    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        url = f"http://localhost:{PORT}"
        print("=" * 75)
        print("🚀 NAVICORE AI: LIVE TELEMETRY & SIMULATION VISUALIZER")
        print(f"📡 Serving interactive visualizer at: {url}")
        print("🎯 Use this dashboard for live grand finale judge demonstration.")
        print("   Press Ctrl+C to stop the server.")
        print("=" * 75)
        webbrowser.open(url)
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nShutting down server.")

if __name__ == "__main__":
    main()
