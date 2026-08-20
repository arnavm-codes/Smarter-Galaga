export const PIXEL_FONT = "PixelFont";

let loaded: Promise<void> | null = null;

export function waitForFont(): Promise<void> {
  if (!loaded) {
    const face = new FontFace(PIXEL_FONT, 'url("/fonts/PressStart2P-Regular.ttf")');
    loaded = face.load().then((ready) => {
      (document.fonts as unknown as { add: (font: FontFace) => void }).add(ready);
    });
  }
  return loaded;
}

export function pixelFont(px: number): string {
  return `${px}px "${PIXEL_FONT}", monospace`;
}
