// Internal render resolution — classic arcade vertical proportions (Galaga was 224x288).
// Everything is drawn at this resolution, then scaled up with nearest-neighbor for the pixel-art look.
export const GAME_WIDTH = 224;
export const GAME_HEIGHT = 288;

// Limited CRT-era palette. Keep additions to this list, don't introduce arbitrary colors elsewhere.
export const PALETTE = {
  background: "#000000",
  player: "#3ad63a",
  playerBullet: "#ffffff",
  enemyBee: "#e8c93a",
  enemyButterfly: "#3aa0e8",
  enemyBullet: "#e83a5a",
  hud: "#ffffff",
  hudAccent: "#e8c93a",
  border: "#3a5ae8",
  explosionCore: "#ffffff",
  explosionMid: "#e8c93a",
  explosionOuter: "#e8623a",
} as const;
