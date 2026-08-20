import { GAME_WIDTH, GAME_HEIGHT } from "./constants";

interface Star {
  x: number;
  y: number;
  size: number;
  phase: number;
  speed: number;
}

const STAR_COUNT = 50;

function makeStars(): Star[] {
  return Array.from({ length: STAR_COUNT }, () => ({
    x: Math.random() * GAME_WIDTH,
    y: Math.random() * GAME_HEIGHT,
    size: Math.random() < 0.8 ? 1 : 2,
    phase: Math.random() * Math.PI * 2,
    speed: 0.5 + Math.random() * 1.5,
  }));
}

// Fixed positions, generated once — only the twinkle brightness animates over time.
const stars = makeStars();

export function drawStarfield(ctx: CanvasRenderingContext2D, t: number): void {
  ctx.save();
  ctx.fillStyle = "#ffffff";
  for (const star of stars) {
    ctx.globalAlpha = 0.35 + 0.55 * (0.5 + 0.5 * Math.sin(t * star.speed + star.phase));
    ctx.fillRect(Math.round(star.x), Math.round(star.y), star.size, star.size);
  }
  ctx.restore();
}
