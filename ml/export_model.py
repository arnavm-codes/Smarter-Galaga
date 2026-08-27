"""Exports the trained logistic-regression move classifier's coefficients
to game/src/ml/model.json (see vault memo: "how the Python-trained model
reaches the JS/TS runtime at play time" -- plain dot product, no live
Python server during play).

v1 decision (2026-08-26): classification over discretized move, not
numeric position regression -- logistic clearly beat the last-velocity
baseline on accuracy at the ~400ms prediction horizon, where linear
regression's MSE win was mostly just "avoids overshooting past the walls."
"""

import json
from datetime import datetime, timezone
from pathlib import Path

import joblib

from constants import X_MAX, X_MIN
from features import FEATURE_COLUMNS, HORIZON_FRAMES, LAG_WINDOW, MOVE_DEADZONE

MODEL_PATH = Path(__file__).parent / "models" / "logistic_move.joblib"
OUT_PATH = Path(__file__).parent.parent / "game" / "src" / "ml" / "model.json"


def main() -> None:
    model = joblib.load(MODEL_PATH)

    payload = {
        "model_type": "logistic_regression",
        "feature_order": FEATURE_COLUMNS,
        "classes": model.classes_.tolist(),
        "coef": model.coef_.tolist(),
        "intercept": model.intercept_.tolist(),
        "lag_window": LAG_WINDOW,
        "horizon_frames": HORIZON_FRAMES,
        "move_deadzone": MOVE_DEADZONE,
        "bounds": {"x_min": X_MIN, "x_max": X_MAX},
        "exported_at": datetime.now(timezone.utc).isoformat(),
    }

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(payload, indent=2) + "\n")
    print(f"Exported model to {OUT_PATH}")
    print(f"  classes={payload['classes']}  features={len(FEATURE_COLUMNS)}  coef_shape={len(payload['coef'])}x{len(payload['coef'][0])}")


if __name__ == "__main__":
    main()
