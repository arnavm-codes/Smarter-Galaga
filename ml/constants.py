"""Mirrors game/src/engine/constants.ts and the movement constants in
game/src/entities/player.ts. Keep these in sync by hand until telemetry
replaces synthetic data — there's no shared source of truth across the
TS/Python boundary yet.
"""

GAME_WIDTH = 224
GAME_HEIGHT = 288

PLAYER_WIDTH = 20
PLAYER_SPEED = 90.0  # px/sec
X_MIN = 0.0
X_MAX = GAME_WIDTH - PLAYER_WIDTH  # 204

FPS = 60
DT = 1.0 / FPS
