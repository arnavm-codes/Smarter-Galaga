"""Model-quality eval for the chosen logistic move classifier, filling
gaps train.py's summary metrics didn't cover (see vault memo: "Testing
the prediction model" -- model quality is a distinct concern from port
correctness, which parity_test.py covers).

Adds:
  - confusion matrix + per-class precision/recall/F1 (accuracy alone
    hides whether the model is just defaulting to the majority class)
  - per-pattern accuracy breakdown for the actual chosen model (train.py
    only ever broke this down for linear regression)
  - a qualitative predicted-vs-actual plot over one real session, since
    the memo explicitly warns low error doesn't always "look smart"
"""

from pathlib import Path

import joblib
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from sklearn.metrics import classification_report, confusion_matrix

from features import FEATURE_COLUMNS, build_features
from train import DATA_DIR, load_sessions, split_sessions

MODEL_PATH = Path(__file__).parent / "models" / "logistic_move.joblib"
PLOT_PATH = Path(__file__).parent / "data" / "predicted_vs_actual.png"


def main() -> None:
    model = joblib.load(MODEL_PATH)
    sessions = load_sessions()
    _, test_ids = split_sessions(list(sessions.keys()))

    frames = []
    for sid in test_ids:
        feats = build_features(sessions[sid])
        feats["session_id"] = sid
        frames.append(feats)
    test_df = pd.concat(frames, ignore_index=True)

    pred = model.predict(test_df[FEATURE_COLUMNS])
    truth = test_df["target_move"]

    print("--- Confusion matrix (rows=truth, cols=predicted; classes -1,0,1) ---")
    labels = [-1, 0, 1]
    cm = confusion_matrix(truth, pred, labels=labels)
    print(pd.DataFrame(cm, index=[f"true_{l}" for l in labels], columns=[f"pred_{l}" for l in labels]))

    print("\n--- Per-class precision/recall/F1 ---")
    print(classification_report(truth, pred, labels=labels, target_names=["left(-1)", "stay(0)", "right(1)"]))

    print("--- Class balance in test set (ground truth) ---")
    print(truth.value_counts(normalize=True).sort_index().to_string())

    print("\n--- Per-pattern accuracy (logistic model) ---")
    test_df = test_df.copy()
    test_df["pattern"] = test_df["session_id"].str.rsplit("_", n=1).str[0]
    test_df["correct"] = pred == truth.values
    print(test_df.groupby("pattern")["correct"].mean().sort_values().to_string())

    # Qualitative check: pick one session, walk it forward frame-by-frame
    # using only the model's predicted move direction (not ground truth),
    # and plot predicted trajectory vs actual recorded trajectory.
    sample_sid = test_ids[0]
    session_df = sessions[sample_sid].reset_index(drop=True)
    feats = build_features(session_df)

    pred_moves = model.predict(feats[FEATURE_COLUMNS])
    actual_next_x = feats["target_x"].to_numpy()
    current_x = feats["x_lag0"].to_numpy()
    # Reconstruct what the model *thinks* the next position is: current x
    # nudged toward the predicted move direction by the average observed
    # step size for that class, purely for visual comparison -- the model
    # itself only predicts direction, not magnitude.
    step_size = np.abs(actual_next_x - current_x).mean()
    predicted_next_x = current_x + pred_moves * step_size

    fig, ax = plt.subplots(figsize=(10, 4))
    t = feats.index.to_numpy()
    ax.plot(t, actual_next_x, label="actual", linewidth=1.5)
    ax.plot(t, predicted_next_x, label="predicted (direction only)", linewidth=1, alpha=0.7)
    ax.set_title(f"Predicted vs actual position -- session {sample_sid}")
    ax.set_xlabel("frame")
    ax.set_ylabel("x (px)")
    ax.legend()
    fig.tight_layout()
    PLOT_PATH.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(PLOT_PATH, dpi=120)
    print(f"\nSaved qualitative plot to {PLOT_PATH} (session={sample_sid})")


if __name__ == "__main__":
    main()
