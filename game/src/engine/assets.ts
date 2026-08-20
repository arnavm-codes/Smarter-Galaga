const cache = new Map<string, HTMLImageElement>();

function load(src: string): HTMLImageElement {
  const img = new Image();
  img.src = src;
  cache.set(src, img);
  return img;
}

// Paths are relative to Vite's publicDir ("assets/"), which is served at the site root.
export const sprites = {
  player: load("/sprites/player.png"),
  enemyBee: load("/sprites/enemy-bee.png"),
  enemyButterfly: load("/sprites/enemy-butterfly.png"),
  bulletPlayer: load("/sprites/bullet-player.png"),
  bulletEnemy: load("/sprites/bullet-enemy.png"),
};

export function waitForSprites(): Promise<void> {
  const images = Array.from(cache.values());
  return Promise.all(
    images.map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete) resolve();
          else img.addEventListener("load", () => resolve(), { once: true });
        })
    )
  ).then(() => undefined);
}
