"""
=============================================================================
NAVICORE AI: PYTHON FLEET SDK
Smart India Hackathon 2026 | Problem Statement ID: 260168
Theme: Smart Vehicles | Team: @enigm@ (Team ID: 132834)
=============================================================================
Pure-Python reference SDK for automotive fleet telematics, dispatch platforms,
and offline simulation / evaluation.
"""

from .fusion import NaviCoreSDK, NavicoreSdk, FusionCoreSDK
from .state import NavigationState

__all__ = [
    "NaviCoreSDK",
    "NavicoreSdk",
    "FusionCoreSDK",
    "NavigationState",
]

__version__ = "1.0.0"
