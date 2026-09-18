"""Port-correctness check (see vault memo: "Port correctness (Python -> JS
handoff)"). Not a model-quality check -- that's train.py's job. This only
verifies game/src/ml/inference.ts's dot product matches sklearn's, given
identical feature vectors, within float tolerance.

Re-run any time the model is retrained or model.json's export format
changes.
"""

import json
import subprocess
import sys
from pathlib import Path

import joblib
import numpy as np

from features import FEATURE_COLUMNS, build_features
from train import DATA_DIR

MODEL_PATH = Path(__file__).parent / "models" / "logistic_move.joblib"
GAME_DIR = Path(__file__).parent.parent / "game"
PARITY_SCRIPT = GAME_DIR / "src" / "ml" / "parityCheck.ts"
FIXTURES_PATH = Path(__file__).parent / "data" / "parity_fixtures.json"

N_SAMPLES = 200
TOLERANCE = 1e-6


def sample_feature_vectors(n: int, seed: int = 7) -> np.ndarray:
    rng = np.random.default_rng(seed)
    paths = sorted(DATA_DIR.glob("*.csv"))
    frames = []
    for path in rng.choice(paths, size=min(len(paths), 15), replace=False):
        import pandas as pd

        df = pd.read_csv(path)
        frames.append(build_features(df))
    all_feats = np.concatenate([f[FEATURE_COLUMNS].to_numpy() for f in frames], axis=0)
    idx = rng.choice(len(all_feats), size=min(n, len(all_feats)), replace=False)
    return all_feats[idx]


def main() -> None:
    model = joblib.load(MODEL_PATH)
    features = sample_feature_vectors(N_SAMPLES)

    py_pred = model.predict(features)
    py_proba = model.predict_proba(features)
    classes = model.classes_.tolist()

    FIXTURES_PATH.parent.mkdir(parents=True, exist_ok=True)
    FIXTURES_PATH.write_text(json.dumps(features.tolist()))

    result = subprocess.run(
        ["npx", "tsx", str(PARITY_SCRIPT), str(FIXTURES_PATH)],
        cwd=GAME_DIR,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        print("TS parity script failed:", file=sys.stderr)
        print(result.stderr, file=sys.stderr)
        sys.exit(1)

    ts_results = json.loads(result.stdout)

    n_mismatched_class = 0
    max_prob_diff = 0.0
    for i, ts_row in enumerate(ts_results):
        ts_move = ts_row["move"]
        py_move = int(py_pred[i])
        if ts_move != py_move:
            n_mismatched_class += 1
            print(f"  [{i}] class mismatch: python={py_move} ts={ts_move}")

        for class_idx, cls in enumerate(classes):
            py_p = py_proba[i, class_idx]
            ts_p = ts_row["probs"][str(cls)]
            diff = abs(py_p - ts_p)
            max_prob_diff = max(max_prob_diff, diff)
            if diff > TOLERANCE:
                print(f"  [{i}] prob mismatch for class {cls}: python={py_p:.8f} ts={ts_p:.8f} diff={diff:.2e}")

    print(f"\nChecked {len(ts_results)} feature vectors")
    print(f"Predicted-class mismatches: {n_mismatched_class}")
    print(f"Max probability diff: {max_prob_diff:.2e} (tolerance {TOLERANCE:.0e})")

    if n_mismatched_class > 0 or max_prob_diff > TOLERANCE:
        print("\nPARITY CHECK FAILED")
        sys.exit(1)
    print("\nPARITY CHECK PASSED")


if __name__ == "__main__":
    main()
