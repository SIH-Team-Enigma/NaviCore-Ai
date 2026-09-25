"""
NaviCore AI: Synthetic Realistic Drive Dataset Generator & Loader.
Generates multi-scenario vehicle trajectories with time-synchronized 6-DOF IMU data,
ground-truth CAN wheel speed, GNSS fixes, road shocks (potholes), engine vibrations, and mounting rotations.
"""

import numpy as np
from typing import Tuple, List, Dict, Optional

try:
    import torch
    from torch.utils.data import Dataset, DataLoader
    _HAS_TORCH = True
except ImportError:
    _HAS_TORCH = False
    Dataset = object


class SyntheticDriveGenerator:
    """
    Standalone vehicle drive generator producing 6-DOF IMU data and ground truth.
    """
    def __init__(self, sample_rate_hz: int = 10):
        self.sample_rate_hz = sample_rate_hz
        self.dt = 1.0 / sample_rate_hz

    def generate_tunnel_blackout_run(self, duration_sec: float = 30.0) -> Tuple[np.ndarray, np.ndarray]:
        steps = int(duration_sec * self.sample_rate_hz)
        imu = np.zeros((steps, 6), dtype=np.float32)
        gt = np.zeros((steps, 3), dtype=np.float32)
        
        # 60 km/h forward speed (~16.6 m/s)
        vx = 16.6
        for i in range(steps):
            imu[i, 0] = np.random.normal(0.0, 0.05) # Ax
            imu[i, 1] = np.random.normal(0.0, 0.02) # Ay
            imu[i, 2] = 9.81 + np.random.normal(0.0, 0.05) # Az
            imu[i, 3] = np.random.normal(0.0, 0.01) # Gx
            imu[i, 4] = np.random.normal(0.0, 0.01) # Gy
            imu[i, 5] = 0.005 # Gz bias
            gt[i, 0] = vx * (i * self.dt)
            gt[i, 1] = 0.0
            gt[i, 2] = vx
        return imu, gt


class SyntheticDriveDataset(Dataset):
    def __init__(
        self,
        num_trajectories: int = 50,
        traj_duration_s: float = 60.0,
        sample_rate_hz: int = 10,
        window_len: int = 10,
        stride: int = 1,
    ):
        self.window_len = window_len
        self.stride = stride
        self.sample_rate_hz = sample_rate_hz
        self.dt = 1.0 / sample_rate_hz

        self.windows: List[np.ndarray] = []
        self.target_vx: List[float] = []
        self.target_zupt: List[float] = []

        self._generate_dataset(num_trajectories, traj_duration_s)

    def _generate_dataset(self, num_trajectories: int, duration_s: float):
        steps = int(duration_s * self.sample_rate_hz)
        time_arr = np.linspace(0, duration_s, steps)

        for _ in range(num_trajectories):
            # 1. Random vehicle motion profile: acceleration, cruise, deceleration, stops
            speed_profile = np.zeros(steps, dtype=np.float32)
            current_v = 0.0
            t = 0
            while t < steps:
                seg_type = np.random.choice(["accel", "cruise", "decel", "stop"], p=[0.25, 0.35, 0.2, 0.2])
                seg_len = np.random.randint(int(3 * self.sample_rate_hz), int(12 * self.sample_rate_hz))
                end_t = min(steps, t + seg_len)

                if seg_type == "accel":
                    target_v = np.random.uniform(8.0, 25.0) # 30 - 90 km/h
                    accel_rate = np.random.uniform(1.0, 2.5)
                    for k in range(t, end_t):
                        current_v = min(target_v, current_v + accel_rate * self.dt)
                        speed_profile[k] = current_v
                elif seg_type == "cruise":
                    for k in range(t, end_t):
                        speed_profile[k] = current_v + np.random.normal(0.0, 0.1)
                elif seg_type == "decel":
                    decel_rate = np.random.uniform(1.5, 3.5)
                    for k in range(t, end_t):
                        current_v = max(0.0, current_v - decel_rate * self.dt)
                        speed_profile[k] = current_v
                elif seg_type == "stop":
                    current_v = 0.0
                    for k in range(t, end_t):
                        speed_profile[k] = 0.0

                t = end_t

            # 2. Compute true forward acceleration
            accel_x = np.gradient(speed_profile, self.dt)

            # 3. Simulate IMU channels (Ax, Ay, Az, Gx, Gy, Gz) in vehicle frame
            imu_stream = np.zeros((steps, 6), dtype=np.float32)
            
            # Ax: forward translational acceleration + sensor noise
            imu_stream[:, 0] = accel_x + np.random.normal(0.0, 0.15, steps)
            
            # Ay: lateral centrifugal acceleration (curves) + noise
            yaw_rate = np.zeros(steps, dtype=np.float32)
            # Add occasional turning curves
            if np.random.rand() > 0.5:
                turn_start = np.random.randint(10, max(11, steps - 30))
                turn_dur = np.random.randint(20, 50)
                yaw_rate[turn_start:turn_start + turn_dur] = np.random.uniform(-0.15, 0.15)
                imu_stream[:, 1] = speed_profile * yaw_rate + np.random.normal(0.0, 0.1, steps)
            else:
                imu_stream[:, 1] = np.random.normal(0.0, 0.08, steps)

            # Az: gravity (9.81 m/s^2) + vertical road vibration
            imu_stream[:, 2] = 9.81 + np.random.normal(0.0, 0.25, steps)

            # Gyro channels
            imu_stream[:, 3] = np.random.normal(0.0, 0.02, steps) # Gx (roll rate)
            imu_stream[:, 4] = np.random.normal(0.0, 0.02, steps) # Gy (pitch rate)
            imu_stream[:, 5] = yaw_rate + np.random.normal(0.0, 0.015, steps) # Gz (yaw rate)

            # 4. Inject Environmental Disturbances:
            # A. Potholes / speed bumps (high-g vertical and longitudinal shocks)
            pothole_count = np.random.randint(1, 6)
            for _ in range(pothole_count):
                p_idx = np.random.randint(0, steps)
                imu_stream[p_idx, 0] += np.random.uniform(-3.0, 3.0)
                imu_stream[p_idx, 2] += np.random.uniform(4.0, 10.0)

            # B. Engine Idle Harmonics (when speed == 0)
            is_stopped = speed_profile < 0.05
            for k in np.where(is_stopped)[0]:
                idle_vib = 0.4 * np.sin(2.0 * np.pi * 22.0 * time_arr[k])
                imu_stream[k, 0] += idle_vib
                imu_stream[k, 2] += idle_vib * 1.5

            # 5. Extract sliding windows
            num_w = (steps - self.window_len) // self.stride + 1
            for w in range(num_w):
                s_idx = w * self.stride
                e_idx = s_idx + self.window_len
                # Window shape: [6, window_len] (Channels first)
                self.windows.append(imu_stream[s_idx:e_idx].T)
                # Target is the vehicle forward speed at the end of the window
                target_v = speed_profile[e_idx - 1]
                self.target_vx.append(target_v)
                self.target_zupt.append(1.0 if target_v < 0.05 else 0.0)

    def __len__(self) -> int:
        return len(self.windows)

    def __getitem__(self, idx: int) -> Tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
        x = torch.tensor(self.windows[idx], dtype=torch.float32)
        y_vx = torch.tensor([self.target_vx[idx]], dtype=torch.float32)
        y_zupt = torch.tensor([self.target_zupt[idx]], dtype=torch.float32)
        return x, y_vx, y_zupt
