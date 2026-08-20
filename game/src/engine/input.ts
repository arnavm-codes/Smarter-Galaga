export class Input {
  private held = new Set<string>();

  constructor() {
    window.addEventListener("keydown", (e) => this.held.add(e.code));
    window.addEventListener("keyup", (e) => this.held.delete(e.code));
  }

  get left(): boolean {
    return this.held.has("ArrowLeft") || this.held.has("KeyA");
  }

  get right(): boolean {
    return this.held.has("ArrowRight") || this.held.has("KeyD");
  }

  get fire(): boolean {
    return this.held.has("Space") || this.held.has("KeyZ");
  }

  get up(): boolean {
    return this.held.has("ArrowUp") || this.held.has("KeyW");
  }

  get down(): boolean {
    return this.held.has("ArrowDown") || this.held.has("KeyS");
  }

  get pause(): boolean {
    return this.held.has("Escape");
  }

  get confirm(): boolean {
    return this.held.has("Enter");
  }

  get mute(): boolean {
    return this.held.has("KeyM");
  }
}
