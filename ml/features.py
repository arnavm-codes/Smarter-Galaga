"""Feature engineering shared by train.py and (later) parity_test.py.

Must stay portable to a plain dot-product reimplementation in
game/src/ml/inference.ts -- keep features to cheap, causal (no
future-peeking) arithmetic on the recent-frame window only.
"""

import numpy as np
import pandas as pd

from constants import DT, FPS, X_MAX, X_MIN

LAG_WINDOW = 5  # how many past positions feed the model

# Predicting one frame (16.7ms) ahead is trivial under bang-bang input --
# velocity barely changes frame to frame, so a naive last-velocity
# extrapolation already wins. The model only matters if it predicts far
# enough ahead to matter for aiming (~enemy-bullet travel time), so the
# target horizon is ~400ms (24 frames @ 60fps), not the next frame.
HORIZON_FRAMES = int(0.4 * FPS)
MOVE_DEADZONE = 3.0  # px of horizon displacement treated as "stay"


def _time_since_direction_change(vx: pd.Series, t: pd.Series) -> pd.Series:
    sign = np.sign(vx.round(3))
    # A direction "change" is a sign flip that isn't through zero noise;
    # treat 0 as its own state (stopped) rather than merging with the
    # previous sign so we can tell "still" apart from "still moving that way".
    changed = sign != sign.shift(1)
    changed.iloc[0] = True
    change_times = t.where(changed)
    last_change_t = change_times.ffill()
    return t - last_change_t


def build_features(df: pd.DataFrame) -> pd.DataFrame:
    """df must be one session, sorted by t, columns: t, x, vx.
    Returns a frame aligned to df's index with feature columns plus
    the regression target `target_x` (x, HORIZON_FRAMES ahead) and
    classification target `target_move` (-1 left / 0 stay / 1 right over
    that same horizon), NaN-dropped rows at the start (not enough lag
    history) and end (no frame that far ahead).
    """
    df = df.reset_index(drop=True)
    out = pd.DataFrame(index=df.index)

    # x_lag0 is the *current* frame's position -- the single most
    # predictive feature (it's what the baseline extrapolates from) --
    # x_lag1..x_lag{N-1} reach further back into history.
    for lag in range(LAG_WINDOW):
        out[f"x_lag{lag}"] = df["x"].shift(lag)
    out["vx_lag0"] = df["vx"]
    out["vx_lag1"] = df["vx"].shift(1)
    out["time_since_dir_change"] = _time_since_direction_change(df["vx"], df["t"])
    out["dist_to_left_edge"] = df["x"] - X_MIN
    out["dist_to_right_edge"] = X_MAX - df["x"]

    next_x = df["x"].shift(-HORIZON_FRAMES)
    out["target_x"] = next_x
    delta = next_x - df["x"]
    out["target_move"] = np.select(
        [delta > MOVE_DEADZONE, delta < -MOVE_DEADZONE],
        [1, -1],
        default=0,
    )

    out = out.dropna(subset=[f"x_lag{LAG_WINDOW - 1}", "target_x"])
    return out


FEATURE_COLUMNS = (
    [f"x_lag{lag}" for lag in range(LAG_WINDOW)]
    + ["vx_lag0", "vx_lag1", "time_since_dir_change", "dist_to_left_edge", "dist_to_right_edge"]
)
