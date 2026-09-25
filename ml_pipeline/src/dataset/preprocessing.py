"""
NaviCore AI: Data Preprocessing, Decimation, and Windowing Module.
Handles gravity decoupling via Low-Pass Filter (LPF) and sliding window generation.
"""

import numpy as np
from typing import Tuple, Optional


class IMUPreprocessor:
    def __init__(
        self,
        raw_sampling_rate_hz: int = 100,
        target_sampling_rate_hz: int = 10,
        lpf_cutoff_hz: float = 0.5,
    ):
        """
        :param raw_sampling_rate_hz: Hardware sensor sample rate (e.g., 100 Hz).
        :param target_sampling_rate_hz: ML model input rate (e.g., 10 Hz matching IO-VNBD).
        :param lpf_cutoff_hz: Low-pass filter cutoff for static gravity isolation.
        """
        self.raw_rate = raw_sampling_rate_hz
        self.target_rate = target_sampling_rate_hz
        self.decimation_factor = max(1, raw_sampling_rate_hz // target_sampling_rate_hz)
        
        # Exponential smoothing factor for discrete LPF: alpha = dt / (RC + dt)
        dt = 1.0 / raw_sampling_rate_hz
        rc = 1.0 / (2.0 * np.pi * lpf_cutoff_hz)
        self.alpha = dt / (rc + dt)
        
        self.gravity_estimate: Optional[np.ndarray] = None

    def isolate_gravity(self, accel_xyz: np.ndarray) -> Tuple[np.ndarray, np.ndarray]:
        """
        Splits raw accelerometer reading into quasi-static gravity and dynamic acceleration.
        :param accel_xyz: Array of shape [N, 3] or [3]
        :return: (dynamic_accel, gravity_vector)
        """
        accel = np.atleast_2d(accel_xyz)
        n_samples = accel.shape[0]
        dynamic_accel = np.zeros_like(accel)
        gravity = np.zeros_like(accel)
        
        if self.gravity_estimate is None:
            self.gravity_estimate = np.copy(accel[0])
            
        for i in range(n_samples):
            self.gravity_estimate = (
                self.alpha * accel[i] + (1.0 - self.alpha) * self.gravity_estimate
            )
            gravity[i] = self.gravity_estimate
            dynamic_accel[i] = accel[i] - self.gravity_estimate
            
        return np.squeeze(dynamic_accel), np.squeeze(gravity)

    def decimate_stream(self, imu_6dof: np.ndarray) -> np.ndarray:
        """
        Anti-aliasing downsampling of 6-DOF stream (ax, ay, az, gx, gy, gz).
        :param imu_6dof: Array of shape [N, 6]
        :return: Decimated array of shape [N // decimation_factor, 6]
        """
        if self.decimation_factor <= 1:
            return imu_6dof
        
        # Simple box-car averaging filter for anti-aliasing
        n_trimmed = (len(imu_6dof) // self.decimation_factor) * self.decimation_factor
        trimmed = imu_6dof[:n_trimmed]
        reshaped = trimmed.reshape(-1, self.decimation_factor, 6)
        return np.mean(reshaped, axis=1)

    def create_sliding_windows(
        self,
        imu_stream: np.ndarray,
        window_size: int = 10,
        stride: int = 1,
    ) -> np.ndarray:
        """
        Constructs rolling sliding window tensors for neural network inference.
        :param imu_stream: Array of shape [Total_Samples, 6]
        :param window_size: Number of time-steps per window (e.g., 10 steps @ 10 Hz = 1.0 s).
        :param stride: Window shift step (e.g., 1 step = 10 Hz inference rate).
        :return: 3D tensor of shape [Num_Windows, 6, window_size] (Channels-First)
        """
        num_samples = len(imu_stream)
        if num_samples < window_size:
            return np.empty((0, 6, window_size), dtype=np.float32)
            
        num_windows = (num_samples - window_size) // stride + 1
        windows = np.zeros((num_windows, 6, window_size), dtype=np.float32)
        
        for i in range(num_windows):
            start_idx = i * stride
            end_idx = start_idx + window_size
            # Transpose to Channels-First [6, window_size] for PyTorch Conv1D
            windows[i] = imu_stream[start_idx:end_idx].T
            
        return windows
