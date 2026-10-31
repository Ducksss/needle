"""The brief's tier rules and the fleet buckets.

Safe: Pc < 1e-6 and miss > 5 km. Elevated: 1e-6 <= Pc < 1e-4, or miss 1 to 5 km.
Critical: Pc >= 1e-4, or miss < 1 km. Pc is given as log10 (ESA `risk`).
"""
import numpy as np

TIERS = np.array(["Safe", "Elevated", "Critical"])
PC_CRITICAL = -4.0
PC_ELEVATED = -6.0
MISS_CRITICAL_M = 1000.0
MISS_SAFE_M = 5000.0


def pc_band(log_pc):
    """0 below 1e-6, 1 for 1e-6 to 1e-4, 2 at or above 1e-4."""
    log_pc = np.asarray(log_pc, dtype=float)
    return np.where(log_pc >= PC_CRITICAL, 2, np.where(log_pc >= PC_ELEVATED, 1, 0))


def miss_band(miss_m):
    """0 over 5 km, 1 for 1 to 5 km, 2 under 1 km."""
    miss_m = np.asarray(miss_m, dtype=float)
    return np.where(miss_m < MISS_CRITICAL_M, 2, np.where(miss_m <= MISS_SAFE_M, 1, 0))


def tier_code(log_pc, miss_m):
    return np.maximum(pc_band(log_pc), miss_band(miss_m))


def tier(log_pc, miss_m):
    """Tier names for log10 Pc and miss distance in metres."""
    return TIERS[tier_code(log_pc, miss_m)]


def bucket(log_pc, miss_m):
    """Fleet bucket: pc, hidden (Pc >= 1e-6 but miss > 5 km), distance (miss < 1 km, Pc < 1e-4) or none."""
    log_pc = np.asarray(log_pc, dtype=float)
    miss_m = np.asarray(miss_m, dtype=float)
    return np.select(
        [log_pc >= PC_CRITICAL, (miss_m > MISS_SAFE_M) & (log_pc >= PC_ELEVATED), miss_m < MISS_CRITICAL_M],
        ["pc", "hidden", "distance"], default="none")
