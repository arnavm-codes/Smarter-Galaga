# Smarter Galaga

A retro Galaga clone with a twist: an ML prediction engine learns how you move and aims enemy fire accordingly, and difficulty scales dynamically based on how well you're playing. Personal learning project, not a shipping product.

## Status

**v1, step 1 in progress:** minimal playable game skeleton. Player movement/shooting, enemy formation with fixed-interval fire, collision, lives/score HUD — all working, no ML yet. The prediction engine and adaptive difficulty come later, once this core loop is solid.

## Stack

- **Game (`game/`):** TypeScript + Vite, rendered on a raw `<canvas>` (no game engine framework) at a fixed 224×288 internal resolution, scaled up with nearest-neighbor for crisp pixel art.
- **ML (`ml/`, not started yet):** Python/sklearn for training the movement-prediction regression model, exported to JSON and reimplemented as a plain dot product in TypeScript for runtime inference — no Python server needed during play.

## Getting started

Requires Node ≥ 20 (managed via `nvm` — `nvm use` if you have it installed) and Python 3.12+ with [`uv`](https://github.com/astral-sh/uv) for the ML side later on.

```bash
cd game
npm install
npm run dev
```

Open the printed localhost URL. Controls: arrow keys or A/D to move, Space or Z to fire.

## Assets

Sprites and SFX are from [Kenney's Space Shooter Redux](https://opengameart.org/content/space-shooter-redux) pack (CC0 — see `game/assets/LICENSE-kenney-space-shooter-redux.txt`). Swap files in `game/assets/sprites/` to reskin.

UI text uses [Press Start 2P](https://fonts.google.com/specimen/Press+Start+2P) (SIL Open Font License — see `game/assets/fonts/LICENSE-press-start-2p.txt`), self-hosted so there's no runtime CDN dependency.

## Project structure

The full planned layout includes an `ml/` training pipeline, `telemetry/`, and richer difficulty scaling logic — only what's actually built exists in the tree so far:

```
game/
├── src/
│   ├── main.ts          # game loop
│   ├── engine/           # renderer, input, collision, constants, asset loading
│   ├── entities/         # player, enemy formation, bullets
│   └── difficulty/       # fire-rate tuning (flat for now; K/D-band scaling comes with ML integration)
├── assets/               # sprites, audio (CC0, see license file above)
└── index.html
```
