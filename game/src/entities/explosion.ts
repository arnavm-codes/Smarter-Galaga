import { PALETTE } from "../engine/constants";

const DURATION = 0.35; // seconds, full burst-and-fade
const PARTICLE_COUNT = 8;

interface Particle {
  angle: number;
  speed: number; // px/sec, outward from center
  size: number;
}

// A short-lived procedural "boom" — no sprite, just an expanding core flash plus outward
// particle sparks drawn from the CRT palette, matching the rest of the game's rendering style.
export class Explosion {
  alive = true;
  private elapsed = 0;
  private particles: Particle[];

  constructor(
    private x: number,
    private y: number
  ) {
    this.particles = Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
      angle: (i / PARTICLE_COUNT) * Math.PI * 2 + Math.random() * 0.5,
      speed: 30 + Math.random() * 40,
      size: 1 + Math.random() * 2,
    }));
  }

  update(dt: number): void {
    this.elapsed += dt;
    if (this.elapsed >= DURATION) this.alive = false;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const t = Math.min(1, this.elapsed / DURATION);

    ctx.save();
    ctx.globalAlpha = Math.max(0, 1 - t);

    const coreRadius = 6 * (1 - t * 0.8);
    ctx.fillStyle = t < 0.4 ? PALETTE.explosionCore : PALETTE.explosionMid;
    ctx.beginPath();
    ctx.arc(this.x, this.y, Math.max(0, coreRadius), 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = PALETTE.explosionOuter;
    for (const p of this.particles) {
      const dist = p.speed * this.elapsed;
      const px = Math.round(this.x + Math.cos(p.angle) * dist);
      const py = Math.round(this.y + Math.sin(p.angle) * dist);
      ctx.fillRect(px, py, p.size, p.size);
    }

    ctx.restore();
  }
}
