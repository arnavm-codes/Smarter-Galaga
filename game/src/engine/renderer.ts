import { GAME_WIDTH, GAME_HEIGHT, PALETTE } from "./constants";

export class Renderer {
  readonly ctx: CanvasRenderingContext2D;

  constructor(private canvas: HTMLCanvasElement) {
    canvas.width = GAME_WIDTH;
    canvas.height = GAME_HEIGHT;

    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D canvas context unavailable");
    ctx.imageSmoothingEnabled = false;
    this.ctx = ctx;

    this.fitToWindow();
    window.addEventListener("resize", () => this.fitToWindow());
  }

  // Fills the full viewport height (edge to edge, no letterboxing) — width follows the fixed
  // aspect ratio, only capped by viewport width as a safety fallback on very narrow windows.
  private fitToWindow(): void {
    const scale = Math.min(window.innerHeight / GAME_HEIGHT, window.innerWidth / GAME_WIDTH);
    this.canvas.style.width = `${GAME_WIDTH * scale}px`;
    this.canvas.style.height = `${GAME_HEIGHT * scale}px`;
  }

  clear(): void {
    this.ctx.fillStyle = PALETTE.background;
    this.ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
  }
}
