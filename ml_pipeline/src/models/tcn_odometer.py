"""
NaviCore AI: 1D Temporal Convolutional Network (TCN) Virtual Odometer.
Multi-task neural network predicting forward longitudinal speed (Vx),
instantaneous speed variance (sigma^2), and zero-velocity probability (P_stop).
"""

import torch
import torch.nn as nn
import torch.nn.functional as F


class SqueezeAndExcitationBlock1D(nn.Module):
    """
    Channel-wise Squeeze-and-Excitation Attention for 1D time series.
    """
    def __init__(self, channels: int, reduction: int = 4):
        super().__init__()
        reduced_channels = max(4, channels // reduction)
        self.fc1 = nn.Linear(channels, reduced_channels, bias=False)
        self.fc2 = nn.Linear(reduced_channels, channels, bias=False)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        # x shape: [Batch, Channels, TimeSteps]
        b, c, _ = x.size()
        # Squeeze: Global Average Pooling across time dimension -> [Batch, Channels]
        squeeze = x.mean(dim=2)
        excitation = F.relu(self.fc1(squeeze), inplace=True)
        excitation = torch.sigmoid(self.fc2(excitation)).view(b, c, 1)
        return x * excitation


class DilatedResidualBlock1D(nn.Module):
    """
    Dilated 1D Convolutional Residual Block with Batch Normalization and SE Attention.
    """
    def __init__(
        self,
        in_channels: int,
        out_channels: int,
        kernel_size: int = 3,
        dilation: int = 1,
        dropout_p: float = 0.1,
    ):
        super().__init__()
        # Calculate padding to preserve sequence length: padding = dilation * (kernel_size - 1) // 2
        padding = (kernel_size - 1) * dilation // 2
        
        self.conv1 = nn.Conv1d(
            in_channels,
            out_channels,
            kernel_size=kernel_size,
            dilation=dilation,
            padding=padding,
            bias=False,
        )
        self.bn1 = nn.BatchNorm1d(out_channels)
        self.conv2 = nn.Conv1d(
            out_channels,
            out_channels,
            kernel_size=kernel_size,
            dilation=dilation,
            padding=padding,
            bias=False,
        )
        self.bn2 = nn.BatchNorm1d(out_channels)
        self.se = SqueezeAndExcitationBlock1D(out_channels)
        self.dropout = nn.Dropout(p=dropout_p)

        # 1x1 projection for skip connection if channel dimension changes
        if in_channels != out_channels:
            self.skip_proj = nn.Conv1d(in_channels, out_channels, kernel_size=1, bias=False)
        else:
            self.skip_proj = nn.Identity()

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        residual = self.skip_proj(x)
        
        out = F.relu(self.bn1(self.conv1(x)), inplace=True)
        out = self.dropout(out)
        out = self.bn2(self.conv2(out))
        out = self.se(out)
        
        return F.relu(out + residual, inplace=True)


class VirtualOdometerTCN(nn.Module):
    """
    1D-TCN Deep Virtual Odometer with Multi-Task Prediction Heads.
    Input Tensor: [Batch, 6, TimeSteps] (Ax, Ay, Az, Gx, Gy, Gz)
    """
    def __init__(
        self,
        in_channels: int = 6,
        stem_filters: int = 32,
        stem_kernel_size: int = 7,
        bottleneck_units: int = 64,
        dropout_p: float = 0.2,
    ):
        super().__init__()
        
        # Stem Convolution: Extract initial temporal features
        self.stem = nn.Sequential(
            nn.Conv1d(
                in_channels,
                stem_filters,
                kernel_size=stem_kernel_size,
                padding=stem_kernel_size // 2,
                bias=False,
            ),
            nn.BatchNorm1d(stem_filters),
            nn.ReLU(inplace=True),
        )

        # Dilated Residual Blocks
        self.res1 = DilatedResidualBlock1D(stem_filters, 32, kernel_size=3, dilation=1)
        self.res2 = DilatedResidualBlock1D(32, 64, kernel_size=3, dilation=2)
        self.res3 = DilatedResidualBlock1D(64, 128, kernel_size=3, dilation=4)

        # Global Pooling & Dense Bottleneck
        self.global_pool = nn.AdaptiveAvgPool1d(1)
        self.dense_bottleneck = nn.Sequential(
            nn.Linear(128, bottleneck_units),
            nn.ReLU(inplace=True),
            nn.Dropout(p=dropout_p),
        )

        # Multi-Task Prediction Heads
        # Head 1: Forward Longitudinal Speed Vx (m/s)
        self.head_vx = nn.Linear(bottleneck_units, 1)
        # Head 2: Speed Variance sigma^2 (strictly positive uncertainty via Softplus)
        self.head_variance = nn.Linear(bottleneck_units, 1)
        # Head 3: ZUPT Zero-Velocity Classifier Probability [0.0, 1.0]
        self.head_zupt = nn.Linear(bottleneck_units, 1)

    def forward(self, x: torch.Tensor):
        """
        :param x: [Batch, 6, TimeSteps]
        :return: (vx, variance_vx, zupt_prob)
        """
        feat = self.stem(x)
        feat = self.res1(feat)
        feat = self.res2(feat)
        feat = self.res3(feat)
        
        pooled = self.global_pool(feat).squeeze(dim=2)  # [Batch, 128]
        bottleneck = self.dense_bottleneck(pooled)     # [Batch, 64]
        
        vx = self.head_vx(bottleneck)
        # Softplus ensures variance is strictly positive + epsilon for stability
        variance = F.softplus(self.head_variance(bottleneck)) + 1e-4
        # Sigmoid produces probability of vehicle being stopped
        zupt_prob = torch.sigmoid(self.head_zupt(bottleneck))
        
        return vx, variance, zupt_prob
