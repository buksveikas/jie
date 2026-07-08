const WIDTH = 320;
const HEIGHT = 180;
const GROUND_Y = 148;
const SPAWN_X = WIDTH + 18;

const TRACKS = [
  { title: "Jie", src: "./assets/1. EGOMAŠINA - Jie mix 2.m4a" },
  { title: "Bamboaze", src: "./assets/2. EGOMAŠINA - Bamboaze.m4a" },
  { title: "Patogu, Patinka", src: "./assets/3. EGOMAŠINA - Patogu, Patinka Mix 2.m4a" },
  { title: "Sakau Tau Labas", src: "./assets/4. EGOMAŠINA - Sakau Tau Labas mix 3.m4a" },
  { title: "Tu nežinai", src: "./assets/5. EGOMAŠINA - Tu nežinai.m4a" },
  { title: "Paleisk Jau", src: "./assets/6. EGOMAŠINA - Paleisk Jau.m4a" },
  { title: "Ūkio Mazas", src: "./assets/7. EGOMAŠINA - Ūkio Mazas (1).m4a" },
  { title: "Piktas Vyras", src: "./assets/8. EGOMAŠINA - Piktas Vyras mix 3.m4a" },
  { title: "Ne Vienas Tu", src: "./assets/9. EGOMAŠINA - Ne Vienas Tu mix 2.m4a" },
  { title: "Trys Ir", src: "./assets/10. EGOMAŠINA - Trys Ir.m4a" },
  { title: "Seagul Sounds", src: "./assets/11. EGOMAŠINA - Seagul Sounds mix 3.m4a" },
  { title: "Vesiai", src: "./assets/12. EGOMAŠINA - vesiai.m4a" },
  { title: "Plomba", src: "./assets/13. EGOMAŠINA - Plomba.m4a" }
];

const COLORS = {
  black: "#17110f",
  skyTop: "#2f8de6",
  sky: "#46b7f2",
  cloud: "#f7fbff",
  cloudBlue: "#9be3ff",
  sea: "#1192dc",
  seaDark: "#0872b9",
  foam: "#ffffff",
  sand: "#f6c86d",
  sandDark: "#df9c35",
  shell: "#fff3d8",
  palm: "#5f8e2f",
  palmDark: "#36631f",
  wood: "#9a5c25",
  sun: "#ffd23c",
  sunDark: "#f4a900",
  skin: "#ffc58f",
  skinDark: "#d88448",
  red: "#f05a28",
  redDark: "#b9321c",
  blue: "#1d63d8",
  blueDark: "#123f9a",
  yellow: "#ffd23c",
  hair: "#ffca2d",
  brown: "#8d4b19",
  white: "#ffffff",
  gray: "#cfd3d8",
  darkGray: "#303035",
  tape: "#232323",
  tapeLabel: "#ffdf52"
};

const canvas = document.querySelector("#game-canvas");
const ctx = canvas.getContext("2d", { alpha: false });
const spriteCanvas = document.createElement("canvas");
const spriteCtx = spriteCanvas.getContext("2d");
const audio = document.querySelector("#album-audio");
const startPanel = document.querySelector("#start-panel");
const startButton = document.querySelector("#start-game");
const statusLine = document.querySelector("#status-line");
const prevButton = document.querySelector("#prev-track");
const nextButton = document.querySelector("#next-track");
const musicButton = document.querySelector("#music-button");
const trackLabel = document.querySelector("#track-label");
const scoreLabel = document.querySelector("#score-label");
const bestLabel = document.querySelector("#best-label");

const keys = {
  left: false,
  right: false
};

const game = {
  state: "title",
  trackIndex: 0,
  score: 0,
  best: Number(localStorage.getItem("jie-beach-best") || 0),
  x: 62,
  jump: 0,
  vy: 0,
  jumpsLeft: 2,
  maxJumps: 2,
  jumpFlash: 0,
  invincible: 0,
  spawnTimer: 1,
  tapeTimer: 2,
  obstacles: [],
  tapes: [],
  particles: [],
  sandOffset: 0,
  waveOffset: 0,
  cloudOffset: 0,
  shake: 0,
  bass: 0,
  highs: 0,
  lastTime: performance.now()
};

let audioContext = null;
let analyser = null;
let mediaSource = null;
let frequencyData = new Uint8Array(0);
let audioWarningShown = false;
let atlasX = 0;
let atlasY = 0;
let atlasRowHeight = 0;

const SPRITES = {};

createSpriteAtlas();
loadTrack(0);
updateHud();
resize();
requestAnimationFrame(frame);

window.addEventListener("resize", resize);
window.addEventListener("keydown", handleKeyDown);
window.addEventListener("keyup", handleKeyUp);
canvas.addEventListener("pointerdown", handleCanvasTap);
audio.addEventListener("ended", nextTrack);
startButton.addEventListener("click", startGame);
prevButton.addEventListener("click", () => chooseTrack(game.trackIndex - 1));
nextButton.addEventListener("click", () => chooseTrack(game.trackIndex + 1));
musicButton.addEventListener("click", toggleMusic);

bindTouchButton("#touch-left", "left");
bindTouchButton("#touch-right", "right");
document.querySelector("#touch-jump").addEventListener("pointerdown", (event) => {
  event.preventDefault();
  if (game.state !== "playing") startGame();
  jump();
});

function resize() {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  canvas.width = Math.max(1, Math.floor(rect.width * dpr));
  canvas.height = Math.max(1, Math.floor(rect.height * dpr));
  ctx.imageSmoothingEnabled = false;
}

function frame(now) {
  const dt = Math.min(0.033, (now - game.lastTime) / 1000);
  game.lastTime = now;
  readAudio();
  update(dt);
  draw();
  requestAnimationFrame(frame);
}

function update(dt) {
  game.cloudOffset = (game.cloudOffset + dt * 7) % 220;
  game.waveOffset = (game.waveOffset + dt * (18 + game.bass * 22)) % 32;

  if (game.state !== "playing") return;

  const speed = currentSpeed();
  game.score += dt * (12 + game.trackIndex * 1.8);
  game.sandOffset = (game.sandOffset + speed * dt) % 64;
  game.invincible = Math.max(0, game.invincible - dt);
  game.jumpFlash = Math.max(0, game.jumpFlash - dt * 5);
  game.shake = Math.max(0, game.shake - dt * 16);

  if (keys.left) game.x -= dt * 115;
  if (keys.right) game.x += dt * 115;
  game.x = clamp(game.x, 12, WIDTH - 72);

  game.jump += game.vy * dt;
  game.vy -= 250 * dt;
  if (game.jump <= 0) {
    game.jump = 0;
    game.vy = 0;
    game.jumpsLeft = game.maxJumps;
  }

  game.spawnTimer -= dt;
  if (game.spawnTimer <= 0) {
    spawnObstacle();
    game.spawnTimer = nextSpawnDelay();
  }

  game.tapeTimer -= dt;
  if (game.tapeTimer <= 0) {
    spawnTape();
    game.tapeTimer = 2.4 + Math.random() * 2.2;
  }

  for (const obstacle of game.obstacles) {
    obstacle.x -= speed * dt;
    if (obstacle.kind === "ball") obstacle.spin += dt * 10;
  }

  for (const tape of game.tapes) {
    tape.x -= speed * dt;
    tape.bob += dt * 6;
  }

  for (const particle of game.particles) {
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.vy += 120 * dt;
    particle.life -= dt;
  }

  game.obstacles = game.obstacles.filter((obstacle) => obstacle.x + obstacle.w > -20);
  game.tapes = game.tapes.filter((tape) => tape.x > -16 && !tape.collected);
  game.particles = game.particles.filter((particle) => particle.life > 0);

  collectTapes();
  checkObstacleHits();
  updateHud();
}

function draw() {
  const scaleX = canvas.width / WIDTH;
  const scaleY = canvas.height / HEIGHT;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = COLORS.sky;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(scaleX, 0, 0, scaleY, 0, 0);

  const quake = game.shake > 0 ? Math.round(Math.sin(performance.now() * 0.08) * game.shake) : 0;
  ctx.save();
  ctx.translate(quake, 0);
  drawWorld();
  drawEntities();
  drawOverlayHints();
  ctx.restore();
}

function createSpriteAtlas() {
  spriteCanvas.width = 256;
  spriteCanvas.height = 256;
  spriteCtx.imageSmoothingEnabled = false;
  spriteCtx.clearRect(0, 0, spriteCanvas.width, spriteCanvas.height);

  defineCharacterSprites();
  defineWorldSprites();
}

function defineCharacterSprites() {
  for (const type of ["cap", "blond", "beard"]) {
    defineSprite(`${type}0`, 18, 44, (ox, oy) => drawCharacterSprite(ox, oy, type, 0, false));
    defineSprite(`${type}1`, 18, 44, (ox, oy) => drawCharacterSprite(ox, oy, type, 1, false));
    defineSprite(`${type}Jump`, 18, 44, (ox, oy) => drawCharacterSprite(ox, oy, type, 0, true));
  }
}

function defineWorldSprites() {
  defineSprite("tape", 16, 12, (x, y) => {
    srect(x, y, 16, 12, COLORS.black);
    srect(x + 2, y + 2, 12, 8, COLORS.tape);
    srect(x + 4, y + 3, 8, 3, COLORS.tapeLabel);
    srect(x + 3, y + 7, 3, 3, COLORS.white);
    srect(x + 10, y + 7, 3, 3, COLORS.white);
    srect(x + 6, y + 8, 4, 1, COLORS.gray);
  });

  defineSprite("crab", 22, 14, (x, y) => {
    srect(x + 3, y + 5, 16, 8, COLORS.black);
    srect(x + 5, y + 6, 12, 6, COLORS.red);
    srect(x, y + 8, 5, 2, COLORS.redDark);
    srect(x + 17, y + 8, 5, 2, COLORS.redDark);
    srect(x + 5, y + 2, 3, 4, COLORS.black);
    srect(x + 14, y + 2, 3, 4, COLORS.black);
    srect(x + 6, y + 3, 2, 2, COLORS.white);
    srect(x + 14, y + 3, 2, 2, COLORS.white);
  });

  defineSprite("cooler", 24, 23, (x, y) => {
    srect(x, y, 24, 23, COLORS.black);
    srect(x + 2, y + 2, 20, 6, COLORS.white);
    srect(x + 2, y + 8, 20, 12, COLORS.blue);
    srect(x + 5, y + 11, 14, 5, COLORS.blueDark);
    srect(x + 8, y + 1, 8, 3, COLORS.gray);
    srect(x + 3, y + 20, 4, 2, COLORS.darkGray);
    srect(x + 17, y + 20, 4, 2, COLORS.darkGray);
  });

  defineSprite("ball0", 18, 18, (x, y) => drawBallSprite(x, y, false));
  defineSprite("ball1", 18, 18, (x, y) => drawBallSprite(x, y, true));

  defineSprite("umbrella", 28, 32, (x, y) => {
    srect(x + 12, y + 9, 4, 22, COLORS.black);
    srect(x + 13, y + 10, 2, 20, COLORS.wood);
    srect(x + 1, y + 8, 26, 5, COLORS.black);
    srect(x + 3, y + 4, 22, 5, COLORS.sun);
    srect(x + 9, y + 4, 7, 7, COLORS.red);
    srect(x + 17, y + 5, 7, 4, COLORS.shell);
    srect(x + 2, y + 12, 5, 2, COLORS.redDark);
    srect(x + 21, y + 12, 5, 2, COLORS.redDark);
  });

  defineSprite("cloud", 36, 18, (x, y) => {
    srect(x, y + 9, 35, 8, COLORS.cloudBlue);
    srect(x + 4, y + 5, 23, 8, COLORS.cloud);
    srect(x + 12, y + 1, 14, 8, COLORS.cloud);
    srect(x + 26, y + 8, 9, 6, COLORS.cloud);
    srect(x + 6, y + 12, 28, 2, COLORS.foam);
  });

  defineSprite("sailboat", 28, 24, (x, y) => {
    srect(x, y + 19, 26, 3, COLORS.black);
    srect(x + 3, y + 17, 18, 3, COLORS.wood);
    srect(x + 13, y + 2, 2, 17, COLORS.black);
    srect(x + 15, y + 4, 10, 13, COLORS.white);
    srect(x + 5, y + 9, 8, 8, COLORS.shell);
    srect(x + 18, y + 15, 6, 2, COLORS.cloudBlue);
  });

  defineSprite("palm", 32, 40, (x, y) => {
    srect(x + 12, y + 10, 6, 30, COLORS.black);
    srect(x + 14, y + 11, 3, 28, COLORS.wood);
    srect(x + 7, y + 3, 16, 5, COLORS.black);
    srect(x + 1, y + 7, 18, 5, COLORS.black);
    srect(x + 16, y + 6, 16, 5, COLORS.black);
    srect(x + 7, y + 4, 15, 3, COLORS.palm);
    srect(x + 2, y + 8, 16, 3, COLORS.palmDark);
    srect(x + 17, y + 7, 14, 3, COLORS.palm);
    srect(x + 13, y + 8, 7, 3, COLORS.palmDark);
  });

  defineSprite("surfboard", 30, 8, (x, y) => {
    srect(x + 2, y + 1, 27, 6, COLORS.black);
    srect(x + 4, y + 2, 23, 4, COLORS.white);
    srect(x + 11, y + 2, 4, 4, COLORS.red);
    srect(x + 18, y + 2, 4, 4, COLORS.blue);
  });

  defineSprite("towel", 30, 12, (x, y) => {
    srect(x, y, 30, 12, COLORS.black);
    srect(x + 2, y + 2, 26, 8, COLORS.sun);
    srect(x + 8, y + 2, 5, 8, COLORS.red);
    srect(x + 19, y + 2, 5, 8, COLORS.white);
  });

  defineSprite("coolerProp", 22, 15, (x, y) => {
    srect(x, y, 22, 15, COLORS.black);
    srect(x + 2, y + 3, 18, 10, COLORS.blue);
    srect(x + 2, y + 1, 18, 5, COLORS.white);
    srect(x + 8, y + 7, 6, 2, COLORS.blueDark);
  });
}

function defineSprite(name, width, height, draw) {
  if (atlasX + width > spriteCanvas.width) {
    atlasX = 0;
    atlasY += atlasRowHeight + 2;
    atlasRowHeight = 0;
  }

  SPRITES[name] = { x: atlasX, y: atlasY, width, height };
  draw(atlasX, atlasY);
  atlasX += width + 2;
  atlasRowHeight = Math.max(atlasRowHeight, height);
}

function drawSprite(name, x, y, scale = 1) {
  const sprite = SPRITES[name];
  if (!sprite) return;

  ctx.drawImage(
    spriteCanvas,
    sprite.x,
    sprite.y,
    sprite.width,
    sprite.height,
    Math.round(x),
    Math.round(y),
    Math.round(sprite.width * scale),
    Math.round(sprite.height * scale)
  );
}

function srect(x, y, width, height, color) {
  spriteCtx.fillStyle = color;
  spriteCtx.fillRect(Math.round(x), Math.round(y), Math.round(width), Math.round(height));
}

function drawCharacterSprite(x, y, type, frame, isJumping) {
  const bob = isJumping ? 0 : frame;
  const leftLeg = frame === 0 ? 0 : -1;
  const rightLeg = frame === 0 ? 0 : 1;

  srect(x + 3, y + 8 + bob, 12, 14, COLORS.black);
  srect(x + 5, y + 10 + bob, 8, 10, COLORS.skin);
  srect(x + 3, y + 21 + bob, 12, 11, COLORS.black);
  srect(x + 5, y + 22 + bob, 8, 8, COLORS.skin);
  srect(x + 1, y + 23 + bob, 3, 10, COLORS.black);
  srect(x + 14, y + 23 + bob, 3, 10, COLORS.black);

  if (type === "cap") {
    srect(x + 2, y + 4 + bob, 14, 5, COLORS.black);
    srect(x + 3, y + 5 + bob, 12, 4, COLORS.red);
    srect(x + 12, y + 7 + bob, 5, 2, COLORS.redDark);
    srect(x + 6, y + 13 + bob, 7, 3, COLORS.darkGray);
    srect(x + 7, y + 11 + bob, 2, 2, COLORS.white);
    srect(x + 4, y + 30 + bob, 12, 6, COLORS.blue);
    srect(x + 5, y + 32 + bob, 10, 2, COLORS.blueDark);
  } else if (type === "blond") {
    srect(x + 2, y + 3 + bob, 15, 9, COLORS.black);
    srect(x + 4, y + 4 + bob, 11, 9, COLORS.hair);
    srect(x + 13, y + 8 + bob, 3, 9, COLORS.hair);
    srect(x + 6, y + 15 + bob, 6, 2, COLORS.black);
    srect(x + 5, y + 11 + bob, 3, 2, COLORS.white);
    srect(x + 4, y + 30 + bob, 12, 6, COLORS.blue);
    srect(x + 5, y + 32 + bob, 10, 2, COLORS.blueDark);
  } else {
    srect(x + 2, y + 4 + bob, 15, 6, COLORS.black);
    srect(x + 4, y + 5 + bob, 11, 4, COLORS.white);
    srect(x + 8, y + 6 + bob, 5, 4, COLORS.gray);
    srect(x + 5, y + 12 + bob, 4, 2, COLORS.darkGray);
    srect(x + 11, y + 12 + bob, 4, 2, COLORS.darkGray);
    srect(x + 4, y + 16 + bob, 10, 6, COLORS.brown);
    srect(x + 4, y + 30 + bob, 12, 6, COLORS.red);
    srect(x + 5, y + 32 + bob, 10, 2, COLORS.redDark);
  }

  srect(x + 5 + leftLeg, y + 36, 4, 8, COLORS.black);
  srect(x + 11 + rightLeg, y + 36, 4, 8, COLORS.black);
  srect(x + 6 + leftLeg, y + 37, 2, 6, COLORS.skin);
  srect(x + 12 + rightLeg, y + 37, 2, 6, COLORS.skin);
}

function drawBallSprite(x, y, rotated) {
  srect(x + 2, y + 2, 14, 14, COLORS.black);
  srect(x + 4, y + 4, 10, 10, COLORS.white);
  if (rotated) {
    srect(x + 4, y + 9, 5, 5, COLORS.red);
    srect(x + 9, y + 4, 5, 5, COLORS.blue);
  } else {
    srect(x + 4, y + 4, 5, 5, COLORS.red);
    srect(x + 9, y + 9, 5, 5, COLORS.blue);
  }
  srect(x + 8, y + 8, 2, 2, COLORS.black);
}

function drawWorld() {
  rect(0, 0, WIDTH, 74, COLORS.skyTop);
  rect(0, 22, WIDTH, 60, COLORS.sky);
  drawSprite("cloud", 16 - game.cloudOffset * 0.35, 18, 1);
  drawSprite("cloud", 106 - game.cloudOffset * 0.2, 10, 0.7);
  drawSprite("cloud", 245 - game.cloudOffset * 0.28, 28, 0.85);
  drawSprite("cloud", 362 - game.cloudOffset * 0.35, 18, 1);
  drawSun(163, 32);

  rect(0, 75, WIDTH, 52, COLORS.sea);
  rect(0, 99, WIDTH, 20, COLORS.seaDark);
  drawSailboat(38 - game.cloudOffset * 0.55, 91);
  drawSailboat(248 - game.cloudOffset * 0.38, 104);
  for (let x = -32; x < WIDTH + 32; x += 32) {
    const waveX = x + game.waveOffset;
    rect(waveX, 82, 18, 3, COLORS.foam);
    rect(waveX + 12, 86, 10, 2, COLORS.foam);
    rect(waveX + 2, 107, 22, 3, COLORS.foam);
    rect(waveX + 20, 111, 6, 2, COLORS.foam);
  }

  rect(0, 121, WIDTH, HEIGHT - 121, COLORS.sand);
  drawSprite("palm", 282, 117);
  drawSprite("surfboard", 22, 137);
  drawSprite("towel", 223, 138);
  drawSprite("coolerProp", 256, 134);
  rect(0, GROUND_Y + 17, WIDTH, 15, COLORS.sandDark);

  for (let x = -64; x < WIDTH + 64; x += 16) {
    const sx = x - game.sandOffset;
    rect(sx, 132, 7, 2, COLORS.sandDark);
    rect(sx + 9, 161, 4, 2, COLORS.sandDark);
    rect(sx + 3, 174, 10, 2, COLORS.sandDark);
    rect(sx + 2, 142, 2, 2, COLORS.shell);
    rect(sx + 11, 152, 3, 1, COLORS.shell);
  }

  rect(0, GROUND_Y + 13, WIDTH, 2, COLORS.black);
}

function drawEntities() {
  for (const tape of game.tapes) {
    drawTape(tape.x, tape.y + Math.sin(tape.bob) * 3);
  }

  for (const obstacle of game.obstacles) {
    drawObstacle(obstacle);
  }

  for (const particle of game.particles) {
    rect(particle.x, particle.y, particle.size, particle.size, particle.color);
  }

  drawBand(game.x, GROUND_Y - game.jump);
}

function drawOverlayHints() {
  if (game.state === "title") {
    drawPixelText("PRESS START", 116, 157, COLORS.black, 1);
  } else if (game.state === "gameover") {
    drawPixelText("WIPE OUT", 132, 66, COLORS.white, 2);
    drawPixelText(`SCORE ${Math.floor(game.score)}`, 112, 85, COLORS.white, 1);
  }
}

function drawBand(x, footY) {
  const step = Math.floor(performance.now() / 110) % 2;
  drawShadow(x + 6, footY + 1, 50);
  if (game.jumpFlash > 0) {
    rect(x + 6, footY + 5, 46, 2, COLORS.foam);
    rect(x + 16, footY + 9, 22, 2, COLORS.sun);
  }
  drawPlayer(x, footY, "cap", step);
  drawPlayer(x + 18, footY, "blond", step ? 0 : 1);
  drawPlayer(x + 36, footY, "beard", step);
}

function drawPlayer(x, footY, type, step) {
  const frame = game.jump > 0 ? "Jump" : step;
  drawSprite(`${type}${frame}`, x, footY - 42);
}

function drawObstacle(obstacle) {
  if (obstacle.kind === "crab") {
    drawSprite("crab", obstacle.x - 1, obstacle.y - 2);
  } else if (obstacle.kind === "cooler") {
    drawSprite("cooler", obstacle.x, obstacle.y - 1);
  } else if (obstacle.kind === "umbrella") {
    drawSprite("umbrella", obstacle.x, obstacle.y - 1);
  } else {
    const lift = Math.sin(obstacle.spin) * 2;
    drawSprite(Math.floor(obstacle.spin * 3) % 2 ? "ball1" : "ball0", obstacle.x, obstacle.y + lift);
  }
}

function drawTape(x, y) {
  drawSprite("tape", x, y);
}

function drawCloud(x, y, scale) {
  drawSprite("cloud", x, y, scale);
}

function drawSailboat(x, y) {
  if (x < -28 || x > WIDTH + 8) return;
  drawSprite("sailboat", x, y - 14);
}

function drawPalm(x, y) {
  drawSprite("palm", x, y);
}

function drawSurfboard(x, y) {
  drawSprite("surfboard", x, y);
}

function drawBeachTowel(x, y) {
  drawSprite("towel", x, y);
}

function drawCoolerDetail(x, y) {
  drawSprite("coolerProp", x, y);
}

function drawSun(x, y) {
  const pulse = Math.round(game.bass * 4);
  rect(x - 13 - pulse, y - 11, 26 + pulse * 2, 22, COLORS.sunDark);
  rect(x - 11 - pulse, y - 13 - pulse, 22 + pulse * 2, 26 + pulse * 2, COLORS.sun);
  rect(x - 8, y - 10, 6, 6, COLORS.white);
}

function drawShadow(x, y, w) {
  rect(x, y, w, 3, "rgba(23, 17, 15, 0.28)");
}

function spawnObstacle() {
  const difficulty = game.trackIndex / (TRACKS.length - 1);
  const roll = Math.random();
  const x = nextObstacleX();
  let obstacle;

  if (roll < 0.28) {
    obstacle = { kind: "crab", x, y: GROUND_Y - 12, w: 20, h: 12 };
  } else if (roll < 0.55) {
    obstacle = { kind: "cooler", x, y: GROUND_Y - 22, w: 24, h: 22 };
  } else if (roll < 0.78) {
    obstacle = { kind: "ball", x, y: GROUND_Y - 16, w: 18, h: 18, spin: 0 };
  } else {
    obstacle = { kind: "umbrella", x, y: GROUND_Y - 31, w: 28, h: 31 };
  }

  game.obstacles.push(obstacle);

  if (difficulty > 0.45 && Math.random() < difficulty * 0.32) {
    const gap = minObstacleGap() + 12 + Math.random() * 18;
    game.obstacles.push({ kind: "crab", x: obstacle.x + obstacle.w + gap, y: GROUND_Y - 12, w: 20, h: 12 });
  }
}

function nextObstacleX() {
  const rightmost = game.obstacles.reduce((max, obstacle) => {
    return Math.max(max, obstacle.x + obstacle.w);
  }, SPAWN_X - minObstacleGap());

  return Math.max(SPAWN_X, rightmost + minObstacleGap());
}

function minObstacleGap() {
  const difficulty = game.trackIndex / (TRACKS.length - 1);
  const scorePressure = Math.min(10, game.score / 900);
  return 88 - difficulty * 10 - scorePressure;
}

function spawnTape() {
  game.tapes.push({
    x: WIDTH + 18,
    y: GROUND_Y - 52 - Math.random() * 34,
    bob: Math.random() * 10,
    collected: false
  });
}

function collectTapes() {
  const rects = playerRects();
  for (const tape of game.tapes) {
    const tapeRect = { x: tape.x, y: tape.y, w: 15, h: 10 };
    if (rects.some((rectA) => overlaps(rectA, tapeRect))) {
      tape.collected = true;
      game.score += 250;
      game.shake = Math.max(game.shake, 1);
    }
  }
}

function checkObstacleHits() {
  if (game.invincible > 0) return;

  const rects = playerRects();
  for (const obstacle of game.obstacles) {
    const obstacleRect = obstacleHitbox(obstacle);
    if (rects.some((rectA) => overlaps(rectA, obstacleRect))) {
      endGame();
      return;
    }
  }
}

function obstacleHitbox(obstacle) {
  if (obstacle.kind === "umbrella") {
    return { x: obstacle.x + 10, y: obstacle.y + 11, w: 6, h: obstacle.h - 11 };
  }

  if (obstacle.kind === "cooler") {
    return { x: obstacle.x + 5, y: obstacle.y + 6, w: obstacle.w - 10, h: obstacle.h - 7 };
  }

  if (obstacle.kind === "ball") {
    return { x: obstacle.x + 5, y: obstacle.y + 5, w: obstacle.w - 10, h: obstacle.h - 9 };
  }

  return { x: obstacle.x + 4, y: obstacle.y + 5, w: obstacle.w - 8, h: obstacle.h - 6 };
}

function playerRects() {
  const top = GROUND_Y - game.jump - 24;
  return [
    { x: game.x + 7, y: top, w: 7, h: 21 },
    { x: game.x + 25, y: top, w: 7, h: 21 },
    { x: game.x + 43, y: top, w: 7, h: 21 }
  ];
}

function startGame() {
  document.body.classList.add("is-playing");
  game.state = "playing";
  game.score = 0;
  game.x = 62;
  game.jump = 0;
  game.vy = 0;
  game.jumpsLeft = game.maxJumps;
  game.jumpFlash = 0;
  game.invincible = 1.6;
  game.spawnTimer = 1.8;
  game.tapeTimer = 1.8;
  game.obstacles = [];
  game.tapes = [];
  game.particles = [];
  game.shake = 0;
  statusLine.textContent = "Dodge beach junk, grab tapes, double-jump over trouble.";
  startButton.textContent = "START";
  startAudio();
  updateHud();
}

function endGame() {
  game.state = "gameover";
  document.body.classList.remove("is-playing");
  game.shake = 4;
  game.best = Math.max(game.best, Math.floor(game.score));
  localStorage.setItem("jie-beach-best", String(game.best));
  statusLine.textContent = `Wipe out. Score ${Math.floor(game.score)}. Try the beach again.`;
  startButton.textContent = "PLAY AGAIN";
  updateHud();
}

function jump() {
  if (game.state !== "playing") return;
  if (game.jumpsLeft <= 0) return;

  const isDoubleJump = game.jump > 3;
  game.jumpsLeft -= 1;
  game.vy = isDoubleJump ? 108 : 116;
  game.jump = Math.max(game.jump, 1);
  game.jumpFlash = isDoubleJump ? 1 : 0.45;
  game.shake = Math.max(game.shake, isDoubleJump ? 1.4 : 0.5);
  spawnJumpParticles(isDoubleJump);
}

function spawnJumpParticles(isDoubleJump) {
  const baseX = game.x + 27;
  const baseY = GROUND_Y - game.jump + 5;
  const count = isDoubleJump ? 10 : 5;

  for (let i = 0; i < count; i += 1) {
    game.particles.push({
      x: baseX + (Math.random() - 0.5) * 38,
      y: baseY + (Math.random() - 0.5) * 8,
      vx: (Math.random() - 0.5) * 56,
      vy: -24 - Math.random() * 34,
      size: isDoubleJump ? 2 : 1,
      life: 0.22 + Math.random() * 0.18,
      color: isDoubleJump ? COLORS.sun : COLORS.foam
    });
  }
}

function handleKeyDown(event) {
  if (event.code === "ArrowLeft" || event.code === "KeyA") {
    keys.left = true;
    event.preventDefault();
  } else if (event.code === "ArrowRight" || event.code === "KeyD") {
    keys.right = true;
    event.preventDefault();
  } else if (event.code === "Space" || event.code === "ArrowUp" || event.code === "KeyW") {
    event.preventDefault();
    if (event.repeat) return;
    if (game.state !== "playing") startGame();
    jump();
  } else if (event.code === "Enter" && game.state !== "playing") {
    event.preventDefault();
    startGame();
  }
}

function handleKeyUp(event) {
  if (event.code === "ArrowLeft" || event.code === "KeyA") {
    keys.left = false;
  } else if (event.code === "ArrowRight" || event.code === "KeyD") {
    keys.right = false;
  }
}

function handleCanvasTap(event) {
  event.preventDefault();
  if (game.state !== "playing") {
    startGame();
    return;
  }

  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const middle = rect.width * 0.5;
  if (x < middle - rect.width * 0.18) {
    keys.left = true;
    setTimeout(() => {
      keys.left = false;
    }, 180);
  } else if (x > middle + rect.width * 0.18) {
    keys.right = true;
    setTimeout(() => {
      keys.right = false;
    }, 180);
  } else {
    jump();
  }
}

function bindTouchButton(selector, direction) {
  const button = document.querySelector(selector);
  const set = (value) => {
    keys[direction] = value;
  };
  button.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    button.setPointerCapture(event.pointerId);
    set(true);
  });
  button.addEventListener("pointerup", () => set(false));
  button.addEventListener("pointercancel", () => set(false));
  button.addEventListener("lostpointercapture", () => set(false));
}

async function startAudio() {
  try {
    setupAudioContext();
    if (audioContext?.state === "suspended") await audioContext.resume();
    if (audio.paused) await audio.play();
    musicButton.textContent = "Ⅱ";
  } catch (error) {
    if (!audioWarningShown) {
      statusLine.textContent = "Game is running. Tap the music button if the song did not start.";
      console.warn("Audio could not start from this interaction.", error);
      audioWarningShown = true;
    }
  }
}

function setupAudioContext() {
  if (audioContext) return;

  audioContext = new AudioContext();
  analyser = audioContext.createAnalyser();
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0.75;
  frequencyData = new Uint8Array(analyser.frequencyBinCount);
  mediaSource = audioContext.createMediaElementSource(audio);
  mediaSource.connect(analyser);
  analyser.connect(audioContext.destination);
}

function readAudio() {
  if (!analyser || !frequencyData.length) {
    const t = performance.now() * 0.001;
    game.bass = 0.28 + Math.sin(t * 2.2) * 0.1;
    game.highs = 0.2 + Math.sin(t * 4.7) * 0.08;
    return;
  }

  analyser.getByteFrequencyData(frequencyData);
  game.bass = bandAverage(0, 7);
  game.highs = bandAverage(46, 140);
}

function bandAverage(start, end) {
  const last = Math.min(end, frequencyData.length);
  let sum = 0;
  for (let i = start; i < last; i += 1) sum += frequencyData[i];
  return sum / Math.max(1, last - start) / 255;
}

function toggleMusic() {
  if (audio.paused) {
    startAudio();
  } else {
    audio.pause();
    musicButton.textContent = "▶";
  }
}

function chooseTrack(index) {
  const wasPlaying = !audio.paused;
  loadTrack(index);
  if (wasPlaying) startAudio();
}

function nextTrack() {
  chooseTrack(game.trackIndex + 1);
}

function loadTrack(index) {
  game.trackIndex = (index + TRACKS.length) % TRACKS.length;
  const track = TRACKS[game.trackIndex];
  const src = new URL(track.src, window.location.href).href;

  if (audio.src !== src) {
    audio.src = src;
    audio.load();
  }

  updateHud();
}

function updateHud() {
  const track = TRACKS[game.trackIndex];
  trackLabel.textContent = `${String(game.trackIndex + 1).padStart(2, "0")} / ${track.title}`;
  scoreLabel.textContent = String(Math.floor(game.score)).padStart(6, "0");
  bestLabel.textContent = `BEST ${String(game.best).padStart(6, "0")}`;
}

function currentSpeed() {
  return 43 + game.trackIndex * 1.8 + Math.min(18, game.score / 620) + game.bass * 5;
}

function nextSpawnDelay() {
  const difficulty = game.trackIndex / (TRACKS.length - 1);
  const scorePressure = Math.min(0.16, game.score / 9000);
  return 1.7 - difficulty * 0.32 - scorePressure + Math.random() * 0.4;
}

function drawPixelText(text, x, y, color, scale = 1) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.font = `${8 * scale}px "Courier New", monospace`;
  ctx.textBaseline = "top";
  ctx.fillText(text, x, y);
  ctx.restore();
}

function rect(x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

function overlaps(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
