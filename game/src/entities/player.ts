import { GAME_WIDTH, GAME_HEIGHT } from "../engine/constants";
import type { Rect } from "../engine/collision";
import type { Input } from "../engine/input";
import { sprites } from "../engine/assets";
import { Bullet } from "./bullet";

const WIDTH = 20;
const HEIGHT = 15;
const SPEED = 90; // px/sec
const FIRE_COOLDOWN = 0.35; // seconds between player shots

// Exported for the ML feature buffer (game/src/ml/features.ts), which mirrors
// ml/constants.py's PLAYER_WIDTH/PLAYER_SPEED -- keep those two in sync by hand.
export const PLAYER_WIDTH = WIDTH;
export const PLAYER_SPEED = SPEED;

export class Player implements Rect {
  x = GAME_WIDTH / 2 - WIDTH / 2;
  y = GAME_HEIGHT - HEIGHT - 16;
  width = WIDTH;
  height = HEIGHT;
  lives = 3;
  vx = 0; // px/sec, recent horizontal velocity — a stand-in signal until the ML predictor exists
  private fireTimer = 0;

  update(dt: number, input: Input, bullets: Bullet[]): void {
    const prevX = this.x;
    if (input.left) this.x -= SPEED * dt;
    if (input.right) this.x += SPEED * dt;
    this.x = Math.max(0, Math.min(GAME_WIDTH - this.width, this.x));
    this.vx = dt > 0 ? (this.x - prevX) / dt : 0;

    this.fireTimer = Math.max(0, this.fireTimer - dt);
    if (input.fire && this.fireTimer === 0) {
      bullets.push(new Bullet(this.x + this.width / 2 - 2, this.y, "player"));
      this.fireTimer = FIRE_COOLDOWN;
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    ctx.drawImage(sprites.player, Math.round(this.x), Math.round(this.y), this.width, this.height);
  }
}
