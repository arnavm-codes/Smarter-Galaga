import { GAME_HEIGHT } from "../engine/constants";
import type { Rect } from "../engine/collision";
import { sprites } from "../engine/assets";
import { BASE_ENEMY_FIRE_INTERVAL } from "../difficulty/fireRate";
import { Bullet } from "./bullet";

const WIDTH = 18;
const HEIGHT = 16;
const COLS = 8;
const ROWS = 3;
const H_SPACING = 24;
const V_SPACING = 22;
const TOP_MARGIN = 24;
const SIDE_MARGIN = 16;

const SWAY_AMPLITUDE = 14; // px the whole formation drifts side to side
const SWAY_SPEED = 0.8; // radians/sec
const BOB_AMPLITUDE = 4;
const BOB_SPEED = 1.6; // radians/sec

const DIVE_DURATION = 2.2; // seconds for a full dive-and-return loop
const DIVE_MIN_INTERVAL = 1.4;
const DIVE_MAX_INTERVAL = 3;
const MAX_CONCURRENT_DIVERS = 2;

// Fraction of dive triggers that use targeted selection instead of a uniform-random pick — a
// placeholder heuristic for "which enemy jumps" until the ML prediction engine replaces it.
const SMART_DIVE_CHANCE = 0.5;
// How far ahead (seconds) targeted dives guess the player will be, from their current velocity.
const PREDICTION_LOOKAHEAD = 0.45;

export type EnemyKind = "bee" | "butterfly";
type EnemyState = "formation" | "diving";

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function bezier(t: number, p0: number, p1: number, p2: number, p3: number): number {
  const u = 1 - t;
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
}

export class Enemy implements Rect {
  width = WIDTH;
  height = HEIGHT;
  alive = true;
  state: EnemyState = "formation";

  x: number;
  y: number;

  private diveElapsed = 0;
  private diveStartX = 0;
  private diveStartY = 0;
  private diveP1x = 0;
  private diveP1y = 0;
  private diveP2x = 0;
  private diveP2y = 0;

  constructor(
    public baseX: number,
    public baseY: number,
    public kind: EnemyKind
  ) {
    this.x = baseX;
    this.y = baseY;
  }

  startDive(targetX: number): void {
    if (this.state === "diving") return;
    this.state = "diving";
    this.diveElapsed = 0;
    this.diveStartX = this.x;
    this.diveStartY = this.y;
    const side = Math.random() < 0.5 ? -1 : 1;
    this.diveP1x = this.x + side * 40;
    this.diveP1y = this.y + 70;
    this.diveP2x = lerp(this.x, targetX, 0.5);
    this.diveP2y = GAME_HEIGHT - 70;
  }

  update(dt: number, formationOffsetX: number, formationOffsetY: number): void {
    if (this.state === "diving") {
      this.diveElapsed += dt;
      const t = Math.min(1, this.diveElapsed / DIVE_DURATION);
      this.x = bezier(t, this.diveStartX, this.diveP1x, this.diveP2x, this.baseX);
      this.y = bezier(t, this.diveStartY, this.diveP1y, this.diveP2y, this.baseY);
      if (t >= 1) this.state = "formation";
    } else {
      this.x = this.baseX + formationOffsetX;
      this.y = this.baseY + formationOffsetY;
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const sprite = this.kind === "bee" ? sprites.enemyBee : sprites.enemyButterfly;
    ctx.drawImage(sprite, Math.round(this.x), Math.round(this.y), this.width, this.height);
  }
}

// Owns the formation: layout, sway/bob idle motion, periodic dive attacks, and dumb fixed-interval fire.
export class EnemyFormation {
  enemies: Enemy[] = [];
  private t = 0;
  private fireTimer = BASE_ENEMY_FIRE_INTERVAL;
  private diveTimer = randomDiveInterval();

  constructor() {
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const kind: EnemyKind = row === 0 ? "butterfly" : "bee";
        this.enemies.push(
          new Enemy(SIDE_MARGIN + col * H_SPACING, TOP_MARGIN + row * V_SPACING, kind)
        );
      }
    }
  }

  update(dt: number, bullets: Bullet[], playerX: number, playerVX: number): void {
    this.t += dt;
    const offsetX = Math.sin(this.t * SWAY_SPEED) * SWAY_AMPLITUDE;
    const offsetY = Math.sin(this.t * BOB_SPEED) * BOB_AMPLITUDE;

    for (const enemy of this.enemies) {
      if (!enemy.alive) continue;
      enemy.update(dt, offsetX, offsetY);
    }

    this.fireTimer -= dt;
    if (this.fireTimer <= 0) {
      this.fireTimer = BASE_ENEMY_FIRE_INTERVAL;
      this.fireFromRandomEnemy(bullets);
    }

    this.diveTimer -= dt;
    if (this.diveTimer <= 0) {
      this.diveTimer = randomDiveInterval();
      this.startRandomDive(playerX, playerVX);
    }
  }

  private startRandomDive(playerX: number, playerVX: number): void {
    const divers = this.enemies.filter((e) => e.alive && e.state === "diving").length;
    if (divers >= MAX_CONCURRENT_DIVERS) return;
    const candidates = this.enemies.filter((e) => e.alive && e.state === "formation");
    if (candidates.length === 0) return;

    // Mix targeted picks in with plain-random ones so it never looks fully deterministic.
    const targeted = Math.random() < SMART_DIVE_CHANCE;
    const targetX = targeted ? playerX + playerVX * PREDICTION_LOOKAHEAD : playerX;
    const chosen = targeted
      ? this.pickWeightedByProximity(candidates, targetX)
      : candidates[Math.floor(Math.random() * candidates.length)];

    chosen.startDive(targetX);
  }

  // Weighted random pick favoring enemies closer to targetX — proximity, not certainty, so a
  // farther enemy can still be picked. Placeholder for the ML predictor's eventual target choice.
  private pickWeightedByProximity(candidates: Enemy[], targetX: number): Enemy {
    const weights = candidates.map((e) => 1 / (Math.abs(e.x - targetX) + 24));
    const total = weights.reduce((sum, w) => sum + w, 0);
    let r = Math.random() * total;
    for (let i = 0; i < candidates.length; i++) {
      r -= weights[i];
      if (r <= 0) return candidates[i];
    }
    return candidates[candidates.length - 1];
  }

  private fireFromRandomEnemy(bullets: Bullet[]): void {
    const alive = this.enemies.filter((e) => e.alive);
    if (alive.length === 0) return;
    const shooter = alive[Math.floor(Math.random() * alive.length)];
    bullets.push(
      new Bullet(shooter.x + shooter.width / 2 - 2, shooter.y + shooter.height, "enemy")
    );
  }

  draw(ctx: CanvasRenderingContext2D): void {
    for (const enemy of this.enemies) {
      if (enemy.alive) enemy.draw(ctx);
    }
  }

  get allDead(): boolean {
    return this.enemies.every((e) => !e.alive);
  }
}

function randomDiveInterval(): number {
  return DIVE_MIN_INTERVAL + Math.random() * (DIVE_MAX_INTERVAL - DIVE_MIN_INTERVAL);
}
