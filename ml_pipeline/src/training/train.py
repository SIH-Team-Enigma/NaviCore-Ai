"""
NaviCore AI: 1D-TCN Virtual Odometer Training Harness.
Trains the 1D-TCN model using multi-task Gaussian NLL + ZUPT BCE loss,
evaluates on a held-out test split, and exports the model.
"""

import os
import sys
import torch
import torch.optim as optim
from torch.utils.data import DataLoader, random_split
import numpy as np

# Adjust python path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from src.dataset.iovnbd_loader import SyntheticDriveDataset
from src.dataset.real_data_pipeline import IOVNBDDatasetParser
from src.models.tcn_odometer import VirtualOdometerTCN
from src.models.loss import MultiTaskOdometerLoss


class IOVNBDTorchDataset(torch.utils.data.Dataset):
    def __init__(self, s_file: str, v_file: str):
        parser = IOVNBDDatasetParser(target_rate_hz=10)
        data = parser.create_synchronized_dataset(s_file, v_file)
        self.windows = torch.tensor(data["windows"], dtype=torch.float32)
        self.target_vx = torch.tensor(data["target_vx"], dtype=torch.float32).unsqueeze(1)
        self.target_zupt = torch.tensor(data["target_zupt"], dtype=torch.float32).unsqueeze(1)

    def __len__(self):
        return len(self.windows)

    def __getitem__(self, idx):
        return self.windows[idx], self.target_vx[idx], self.target_zupt[idx]


def train_model(
    epochs: int = 15,
    batch_size: int = 64,
    lr: float = 0.002,
    save_path: str = "models/checkpoints/best_tcn.pt",
    s_csv: str = None,
    v_csv: str = None,
):
    print("=" * 65)
    print("🧠 NAVICORE AI: 1D-TCN VIRTUAL ODOMETER TRAINING PIPELINE")
    print("=" * 65)

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"[*] Training on device: {device}")

    # 1. Dataset loading (IO-VNBD real data or synthetic generator)
    if s_csv and v_csv and os.path.exists(s_csv) and os.path.exists(v_csv):
        print(f"[*] Loading Coventry University IO-VNBD dataset:\n    S: {s_csv}\n    V: {v_csv}")
        full_dataset = IOVNBDTorchDataset(s_csv, v_csv)
    elif os.path.exists("data/sample_iovnbd/S-S1.csv") and os.path.exists("data/sample_iovnbd/V-S1.csv"):
        print("[*] Loading local IO-VNBD synchronized benchmark dataset...")
        full_dataset = IOVNBDTorchDataset("data/sample_iovnbd/S-S1.csv", "data/sample_iovnbd/V-S1.csv")
    else:
        print("[*] Generating realistic vehicle dynamics dataset...")
        full_dataset = SyntheticDriveDataset(num_trajectories=40, traj_duration_s=60.0, window_len=10)
    
    total_samples = len(full_dataset)
    train_size = int(0.8 * total_samples)
    val_size = total_samples - train_size
    train_ds, val_ds = random_split(full_dataset, [train_size, val_size])

    train_loader = DataLoader(train_ds, batch_size=batch_size, shuffle=True)
    val_loader = DataLoader(val_ds, batch_size=batch_size, shuffle=False)
    print(f"[*] Dataset split: {train_size} training samples, {val_size} validation samples.")

    # 2. Model & Loss setup
    model = VirtualOdometerTCN(in_channels=6, stem_filters=32).to(device)
    criterion = MultiTaskOdometerLoss(weight_speed_nll=1.0, weight_zupt_bce=0.5)
    optimizer = optim.AdamW(model.parameters(), lr=lr, weight_decay=1e-4)
    scheduler = optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=epochs)

    os.makedirs(os.path.dirname(save_path), exist_ok=True)
    best_val_rmse = float("inf")

    # 3. Training Loop
    for epoch in range(1, epochs + 1):
        model.train()
        train_loss_total = 0.0
        
        for batch_x, batch_vx, batch_zupt in train_loader:
            batch_x = batch_x.to(device)
            batch_vx = batch_vx.to(device)
            batch_zupt = batch_zupt.to(device)

            optimizer.zero_grad()
            pred_vx, pred_var, pred_zupt = model(batch_x)
            
            loss, l_speed, l_zupt = criterion(
                pred_vx, pred_var, pred_zupt, batch_vx, batch_zupt
            )
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
            optimizer.step()

            train_loss_total += loss.item() * len(batch_x)

        scheduler.step()
        train_loss_avg = train_loss_total / train_size

        # Validation Loop
        model.eval()
        val_sq_errors = []
        zupt_correct = 0
        zupt_total = 0

        with torch.no_grad():
            for batch_x, batch_vx, batch_zupt in val_loader:
                batch_x = batch_x.to(device)
                batch_vx = batch_vx.to(device)
                batch_zupt = batch_zupt.to(device)

                pred_vx, pred_var, pred_zupt = model(batch_x)
                
                # Compute RMSE
                err = (pred_vx - batch_vx).cpu().numpy().flatten()
                val_sq_errors.extend(err ** 2)

                # Compute ZUPT accuracy
                predicted_stopped = (pred_zupt > 0.5).float()
                zupt_correct += (predicted_stopped == batch_zupt).sum().item()
                zupt_total += len(batch_zupt)

        val_rmse = np.sqrt(np.mean(val_sq_errors))
        val_zupt_acc = (zupt_correct / max(1, zupt_total)) * 100.0

        print(
            f"Epoch [{epoch:02d}/{epochs:02d}] | "
            f"Train Loss: {train_loss_avg:.4f} | "
            f"Val Speed RMSE: {val_rmse:.3f} m/s | "
            f"ZUPT Acc: {val_zupt_acc:.1f}%"
        )

        if val_rmse < best_val_rmse:
            best_val_rmse = val_rmse
            torch.save(model.state_dict(), save_path)

    print("-" * 65)
    print(f"[*] Training Complete! Best Validation Speed RMSE: {best_val_rmse:.3f} m/s")
    print(f"[*] Saved best model checkpoint to: {save_path}")

    # 4. Export to ONNX
    onnx_path = save_path.replace(".pt", ".onnx")
    dummy_input = torch.randn(1, 6, 10, device=device)
    torch.onnx.export(
        model,
        dummy_input,
        onnx_path,
        input_names=["imu_window"],
        output_names=["vx", "variance_vx", "zupt_prob"],
        dynamic_axes={"imu_window": {0: "batch_size"}},
        opset_version=14,
    )
    print(f"[*] Exported ONNX model to: {onnx_path}")


if __name__ == "__main__":
    train_model(epochs=10, batch_size=64)
