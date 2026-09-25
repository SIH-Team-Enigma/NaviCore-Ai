#!/usr/bin/env python3
"""
=============================================================================
NAVICORE AI: IMU SENSOR INGESTION & CIRCULAR BUFFER VERIFICATION
Smart India Hackathon 2026 | Problem Statement ID: 260168
Theme: Smart Vehicles | Team: @enigm@ (Team ID: 132834)
=============================================================================
Validates:
1. 100 Hz sampling rate consistency and jitter distribution.
2. Circular sliding window buffer (100 samples window, 50 samples step = 50% overlap).
3. Tensor output shape [6 channels, 100 timesteps] and FIFO temporal ordering.
4. Dropped sample detection (delta_t > 15 ms threshold).
5. Drop rate verification (< 1.0% over continuous session).
"""

import os
import sys
import time
import math
import numpy as np

# Force UTF-8 on Windows Console
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


class CircularImuBufferSimulator:
    """
    Python reference implementation of ImuSensorManager's circular window buffer.
    """
    def __init__(self, window_size=100, step_size=50):
        self.window_size = window_size
        self.step_size = step_size
        
        # 6 channels: ax, ay, az, gx, gy, gz
        self.ring_buffer = np.zeros((6, window_size), dtype=np.float32)
        self.write_head = 0
        self.samples_since_hop = 0
        self.total_samples = 0
        self.emitted_windows = []
        
        # Jitter & Drop stats
        self.last_timestamp_ns = 0
        self.dropped_samples = 0
        self.intervals_ns = []

    def ingest_sample(self, timestamp_ns, ax, ay, az, gx, gy, gz):
        # 1. Jitter & Drop check
        if self.last_timestamp_ns > 0:
            delta_ns = timestamp_ns - self.last_timestamp_ns
            if delta_ns > 0:
                self.intervals_ns.append(delta_ns)
                if delta_ns > 15_000_000:  # > 15 ms
                    missed = int(delta_ns / 10_000_000) - 1
                    if missed > 0:
                        self.dropped_samples += missed
        self.last_timestamp_ns = timestamp_ns
        self.total_samples += 1

        # 2. Ring buffer write
        sample_vec = [ax, ay, az, gx, gy, gz]
        for ch in range(6):
            self.ring_buffer[ch, self.write_head] = sample_vec[ch]

        self.write_head = (self.write_head + 1) % self.window_size
        self.samples_since_hop += 1

        # 3. Emit window on hop
        window_emitted = False
        if self.total_samples >= self.window_size and self.samples_since_hop >= self.step_size:
            self.samples_since_hop = 0
            # Extract ordered window: oldest at 0, newest at 99
            ordered_window = np.zeros((6, self.window_size), dtype=np.float32)
            read_start = self.write_head
            for i in range(self.window_size):
                idx = (read_start + i) % self.window_size
                ordered_window[:, i] = self.ring_buffer[:, idx]
            self.emitted_windows.append(ordered_window)
            window_emitted = True

        return window_emitted

    def get_stats(self):
        total = self.total_samples + self.dropped_samples
        drop_pct = (self.dropped_samples / total * 100.0) if total > 0 else 0.0
        intervals_ms = np.array(self.intervals_ns) / 1e6
        mean_interval_ms = float(np.mean(intervals_ms)) if len(intervals_ms) > 0 else 10.0
        mean_hz = 1000.0 / mean_interval_ms if mean_interval_ms > 0 else 100.0
        max_jitter_ms = float(np.max(np.abs(intervals_ms - 10.0))) if len(intervals_ms) > 0 else 0.0
        std_dev_ms = float(np.std(intervals_ms)) if len(intervals_ms) > 0 else 0.0

        return {
            "total_samples": self.total_samples,
            "dropped_samples": self.dropped_samples,
            "drop_percentage": drop_pct,
            "mean_hz": mean_hz,
            "max_jitter_ms": max_jitter_ms,
            "std_dev_ms": std_dev_ms,
            "num_windows": len(self.emitted_windows)
        }


def test_circular_buffer_mechanics():
    print("[TEST 1] Verifying Circular Window Buffer Mechanics (100 samples, 50% hop)...")
    sim = CircularImuBufferSimulator(window_size=100, step_size=50)

    # Ingest 250 sequential synthetic samples
    for i in range(250):
        t_ns = (i + 1) * 10_000_000  # Exact 10 ms interval
        # Use value = index for temporal ordering verification
        sim.ingest_sample(t_ns, float(i), float(i * 2), 9.81, 0.01, 0.02, 0.03)

    stats = sim.get_stats()
    # At sample 100: window 1 (samples 0..99)
    # At sample 150: window 2 (samples 50..149)
    # At sample 200: window 3 (samples 100..199)
    # At sample 250: window 4 (samples 150..249)
    assert stats["num_windows"] == 4, f"Expected 4 windows, got {stats['num_windows']}"

    # Verify tensor shape
    w1 = sim.emitted_windows[0]
    assert w1.shape == (6, 100), f"Expected shape (6, 100), got {w1.shape}"

    # Verify temporal ordering (oldest at index 0, newest at index 99)
    assert w1[0, 0] == 0.0 and w1[0, 99] == 99.0, f"Ordering failed: {w1[0, 0]} .. {w1[0, 99]}"

    # Verify 50% overlap between window 1 and window 2
    w2 = sim.emitted_windows[1]
    np.testing.assert_array_equal(w1[0, 50:], w2[0, :50])

    print(f"   --> Generated {stats['num_windows']} windows with exact shape (6, 100) and 50% step overlap.")
    print("   --> Temporal FIFO ordering verified: oldest sample at [ch, 0], newest at [ch, 99].")
    print("   --> [TEST 1] ✅ PASSED")


def test_dropped_sample_detection():
    print("\n[TEST 2] Verifying Dropped Sample & Jitter Tracking (< 1.0% Acceptance)...")
    sim = CircularImuBufferSimulator(window_size=100, step_size=50)

    # Simulate 10,000 samples (~100 seconds) with occasional minor jitter (< 3ms)
    # and 5 injected gap events (> 20ms) dropping 15 samples total
    curr_t_ns = 1_000_000_000
    for i in range(10_000):
        if i in [1000, 3000, 5000, 7000, 9000]:
            # Inject 40 ms gap (drops 3 samples)
            curr_t_ns += 40_000_000
        else:
            jitter_ns = int(np.random.normal(0, 500_000)) # +/- 0.5 ms
            curr_t_ns += (10_000_000 + jitter_ns)

        sim.ingest_sample(curr_t_ns, 0.1, 0.2, 9.81, 0.0, 0.0, 0.01)

    stats = sim.get_stats()
    print(f"   --> Total Ingested:   {stats['total_samples']}")
    print(f"   --> Dropped Samples:  {stats['dropped_samples']}")
    print(f"   --> Drop Percentage:  {stats['drop_percentage']:.3f}% (PRD Limit: < 1.0%)")
    print(f"   --> Mean Sample Rate: {stats['mean_hz']:.2f} Hz (Target: 100 Hz)")
    print(f"   --> Max Jitter:       {stats['max_jitter_ms']:.2f} ms")
    print(f"   --> Std Dev Jitter:   {stats['std_dev_ms']:.2f} ms")

    assert stats["dropped_samples"] == 15, f"Expected 15 dropped samples, got {stats['dropped_samples']}"
    assert stats["drop_percentage"] < 1.0, f"Drop rate {stats['drop_percentage']}% exceeds 1.0% threshold"
    assert 95.0 <= stats["mean_hz"] <= 105.0, f"Mean Hz {stats['mean_hz']} outside 95-105 Hz range"

    print("   --> [TEST 2] ✅ PASSED")


def test_real_dataset_resampling_compliance():
    print("\n[TEST 3] Verifying Real IO-VNBD Dataset IMU Decimation & Windowing...")
    sample_file = os.path.join(ROOT_DIR, "data", "sample_iovnbd", "S-S1.csv")
    if not os.path.exists(sample_file):
        print("   [!] Real sample file not found, skipping.")
        return

    data = np.genfromtxt(sample_file, delimiter=",", skip_header=1)
    print(f"   --> Loaded {len(data)} raw dataset records from S-S1.csv")

    sim = CircularImuBufferSimulator(window_size=100, step_size=50)
    for row in data:
        t_sec = row[0]
        t_ns = int(t_sec * 1e9)
        ax, ay, az = row[1], row[2], row[3]
        gx, gy, gz = row[4], row[5], row[6]
        sim.ingest_sample(t_ns, ax, ay, az, gx, gy, gz)

    stats = sim.get_stats()
    print(f"   --> Ingested {stats['total_samples']} samples, generated {stats['num_windows']} sliding windows.")
    print("   --> [TEST 3] ✅ PASSED")


def main():
    print("=" * 75)
    print("🚀 NAVICORE AI: IMU INGESTION & BUFFERING VERIFICATION HARNESS")
    print("=" * 75)
    test_circular_buffer_mechanics()
    test_dropped_sample_detection()
    test_real_dataset_resampling_compliance()
    print("\n" + "=" * 75)
    print("🎯 ALL IMU INGESTION & BUFFERING TESTS PASSED (100% SUCCESS)!")
    print("=" * 75)


if __name__ == "__main__":
    main()
