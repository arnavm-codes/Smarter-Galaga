"""Phase 1 synthetic data generator (see vault memo: "Training data strategy").

Purpose: exercise the full log -> train -> export -> JS inference -> parity
pipeline end-to-end, not to produce a model that predicts real humans well.

Bots don't emit raw positions directly -- they emit a left/right/none input
intention each frame, which is then run through the *same* bang-bang
kinematics as game/src/entities/player.ts (fixed PLAYER_SPEED, clamped to
[X_MIN, X_MAX]). Real arcade movement is discrete/patterned like this, not
smooth -- so synthetic data should have the same shape of noise as real
telemetry will.

Output: one CSV per session under ml/data/synthetic/, columns:
    session_id, pattern, t, x, vx, input_left, input_right
"""

import csv
import math
import random
from pathlib import Path

from constants import DT, FPS, PLAYER_SPEED, X_MAX, X_MIN

DATA_DIR = Path(__file__).parent / "data" / "synthetic"

SESSIONS_PER_PATTERN = 8
MIN_DURATION_S = 15.0
MAX_DURATION_S = 35.0

# Deadzone so the bang-bang controller doesn't chatter left/right every
# frame once it's within a few px of its target.
TARGET_TOLERANCE = 4.0


def clamp(v: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, v))


def step(x: float, left: bool, right: bool) -> tuple[float, float]:
    """One frame of the same kinematics as Player.update()."""
    prev_x = x
    if left:
        x -= PLAYER_SPEED * DT
    if right:
        x += PLAYER_SPEED * DT
    x = clamp(x, X_MIN, X_MAX)
    vx = (x - prev_x) / DT
    return x, vx


def seek_input(x: float, target: float) -> tuple[bool, bool]:
    """Bang-bang controller: move toward `target`, like a player nudging
    the stick toward where they want to be."""
    if x < target - TARGET_TOLERANCE:
        return False, True
    if x > target + TARGET_TOLERANCE:
        return True, False
    return False, False


def maybe_flip_noise(left: bool, right: bool, flip_prob: float) -> tuple[bool, bool]:
    """Randomly perturb an otherwise-deterministic input decision, to
    simulate an imperfect/noisy player rather than a perfect bot."""
    if random.random() < flip_prob:
        choice = random.choice(["left", "right", "none"])
        return choice == "left", choice == "right"
    return left, right


# --- pattern generators -----------------------------------------------
# Each yields (left, right) input intention for frame index i, given
# current x and elapsed time t. Patterns close over per-session random
# params so sessions of the same pattern still vary.

def make_sine(duration: float):
    period = random.uniform(3.0, 8.0)
    amplitude = random.uniform(0.3, 0.48) * (X_MAX - X_MIN)
    center = (X_MIN + X_MAX) / 2
    phase = random.uniform(0, math.tau)

    def gen(x: float, t: float):
        target = center + amplitude * math.sin(math.tau * t / period + phase)
        return seek_input(x, target)

    return gen


def make_ping_pong(duration: float):
    pause_s = random.uniform(0.0, 0.6)
    state = {"target": X_MAX, "pause_until": 0.0}

    def gen(x: float, t: float):
        if t < state["pause_until"]:
            return False, False
        if abs(x - state["target"]) < TARGET_TOLERANCE:
            state["target"] = X_MIN if state["target"] == X_MAX else X_MAX
            state["pause_until"] = t + pause_s
            return False, False
        return seek_input(x, state["target"])

    return gen


def make_step_and_pause(duration: float):
    state = {"until": 0.0, "left": False, "right": False}

    def gen(x: float, t: float):
        if t >= state["until"]:
            roll = random.random()
            if roll < 0.35:
                state["left"], state["right"] = True, False
                state["until"] = t + random.uniform(0.3, 1.5)
            elif roll < 0.7:
                state["left"], state["right"] = False, True
                state["until"] = t + random.uniform(0.3, 1.5)
            else:
                state["left"], state["right"] = False, False
                state["until"] = t + random.uniform(0.2, 1.0)
        left, right = state["left"], state["right"]
        # clamp intent to avoid pinning against an edge for the whole pause
        if x <= X_MIN + 1 and left:
            left = False
        if x >= X_MAX - 1 and right:
            right = False
        return left, right

    return gen


def make_dodge_and_return(duration: float):
    center = (X_MIN + X_MAX) / 2
    state = {"dodging_until": 0.0, "next_dodge": random.uniform(1.0, 3.0), "target": center}

    def gen(x: float, t: float):
        if t >= state["next_dodge"] and t >= state["dodging_until"]:
            edge = random.choice([X_MIN, X_MAX])
            state["target"] = edge + random.uniform(0, 20) * (1 if edge == X_MIN else -1)
            state["dodging_until"] = t + random.uniform(0.4, 1.0)
            state["next_dodge"] = state["dodging_until"] + random.uniform(1.5, 4.0)
        elif t >= state["dodging_until"]:
            state["target"] = center
        return seek_input(x, state["target"])

    return gen


def make_edge_hugging(duration: float):
    edge = random.choice([X_MIN, X_MAX])
    margin = random.uniform(5, 25)
    hug_target = edge + margin * (1 if edge == X_MIN else -1)
    state = {"next_relief": random.uniform(3.0, 6.0), "relief_until": 0.0}

    def gen(x: float, t: float):
        if t >= state["next_relief"] and t >= state["relief_until"]:
            state["relief_until"] = t + random.uniform(0.5, 1.2)
            state["next_relief"] = state["relief_until"] + random.uniform(3.0, 6.0)
        if t < state["relief_until"]:
            return seek_input(x, (X_MIN + X_MAX) / 2)
        return seek_input(x, hug_target)

    return gen


PATTERNS = {
    "sine": (make_sine, 0.0),
    "ping_pong": (make_ping_pong, 0.0),
    "step_and_pause": (make_step_and_pause, 0.0),
    "noisy_sine": (make_sine, 0.06),
    "noisy_ping_pong": (make_ping_pong, 0.06),
    "noisy_step_and_pause": (make_step_and_pause, 0.08),
    "dodge_and_return": (make_dodge_and_return, 0.0),
    "edge_hugging": (make_edge_hugging, 0.0),
}


def generate_session(pattern_name: str, session_idx: int) -> list[dict]:
    make_fn, flip_prob = PATTERNS[pattern_name]
    duration = random.uniform(MIN_DURATION_S, MAX_DURATION_S)
    gen = make_fn(duration)

    x = random.uniform(X_MIN, X_MAX)
    vx = 0.0
    rows = []
    n_frames = int(duration * FPS)
    for i in range(n_frames):
        t = i * DT
        left, right = gen(x, t)
        if flip_prob:
            left, right = maybe_flip_noise(left, right, flip_prob)
        rows.append(
            {
                "session_id": f"{pattern_name}_{session_idx:03d}",
                "pattern": pattern_name,
                "t": round(t, 5),
                "x": round(x, 3),
                "vx": round(vx, 3),
                "input_left": int(left),
                "input_right": int(right),
            }
        )
        x, vx = step(x, left, right)
    return rows


def main(seed: int = 42) -> None:
    random.seed(seed)
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    total_sessions = 0
    total_frames = 0
    for pattern_name in PATTERNS:
        for session_idx in range(SESSIONS_PER_PATTERN):
            rows = generate_session(pattern_name, session_idx)
            out_path = DATA_DIR / f"{rows[0]['session_id']}.csv"
            with out_path.open("w", newline="") as f:
                writer = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
                writer.writeheader()
                writer.writerows(rows)
            total_sessions += 1
            total_frames += len(rows)

    print(f"Wrote {total_sessions} sessions ({total_frames} frames) to {DATA_DIR}")
    print(f"Patterns: {', '.join(PATTERNS)}")
    print(f"FPS={FPS}, dt={DT:.5f}s")


if __name__ == "__main__":
    main()
