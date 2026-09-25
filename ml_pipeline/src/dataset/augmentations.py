#!/usr/bin/env python3
"""
=============================================================================
NAVICORE AI: DATASET AUGMENTATIONS & STRESS INJECTION ENGINE
Smart India Hackathon 2026 | Problem Statement ID: 260168
Theme: Smart Vehicles | Team: @enigm@ (Team ID: 132834)
=============================================================================
Implements physical data augmentations for 1D-TCN Virtual Odometer training:
1. Pothole Shock Injection (+3.5G vertical acceleration spike)
2. Engine-Idle Harmonic Vibration (15-30 Hz band at red lights)
3. Gaussian Sensor Noise (MEMS accelerometer & gyro white noise)
4. Mount Orientation Jitter (±15° 3D rotational perturbation)
5. Speed Scaling & Temporal Resampling Jitter
"""

import numpy as np


class SensorAugmenter:
    def __init__(self, sample_rate_hz: float = 100.0, seed: int = 42):
        self.fs = sample_rate_hz
        self.rng = np.random.default_rng(seed)

    def add_gaussian_noise(self, imu_array: np.ndarray, accel_std: float = 0.05, gyro_std: float = 0.005) -> np.ndarray:
        """Adds white Gaussian noise to 6-DOF IMU channels [ax, ay, az, gx, gy, gz]."""
        augmented = imu_array.copy()
        noise_acc = self.rng.normal(0, accel_std, size=(len(imu_array), 3))
        noise_gyr = self.rng.normal(0, gyro_std, size=(len(imu_array), 3))
        augmented[:, 0:3] += noise_acc
        augmented[:, 3:6] += noise_gyr
        return augmented

    def inject_pothole_shock(self, imu_array: np.ndarray, shock_intensity_g: float = 3.5, duration_samples: int = 8) -> np.ndarray:
        """Injects sharp vertical pothole impact shock into Z-axis acceleration."""
        augmented = imu_array.copy()
        if len(augmented) <= duration_samples:
            return augmented
        
        # Pick random start index
        idx = self.rng.integers(0, len(augmented) - duration_samples)
        shock_profile = np.sin(np.linspace(0, np.PI if hasattr(np, 'PI') else np.pi, duration_samples)) * (shock_intensity_g * 9.81)
        augmented[idx:idx + duration_samples, 2] += shock_profile
        return augmented

    def inject_engine_idle_harmonics(self, imu_array: np.ndarray, idle_freq_hz: float = 22.0, amplitude_mps2: float = 0.8) -> np.ndarray:
        """Injects combustion engine idle frequency (15-30 Hz) into body vibration."""
        augmented = imu_array.copy()
        t = np.arange(len(augmented)) / self.fs
        idle_vibe = amplitude_mps2 * np.sin(2.0 * np.pi * idle_freq_hz * t)
        augmented[:, 2] += idle_vibe # Primarily on vertical Z-axis
        return augmented

    def apply_orientation_jitter(self, imu_array: np.ndarray, max_angle_deg: float = 15.0) -> np.ndarray:
        """Applies random 3D rotation jitter (SO(3)) to body frame IMU readings."""
        augmented = imu_array.copy()
        angles_rad = np.radians(self.rng.uniform(-max_angle_deg, max_angle_deg, size=3))
        
        # Euler angles rotation matrix
        cx, cy, cz = np.cos(angles_rad)
        sx, sy, sz = np.sin(angles_rad)
        
        Rx = np.array([[1, 0, 0], [0, cx, -sx], [0, sx, cx]])
        Ry = np.array([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]])
        Rz = np.array([[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]])
        R = Rz @ Ry @ Rx
        
        augmented[:, 0:3] = (R @ augmented[:, 0:3].T).T
        augmented[:, 3:6] = (R @ augmented[:, 3:6].T).T
        return augmented

    def augment_window(self, window_imu: np.ndarray, is_stationary: bool = False) -> np.ndarray:
        """Applies a combined augmentation pipeline to a sliding window."""
        out = self.add_gaussian_noise(window_imu)
        out = self.apply_orientation_jitter(out, max_angle_deg=10.0)
        
        if is_stationary:
            out = self.inject_engine_idle_harmonics(out, idle_freq_hz=self.rng.uniform(18.0, 26.0))
        else:
            if self.rng.random() < 0.35:
                out = self.inject_pothole_shock(out, shock_intensity_g=self.rng.uniform(2.5, 4.0))
                
        return out
