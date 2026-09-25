"""
NaviCore AI: Multi-Task Loss Functions.
Implements Gaussian Negative Log-Likelihood (NLL) for heteroscedastic uncertainty
and Binary Cross-Entropy (BCE) for Zero-Velocity classification.
"""

import torch
import torch.nn as nn


class MultiTaskOdometerLoss(nn.Module):
    def __init__(
        self,
        weight_speed_nll: float = 1.0,
        weight_zupt_bce: float = 0.5,
    ):
        super().__init__()
        self.w_nll = weight_speed_nll
        self.w_bce = weight_zupt_bce
        self.bce_fn = nn.BCELoss()

    def forward(
        self,
        pred_vx: torch.Tensor,
        pred_variance: torch.Tensor,
        pred_zupt: torch.Tensor,
        target_vx: torch.Tensor,
        target_zupt: torch.Tensor,
    ):
        """
        :param pred_vx: [Batch, 1] predicted velocity
        :param pred_variance: [Batch, 1] predicted variance sigma^2
        :param pred_zupt: [Batch, 1] predicted probability of stop
        :param target_vx: [Batch, 1] ground truth forward velocity
        :param target_zupt: [Batch, 1] ground truth binary stopped flag
        """
        # 1. Gaussian NLL Loss: 0.5 * ( (y - y_hat)^2 / sigma^2 + ln(sigma^2) )
        squared_error = (target_vx - pred_vx) ** 2
        nll_loss = 0.5 * (squared_error / pred_variance + torch.log(pred_variance))
        loss_speed = torch.mean(nll_loss)

        # 2. Binary Cross-Entropy for ZUPT
        loss_zupt = self.bce_fn(pred_zupt, target_zupt)

        # Combined Total Multi-Task Loss
        total_loss = (self.w_nll * loss_speed) + (self.w_bce * loss_zupt)

        return total_loss, loss_speed, loss_zupt
