// Live-game mirror of ml/features.py's build_features -- must stay in sync by
// hand with that file (same lag window, same time_since_dir_change logic,
// same edge-distance definitions) since there's no shared source of truth
// across the TS/Python boundary yet. Scope: turns raw per-frame player state
// (x, vx) into the feature vector predictMove() expects, causally (only past
// frames), matching FEATURE_ORDER in game/src/ml/inference.ts / model.json.
import { GAME_WIDTH } from "../engine/constants";
import { PLAYER_WIDTH, PLAYER_SPEED } from "../entities/player";
import type { Move } from "./inference";

const LAG_WINDOW = 5; // must match ml/features.py's LAG_WINDOW

const X_MIN = 0;
const X_MAX = GAME_WIDTH - PLAYER_WIDTH;

// Matches ml/features.py's HORIZON_FRAMES (24 frames @ 60fps) -- the model
// predicts move direction this far out, not a continuous displacement.
const HORIZON_SECONDS = 0.4;

// The model only outputs a class (-1/0/1), not a distance. Convert to an
// actual target x using the player's fixed movement speed over the horizon
// -- the max plausible displacement if the player held that direction the
// whole window. Real average displacement is smaller, but this gives dive
// targeting and shooter selection something concrete to aim at.
export function moveToTargetX(currentX: number, move: Move): number {
  const target = currentX + move * PLAYER_SPEED * HORIZON_SECONDS;
  return Math.max(X_MIN, Math.min(X_MAX, target));
}

export class FeatureBuffer {
  private t = 0;
  private xHistory: number[] = []; // index 0 = current frame, most recent first
  private prevVx = 0;
  private curVx = 0;
  private lastDirSign = 0;
  private dirChangeT = 0;

  // Called on game restart so a new session doesn't drag in the previous
  // session's history / elapsed time.
  reset(): void {
    this.t = 0;
    this.xHistory = [];
    this.prevVx = 0;
    this.curVx = 0;
    this.lastDirSign = 0;
    this.dirChangeT = 0;
  }

  update(x: number, vx: number, dt: number): void {
    this.t += dt;
    this.prevVx = this.curVx;
    this.curVx = vx;

    // Matches ml/features.py: np.sign(vx.round(3)), with 0 as its own state
    // (stopped) rather than merging into the previous direction.
    const sign = Math.sign(Math.round(vx * 1000) / 1000);
    if (this.xHistory.length === 0 || sign !== this.lastDirSign) {
      this.dirChangeT = this.t;
      this.lastDirSign = sign;
    }

    this.xHistory.unshift(x);
    if (this.xHistory.length > LAG_WINDOW) this.xHistory.pop();
  }

  get ready(): boolean {
    return this.xHistory.length === LAG_WINDOW;
  }

  // Returns null until enough frames have accumulated (matches Python's
  // dropna on x_lag{N-1} -- no prediction for the first LAG_WINDOW-1 frames
  // of a session).
  features(): number[] | null {
    if (!this.ready) return null;
    const [x0, x1, x2, x3, x4] = this.xHistory;
    return [
      x0,
      x1,
      x2,
      x3,
      x4,
      this.curVx,
      this.prevVx,
      this.t - this.dirChangeT,
      x0 - X_MIN,
      X_MAX - x0,
    ];
  }
}
