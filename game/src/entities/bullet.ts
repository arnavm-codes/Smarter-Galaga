import { GAME_HEIGHT } from "../engine/constants";
import type { Rect } from "../engine/collision";
import { sprites } from "../engine/assets";

export type BulletOwner = "player" | "enemy";

const WIDTH = 4;
const HEIGHT = 14;
const SPEED = 160; // px/sec

export class Bullet implements Rect {
  width = WIDTH;
  height = HEIGHT;
  alive = true;

  constructor(
    public x: number,
    public y: number,
    public owner: BulletOwner
  ) {}

  update(dt: number): void {
    const dir = this.owner === "player" ? -1 : 1;
    this.y += dir * SPEED * dt;
    if (this.y < -HEIGHT || this.y > GAME_HEIGHT + HEIGHT) this.alive = false;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const sprite = this.owner === "player" ? sprites.bulletPlayer : sprites.bulletEnemy;
    ctx.drawImage(sprite, Math.round(this.x), Math.round(this.y), this.width, this.height);
  }
}
