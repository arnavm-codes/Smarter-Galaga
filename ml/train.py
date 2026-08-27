"""Trains and compares the movement-prediction models (see vault memo:
"Prediction engine" + "Testing the prediction model").

Three candidates, evaluated on the same held-out sessions:
  1. baseline  -- last-velocity extrapolation (x + vx*dt), no fitting.
  2. linear    -- LinearRegression predicting next x from lag features.
  3. logistic  -- LogisticRegression predicting discretized move
                  (left/right/stay) from the same lag features.

Split is by *session*, not by row, so a session's own pattern can't leak
from train into test.
"""

import random
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.linear_model import LinearRegression, LogisticRegression
from sklearn.metrics import accuracy_score, mean_absolute_error, mean_squared_error

from constants import DT
from features import FEATURE_COLUMNS, HORIZON_FRAMES, MOVE_DEADZONE, build_features

HORIZON_S = HORIZON_FRAMES * DT

DATA_DIR = Path(__file__).parent / "data" / "synthetic"
MODEL_DIR = Path(__file__).parent / "models"
TEST_FRACTION = 0.2
SEED = 42


def load_sessions() -> dict[str, pd.DataFrame]:
    sessions = {}
    for path in sorted(DATA_DIR.glob("*.csv")):
        df = pd.read_csv(path)
        sessions[path.stem] = df
    return sessions


def split_sessions(session_ids: list[str]) -> tuple[list[str], list[str]]:
    rng = random.Random(SEED)
    ids = list(session_ids)
    rng.shuffle(ids)
    n_test = max(1, int(len(ids) * TEST_FRACTION))
    return ids[n_test:], ids[:n_test]


def featurize_all(sessions: dict[str, pd.DataFrame], ids: list[str]) -> pd.DataFrame:
    frames = []
    for sid in ids:
        feats = build_features(sessions[sid])
        feats["session_id"] = sid
        frames.append(feats)
    return pd.concat(frames, ignore_index=True)


def eval_baseline(df: pd.DataFrame) -> dict:
    # x_lag0 is current x, vx_lag0 is current velocity.
    pred = df["x_lag0"] + df["vx_lag0"] * HORIZON_S
    return {
        "mae": mean_absolute_error(df["target_x"], pred),
        "mse": mean_squared_error(df["target_x"], pred),
    }


def eval_linear(train_df: pd.DataFrame, test_df: pd.DataFrame) -> tuple[dict, LinearRegression]:
    model = LinearRegression()
    model.fit(train_df[FEATURE_COLUMNS], train_df["target_x"])
    pred = model.predict(test_df[FEATURE_COLUMNS])
    return {
        "mae": mean_absolute_error(test_df["target_x"], pred),
        "mse": mean_squared_error(test_df["target_x"], pred),
    }, model


def eval_logistic(train_df: pd.DataFrame, test_df: pd.DataFrame) -> tuple[dict, LogisticRegression]:
    model = LogisticRegression(max_iter=1000)
    model.fit(train_df[FEATURE_COLUMNS], train_df["target_move"])
    pred = model.predict(test_df[FEATURE_COLUMNS])
    return {
        "accuracy": accuracy_score(test_df["target_move"], pred),
    }, model


def baseline_move_accuracy(df: pd.DataFrame) -> float:
    """Baseline's implied move class, for an apples-to-apples comparison
    against the classifier's accuracy metric."""
    pred_x = df["x_lag0"] + df["vx_lag0"] * HORIZON_S
    delta = pred_x - df["x_lag0"]
    pred_move = np.select([delta > MOVE_DEADZONE, delta < -MOVE_DEADZONE], [1, -1], default=0)
    return accuracy_score(df["target_move"], pred_move)


def main() -> None:
    sessions = load_sessions()
    print(f"Loaded {len(sessions)} sessions from {DATA_DIR}")

    train_ids, test_ids = split_sessions(list(sessions.keys()))
    print(f"Split: {len(train_ids)} train sessions / {len(test_ids)} test sessions")

    train_df = featurize_all(sessions, train_ids)
    test_df = featurize_all(sessions, test_ids)
    print(f"Featurized rows: {len(train_df)} train / {len(test_df)} test")

    baseline_metrics = eval_baseline(test_df)
    linear_metrics, linear_model = eval_linear(train_df, test_df)
    logistic_metrics, logistic_model = eval_logistic(train_df, test_df)
    baseline_acc = baseline_move_accuracy(test_df)

    print("\n--- Numeric position prediction (MAE / MSE, px) ---")
    print(f"  baseline (last-velocity):  MAE={baseline_metrics['mae']:.3f}  MSE={baseline_metrics['mse']:.3f}")
    print(f"  linear regression:         MAE={linear_metrics['mae']:.3f}  MSE={linear_metrics['mse']:.3f}")

    print("\n--- Discretized move classification (accuracy) ---")
    print(f"  baseline (implied move):   {baseline_acc:.3%}")
    print(f"  logistic regression:       {logistic_metrics['accuracy']:.3%}")

    print("\n--- Per-pattern breakdown (linear model MAE) ---")
    test_patterns = test_df.copy()
    test_patterns["pattern"] = test_patterns["session_id"].str.rsplit("_", n=1).str[0]
    pred = linear_model.predict(test_df[FEATURE_COLUMNS])
    test_patterns["abs_err"] = np.abs(pred - test_df["target_x"].values)
    print(test_patterns.groupby("pattern")["abs_err"].mean().sort_values().to_string())

    MODEL_DIR.mkdir(exist_ok=True)
    joblib.dump(linear_model, MODEL_DIR / "linear_position.joblib")
    joblib.dump(logistic_model, MODEL_DIR / "logistic_move.joblib")
    print(f"\nSaved models to {MODEL_DIR}")


if __name__ == "__main__":
    main()
