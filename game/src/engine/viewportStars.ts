interface Star {
  x: number;
  y: number;
  size: number;
  phase: number;
  speed: number;
}

const DENSITY = 6000; // px^2 per star

// A separate, viewport-sized starfield drawn on its own full-screen canvas behind the game
// canvas — fills the letterboxed area around the fixed-aspect play field with the same look.
export class ViewportStars {
  private ctx: CanvasRenderingContext2D;
  private stars: Star[] = [];
  private width = 0;
  private height = 0;

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D canvas context unavailable");
    this.ctx = ctx;
    this.resize();
    window.addEventListener("resize", () => this.resize());
  }

  private resize(): void {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.canvas.width = this.width;
    this.canvas.height = this.height;

    const count = Math.floor((this.width * this.height) / DENSITY);
    this.stars = Array.from({ length: count }, () => ({
      x: Math.random() * this.width,
      y: Math.random() * this.height,
      size: Math.random() < 0.85 ? 1 : 2,
      phase: Math.random() * Math.PI * 2,
      speed: 0.5 + Math.random() * 1.5,
    }));
  }

  draw(t: number): void {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);
    ctx.save();
    ctx.fillStyle = "#ffffff";
    for (const star of this.stars) {
      ctx.globalAlpha = 0.25 + 0.45 * (0.5 + 0.5 * Math.sin(t * star.speed + star.phase));
      ctx.fillRect(Math.round(star.x), Math.round(star.y), star.size, star.size);
    }
    ctx.restore();
  }
}
