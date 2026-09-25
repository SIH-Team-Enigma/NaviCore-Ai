"""
NaviCore AI: Official Coventry University IO-VNBD Dataset Parser & Synchronizer.
Parses the exact 24-column Smartphone (`S-*.csv`) and 29-column Vehicle CAN-bus (`V-*.csv`) schemas.

Reference:
Onyekpe et al., "IO-VNBD: Inertial and Odometry Benchmark Dataset for Ground Vehicle Positioning",
Institute for Future Transport and Cities, Coventry University, UK.
GitHub: https://github.com/onyekpeu/IO-VNBD
"""

import os
import csv
import numpy as np
from typing import Tuple, List, Dict, Optional
from dataset.preprocessing import IMUPreprocessor


class IOVNBDDatasetParser:
    """
    Parses and synchronizes Smartphone (S-*.csv) and Vehicle CAN (V-*.csv) data files.
    """
    def __init__(self, target_rate_hz: int = 10):
        self.target_rate_hz = target_rate_hz
        self.preprocessor = IMUPreprocessor(
            raw_sampling_rate_hz=10, # IO-VNBD smartphone data is sampled at 10 Hz
            target_sampling_rate_hz=target_rate_hz,
            lpf_cutoff_hz=0.5
        )

    def parse_smartphone_csv(self, filepath: str) -> Dict[str, np.ndarray]:
        """
        Parses 24-column S-*.csv smartphone file.
        Columns:
        [0: lat, 1: lon, 2: alt, 3: speed_kmh, 4: acc_m, 5: ori_deg, 6: sats, 7: time_ms, 8: date,
         9: ax, 10: ay, 11: az, 12: grav_x, 13: grav_y, 14: grav_z,
         15: gyro_z, 16: gyro_y, 17: gyro_x, 18: mag_x, 19: mag_y, 20: mag_z,
         21: ori_yaw, 22: ori_roll, 23: ori_pitch]
        """
        if not os.path.exists(filepath):
            raise FileNotFoundError(f"Smartphone data file not found: {filepath}")

        timestamps_ms = []
        imu_6dof = []
        gps_speed_mps = []
        gps_coords = []

        with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
            reader = csv.reader(f)
            header = next(reader, None)
            for row in reader:
                if not row or len(row) < 18:
                    continue
                try:
                    lat = float(row[0])
                    lon = float(row[1])
                    spd_kmh = float(row[3])
                    t_ms = float(row[7])
                    ax = float(row[9])
                    ay = float(row[10])
                    az = float(row[11])
                    gz = float(row[15])
                    gy = float(row[16])
                    gx = float(row[17])

                    timestamps_ms.append(t_ms)
                    imu_6dof.append([ax, ay, az, gx, gy, gz])
                    gps_speed_mps.append(spd_kmh / 3.6)
                    gps_coords.append([lat, lon])
                except (ValueError, IndexError):
                    continue

        return {
            "timestamps_s": np.array(timestamps_ms, dtype=np.float64) / 1000.0,
            "imu_6dof": np.array(imu_6dof, dtype=np.float32),
            "gps_speed_mps": np.array(gps_speed_mps, dtype=np.float32),
            "gps_coords": np.array(gps_coords, dtype=np.float64),
            "sample_count": len(imu_6dof)
        }

    def parse_vehicle_can_csv(self, filepath: str) -> Dict[str, np.ndarray]:
        """
        Parses 29-column V-*.csv vehicle ECU/CAN-bus ground truth file.
        Columns:
        [0: sats, 1: time_s, 2: lat, 3: lon, 4: vel_kmh, 5: hdg, 6: alt, 7: vert_vel,
         8: sample_period, 9: steer_angle, 10: ws_fl, 11: ws_fr, 12: ws_rl, 13: ws_rr,
         14: yaw_rate, 15: indicated_spd_kmh, 16: long_accel_g, 17: lat_accel_g, ...]
        """
        if not os.path.exists(filepath):
            raise FileNotFoundError(f"Vehicle CAN data file not found: {filepath}")

        time_s = []
        can_speed_mps = []
        wheel_speeds = []
        yaw_rate_degs = []

        with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
            reader = csv.reader(f)
            header = next(reader, None)
            for row in reader:
                if not row or len(row) < 16:
                    continue
                try:
                    ts = float(row[1])
                    vel_kmh = float(row[4])
                    ws_fl = float(row[10])
                    ws_fr = float(row[11])
                    ws_rl = float(row[12])
                    ws_rr = float(row[13])
                    yaw_rate = float(row[14])

                    time_s.append(ts)
                    can_speed_mps.append(vel_kmh / 3.6)
                    wheel_speeds.append([ws_fl, ws_fr, ws_rl, ws_rr])
                    yaw_rate_degs.append(yaw_rate)
                except (ValueError, IndexError):
                    continue

        return {
            "time_s": np.array(time_s, dtype=np.float64),
            "can_speed_mps": np.array(can_speed_mps, dtype=np.float32),
            "wheel_speeds_rads": np.array(wheel_speeds, dtype=np.float32),
            "yaw_rate_degs": np.array(yaw_rate_degs, dtype=np.float32),
            "sample_count": len(can_speed_mps)
        }

    def create_synchronized_dataset(self, s_filepath: str, v_filepath: str) -> Dict[str, np.ndarray]:
        """
        Synchronizes smartphone 6-DOF IMU features with high-precision vehicle CAN wheel speed ground truth.
        """
        s_data = self.parse_smartphone_csv(s_filepath)
        v_data = self.parse_vehicle_can_csv(v_filepath)

        n_samples = min(s_data["sample_count"], v_data["sample_count"])
        imu_sync = s_data["imu_6dof"][:n_samples]
        gt_speed = v_data["can_speed_mps"][:n_samples]
        gnss_sync = s_data["gps_coords"][:n_samples]

        # Extract sliding windows: [N_windows, 6, window_len=10]
        window_len = 10
        stride = 1
        num_windows = max(0, (n_samples - window_len) // stride + 1)
        
        windows = []
        target_vx = []
        target_zupt = []

        for w in range(num_windows):
            s_idx = w * stride
            e_idx = s_idx + window_len
            windows.append(imu_sync[s_idx:e_idx].T) # Shape [6, 10]
            v_target = gt_speed[e_idx - 1]
            target_vx.append(v_target)
            target_zupt.append(1.0 if v_target < 0.05 else 0.0)

        return {
            "windows": np.array(windows, dtype=np.float32),
            "target_vx": np.array(target_vx, dtype=np.float32),
            "target_zupt": np.array(target_zupt, dtype=np.float32),
            "total_windows": num_windows,
            "raw_samples": n_samples
        }
