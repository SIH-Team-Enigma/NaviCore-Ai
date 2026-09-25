"""
NaviCore AI: Navigation State Data Class.
Defines telemetry state representations for the Python Fleet SDK.

Smart India Hackathon 2026 | Problem Statement ID: 260168
"""

from dataclasses import dataclass, asdict
from typing import Dict, Any


@dataclass
class NavigationState:
    """
    Standardized Navigation Telemetry State.
    """
    latitude: float = 0.0
    longitude: float = 0.0
    altitude_m: float = 0.0
    speed_kmh: float = 0.0
    speed_mps: float = 0.0
    heading_deg: float = 0.0
    estimated_drift_m: float = 0.0
    confidence_pct: float = 100.0
    navigation_mode: str = "OPEN_SKY"  # 'OPEN_SKY' | 'DEAD_RECKONING' | 'ZUPT_LOCKED'
    vehicle_profile: str = "SEDAN"
    snapped_road_id: int = 0
    snapped_confidence: float = 0.0
    is_reroute_needed: bool = False
    is_dislodged: bool = False
    within_validated_range: bool = True
    covariance_diagonal: list = None

    def __post_init__(self):
        if self.covariance_diagonal is None:
            self.covariance_diagonal = [0.0] * 15

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)
