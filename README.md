# Smarter Galaga

A retro Galaga clone with a twist: an ML prediction engine learns how you move and aims enemy fire accordingly, and difficulty scales dynamically based on how well you're playing. Personal learning project, not a shipping product.

## Stack

- **Game (`game/`):** TypeScript + Vite, rendered on a raw `<canvas>` (no game engine framework) at a fixed 224×288 internal resolution, scaled up with nearest-neighbor for crisp pixel art.
- **ML (`ml/`):** Python (`uv`-managed) + scikit-learn, training a logistic regression move classifier (left/right/stay, ~400ms lookahead) on synthetic bot data. Exported to `game/src/ml/model.json` and reimplemented as a plain dot product in `game/src/ml/inference.ts` for runtime inference — no Python server needed during play. Not wired into the live game loop yet (predictions aren't driving enemy fire).

## Prediction model

- **Model:** `sklearn.linear_model.LogisticRegression`, multinomial over 3 classes (left / stay / right), predicting the player's discretized move ~400ms ahead (24 frames @ 60fps — roughly matches enemy-bullet travel time, chosen because 1-frame-ahead prediction turned out to be trivial under this game's bang-bang movement and didn't discriminate between models at all). Inputs are 10 causal lag features: current + 4 previous x positions, current + previous velocity, time since last direction change, and distance to each screen edge — see `ml/features.py`.
- **Hyperparameters:** sklearn defaults, not tuned. Only `max_iter=1000` is set explicitly (to guarantee convergence on the synthetic dataset size). No regularization (`C`) search, no `class_weight` balancing, no solver comparison has been done yet — flagged as an open gap, not a considered decision. Worth revisiting given the eval below shows the "stay" class is the weakest.
- **Training data:** synthetic only so far (`ml/generate_synthetic.py`) — 64 sessions / ~96K frames across 8 scripted bot behavior patterns, bootstrapped to validate the pipeline, not to predict real humans well. No real playtest data yet (see `ml/data/` in the vault memo's training-data-strategy section for the phased plan).
- **Testing performed** (`ml/train.py` + `ml/evaluate.py`, session-level train/test split so a pattern can't leak across the split):
  - Accuracy vs. a last-velocity-extrapolation baseline: **86.4% vs. 83.9%**.
  - Per-class precision/recall: left 0.87/0.91, stay 0.78/0.71, right 0.89/0.89 — "stay" is the weakest class, not just accuracy hiding majority-class guessing (baseline "stay" prevalence in test data is ~20%, not dominant).
  - Per-pattern accuracy ranges from 64.3% (`noisy_step_and_pause`, hardest) to 93.0% (`noisy_ping_pong`, easiest).
  - Qualitative predicted-vs-actual plot over a held-out session: tracks the overall trajectory well but overshoots at direction reversals near the play-field edges — a known weak spot, not yet addressed, arguably fine for v1 given the memo's "deliberate imperfection" goal.
  - Port correctness (not model quality) is checked separately by `ml/parity_test.py`, diffing the Python model's output against the TypeScript port on 200 feature vectors — passes with float-noise-level differences (~1e-15).

## Getting started

Requires Node ≥ 20 (managed via `nvm` — `nvm use` if you have it installed) and Python 3.12+ with [`uv`](https://github.com/astral-sh/uv) for the ML side.

```bash
cd game
npm install
npm run dev
```

Open the printed localhost URL. Controls: arrow keys or A/D to move, Space or Z to fire.

For the ML side:

```bash
cd ml
uv sync
uv run generate_synthetic.py   # writes synthetic session data to ml/data/synthetic/
uv run train.py                # trains + compares baseline/linear/logistic models
uv run evaluate.py             # confusion matrix, per-class/per-pattern metrics, qualitative plot
uv run export_model.py         # exports the logistic model to game/src/ml/model.json
uv run parity_test.py          # diffs Python model output against the TS port
```

## Assets

Sprites and SFX are from [Kenney's Space Shooter Redux](https://opengameart.org/content/space-shooter-redux) pack (CC0 — see `game/assets/LICENSE-kenney-space-shooter-redux.txt`). Swap files in `game/assets/sprites/` to reskin.

UI text uses [Press Start 2P](https://fonts.google.com/specimen/Press+Start+2P) (SIL Open Font License — see `game/assets/fonts/LICENSE-press-start-2p.txt`), self-hosted so there's no runtime CDN dependency.

## Project structure

The full planned layout also includes a `game/src/telemetry/` logger and richer K/D-band difficulty scaling — only what's actually built exists in the tree so far:

```
game/
├── src/
│   ├── main.ts          # game loop
│   ├── engine/           # renderer, input, collision, constants, asset loading
│   ├── entities/         # player, enemy formation, bullets
│   ├── difficulty/       # fire-rate tuning (flat for now; K/D-band scaling comes with ML integration)
│   └── ml/                # inference.ts (TS port), model.json (exported coefficients), parityCheck.ts (parity-test CLI helper)
├── assets/               # sprites, audio (CC0, see license file above)
└── index.html

ml/
├── data/synthetic/       # generated bot session logs (position, velocity, input per frame)
├── models/                # trained model artifacts (joblib)
├── constants.py           # mirrors game/src/engine/constants.ts + player.ts movement constants
├── generate_synthetic.py  # Phase 1 synthetic bot data generator
├── features.py            # lag-window feature engineering + prediction targets
├── train.py               # trains + compares baseline/linear/logistic models
├── export_model.py        # exports the logistic model to game/src/ml/model.json
├── parity_test.py         # diffs Python model output against the TS port
└── evaluate.py             # confusion matrix, per-class + per-pattern metrics, qualitative plot
```
