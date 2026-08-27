import { GAME_WIDTH, GAME_HEIGHT, PALETTE } from "./engine/constants";
import { Renderer } from "./engine/renderer";
import { Input } from "./engine/input";
import { intersects } from "./engine/collision";
import { Player } from "./entities/player";
import { Bullet } from "./entities/bullet";
import { EnemyFormation } from "./entities/enemy";
import { Explosion } from "./entities/explosion";
import { waitForSprites, sprites } from "./engine/assets";
import { waitForFont, pixelFont } from "./engine/fonts";
import { drawStarfield } from "./engine/starfield";
import { ViewportStars } from "./engine/viewportStars";
import { FeatureBuffer, moveToTargetX } from "./ml/features";
import { predictMove } from "./ml/inference";

const canvas = document.getElementById("game") as HTMLCanvasElement;
const renderer = new Renderer(canvas);
const bgStars = new ViewportStars(document.getElementById("bg-stars") as HTMLCanvasElement);
const input = new Input();

type State = "start" | "playing" | "paused" | "gameover";

const PAUSE_OPTIONS = ["RESUME", "RESTART", "EXIT"] as const;

let player = new Player();
let formation = new EnemyFormation();
let bullets: Bullet[] = [];
let explosions: Explosion[] = [];
let score = 0;
let state: State = "start";
const featureBuffer = new FeatureBuffer();
let pauseMenuIndex = 0;
let clock = 0; // seconds, free-running — drives starfield twinkle and UI blink, never resets
let soundEnabled = true; // UI state only for now — no SFX are wired to gameplay events yet

const prevKeys = { confirm: false, pause: false, up: false, down: false, mute: false };
function pressedOnce(name: keyof typeof prevKeys, current: boolean): boolean {
  const isNew = current && !prevKeys[name];
  prevKeys[name] = current;
  return isNew;
}

function resetGame(): void {
  player = new Player();
  formation = new EnemyFormation();
  bullets = [];
  explosions = [];
  score = 0;
  featureBuffer.reset();
}

function update(dt: number): void {
  const confirmPressed = pressedOnce("confirm", input.confirm);
  const pausePressed = pressedOnce("pause", input.pause);
  const upPressed = pressedOnce("up", input.up);
  const downPressed = pressedOnce("down", input.down);
  if (pressedOnce("mute", input.mute)) soundEnabled = !soundEnabled;

  for (const explosion of explosions) explosion.update(dt);
  explosions = explosions.filter((e) => e.alive);

  if (state === "start") {
    if (confirmPressed) {
      resetGame();
      state = "playing";
    }
    return;
  }

  if (state === "paused") {
    if (pausePressed) {
      state = "playing";
      return;
    }
    if (upPressed) pauseMenuIndex = (pauseMenuIndex + PAUSE_OPTIONS.length - 1) % PAUSE_OPTIONS.length;
    if (downPressed) pauseMenuIndex = (pauseMenuIndex + 1) % PAUSE_OPTIONS.length;
    if (confirmPressed) {
      const choice = PAUSE_OPTIONS[pauseMenuIndex];
      if (choice === "RESUME") state = "playing";
      else if (choice === "RESTART") {
        resetGame();
        state = "playing";
      } else if (choice === "EXIT") state = "start";
    }
    return;
  }

  if (state === "gameover") {
    if (confirmPressed) {
      resetGame();
      state = "playing";
    }
    return;
  }

  if (pausePressed) {
    pauseMenuIndex = 0;
    state = "paused";
    return;
  }

  player.update(dt, input, bullets);
  featureBuffer.update(player.x, player.vx, dt);
  const features = featureBuffer.features();
  const predictedTargetX = features
    ? moveToTargetX(player.x, predictMove(features).move)
    : player.x;
  formation.update(dt, bullets, player.x, predictedTargetX);

  for (const bullet of bullets) bullet.update(dt);
  bullets = bullets.filter((b) => b.alive);

  for (const bullet of bullets) {
    if (bullet.owner !== "player") continue;
    for (const enemy of formation.enemies) {
      if (!enemy.alive) continue;
      if (intersects(bullet, enemy)) {
        enemy.alive = false;
        bullet.alive = false;
        score += 10;
        explosions.push(new Explosion(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2));
        break;
      }
    }
  }
  bullets = bullets.filter((b) => b.alive);

  for (const bullet of bullets) {
    if (bullet.owner !== "enemy") continue;
    if (intersects(bullet, player)) {
      bullet.alive = false;
      player.lives -= 1;
      explosions.push(new Explosion(player.x + player.width / 2, player.y + player.height / 2));
      if (player.lives <= 0) state = "gameover";
    }
  }
  bullets = bullets.filter((b) => b.alive);

  if (formation.allDead) formation = new EnemyFormation();
}

function drawHud(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = PALETTE.hud;
  ctx.font = pixelFont(6);
  ctx.textBaseline = "top";
  ctx.fillText(`SCORE ${score}`, 4, 4);
  ctx.fillStyle = PALETTE.hudAccent;
  ctx.textAlign = "right";
  ctx.fillText(`LIVES ${player.lives}`, GAME_WIDTH - 4, 16);
  ctx.textAlign = "left";

  if (state === "gameover") {
    ctx.fillStyle = PALETTE.hud;
    ctx.textAlign = "center";
    ctx.font = pixelFont(10);
    ctx.fillText("GAME OVER", GAME_WIDTH / 2, GAME_HEIGHT / 2 - 10);
    ctx.font = pixelFont(6);
    ctx.fillText("PRESS ENTER", GAME_WIDTH / 2, GAME_HEIGHT / 2 + 8);
    ctx.textAlign = "left";
  }
}

function drawSoundToggle(ctx: CanvasRenderingContext2D): void {
  const label = `[ SOUND: ${soundEnabled ? "ON" : "OFF"} ]`;
  ctx.font = pixelFont(5);
  ctx.textAlign = "right";
  ctx.textBaseline = "top";
  ctx.fillStyle = soundEnabled ? PALETTE.player : PALETTE.hud;
  ctx.fillText(label, GAME_WIDTH - 4, 4);
  ctx.textAlign = "left";
}

const START_SHIP_ROW = [
  sprites.player,
  sprites.enemyButterfly,
  sprites.enemyBee,
  sprites.enemyButterfly,
  sprites.enemyBee,
];

function drawStartScreen(ctx: CanvasRenderingContext2D): void {
  ctx.textAlign = "center";

  ctx.fillStyle = PALETTE.player;
  ctx.font = pixelFont(12);
  ctx.shadowColor = PALETTE.player;
  ctx.shadowBlur = 8;
  ctx.fillText("SMARTER", GAME_WIDTH / 2, 44);
  ctx.fillText("GALAGA", GAME_WIDTH / 2, 64);
  ctx.shadowBlur = 0;

  ctx.fillStyle = PALETTE.hud;
  ctx.font = pixelFont(6);
  ctx.globalAlpha = 0.5 + 0.5 * Math.sin(clock * 3);
  ctx.fillText("PRESS ENTER", GAME_WIDTH / 2, 104);
  ctx.fillText("TO START", GAME_WIDTH / 2, 116);
  ctx.globalAlpha = 1;

  const boxX = 12;
  const boxY = 136;
  const boxW = GAME_WIDTH - 24;
  const boxH = 96;
  ctx.strokeStyle = PALETTE.hudAccent;
  ctx.lineWidth = 1;
  ctx.strokeRect(boxX, boxY, boxW, boxH);

  ctx.fillStyle = PALETTE.hudAccent;
  ctx.font = pixelFont(5);
  const controlLines = ["ARROWS/A-D MOVE", "SPACE/Z FIRE", "ESC PAUSE", "ENTER SELECT"];
  controlLines.forEach((line, i) => {
    ctx.fillText(line, GAME_WIDTH / 2, boxY + 22 + i * 18);
  });

  const shipY = GAME_HEIGHT - 30;
  const shipSpacing = 26;
  const shipStartX = GAME_WIDTH / 2 - ((START_SHIP_ROW.length - 1) * shipSpacing) / 2;
  for (let i = 0; i < START_SHIP_ROW.length; i++) {
    ctx.drawImage(START_SHIP_ROW[i], Math.round(shipStartX + i * shipSpacing - 9), shipY, 18, 16);
  }

  ctx.textAlign = "left";
}

function drawBorder(ctx: CanvasRenderingContext2D): void {
  ctx.save();
  ctx.strokeStyle = PALETTE.border;
  ctx.shadowColor = PALETTE.border;
  ctx.shadowBlur = 6;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(1, 0);
  ctx.lineTo(1, GAME_HEIGHT);
  ctx.moveTo(GAME_WIDTH - 1, 0);
  ctx.lineTo(GAME_WIDTH - 1, GAME_HEIGHT);
  ctx.stroke();
  ctx.restore();
}

function drawPauseMenu(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
  ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

  ctx.textAlign = "center";
  ctx.fillStyle = PALETTE.hud;
  ctx.font = pixelFont(10);
  ctx.fillText("PAUSED", GAME_WIDTH / 2, GAME_HEIGHT / 2 - 50);

  ctx.font = pixelFont(6);
  PAUSE_OPTIONS.forEach((label, i) => {
    const y = GAME_HEIGHT / 2 - 10 + i * 16;
    ctx.fillStyle = i === pauseMenuIndex ? PALETTE.hudAccent : PALETTE.hud;
    ctx.fillText(label, GAME_WIDTH / 2, y);
    if (i === pauseMenuIndex) {
      ctx.textAlign = "right";
      ctx.fillText(">", GAME_WIDTH / 2 - ctx.measureText(label).width / 2 - 6, y);
      ctx.textAlign = "center";
    }
  });
  ctx.textAlign = "left";
}

function drawScanlines(ctx: CanvasRenderingContext2D): void {
  ctx.save();
  ctx.globalAlpha = 0.08;
  ctx.fillStyle = "#000000";
  for (let y = 0; y < GAME_HEIGHT; y += 2) {
    ctx.fillRect(0, y, GAME_WIDTH, 1);
  }
  ctx.restore();
}

function draw(): void {
  const ctx = renderer.ctx;
  renderer.clear();
  drawStarfield(ctx, clock);

  if (state === "start") {
    drawStartScreen(ctx);
    drawBorder(ctx);
    drawSoundToggle(ctx);
    drawScanlines(ctx);
    return;
  }

  player.draw(ctx);
  formation.draw(ctx);
  for (const bullet of bullets) bullet.draw(ctx);
  for (const explosion of explosions) explosion.draw(ctx);
  drawHud(ctx);
  drawBorder(ctx);
  drawSoundToggle(ctx);

  if (state === "paused") drawPauseMenu(ctx);
  drawScanlines(ctx);
}

let lastTime = performance.now();
function loop(now: number): void {
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;
  clock += dt;

  update(dt);
  draw();
  bgStars.draw(clock);

  requestAnimationFrame(loop);
}

Promise.all([waitForSprites(), waitForFont()]).then(() => {
  lastTime = performance.now();
  requestAnimationFrame(loop);
});
