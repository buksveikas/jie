const WIDTH = 320;
const HEIGHT = 180;
const GROUND_Y = 148;

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
  invincible: 0,
  spawnTimer: 1,
  tapeTimer: 2,
  obstacles: [],
  tapes: [],
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
  game.shake = Math.max(0, game.shake - dt * 16);

  if (keys.left) game.x -= dt * 95;
  if (keys.right) game.x += dt * 95;
  game.x = clamp(game.x, 12, WIDTH - 72);

  game.jump += game.vy * dt;
  game.vy -= 250 * dt;
  if (game.jump <= 0) {
    game.jump = 0;
    game.vy = 0;
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

  game.obstacles = game.obstacles.filter((obstacle) => obstacle.x + obstacle.w > -20);
  game.tapes = game.tapes.filter((tape) => tape.x > -16 && !tape.collected);

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

function drawWorld() {
  rect(0, 0, WIDTH, 74, COLORS.skyTop);
  rect(0, 22, WIDTH, 60, COLORS.sky);
  drawCloud(16 - game.cloudOffset * 0.35, 18, 1);
  drawCloud(106 - game.cloudOffset * 0.2, 10, 0.7);
  drawCloud(245 - game.cloudOffset * 0.28, 28, 0.85);
  drawCloud(362 - game.cloudOffset * 0.35, 18, 1);
  drawSun(163, 32);

  rect(0, 75, WIDTH, 52, COLORS.sea);
  rect(0, 99, WIDTH, 20, COLORS.seaDark);
  for (let x = -32; x < WIDTH + 32; x += 32) {
    const waveX = x + game.waveOffset;
    rect(waveX, 82, 18, 3, COLORS.foam);
    rect(waveX + 12, 86, 10, 2, COLORS.foam);
    rect(waveX + 2, 107, 22, 3, COLORS.foam);
    rect(waveX + 20, 111, 6, 2, COLORS.foam);
  }

  rect(0, 121, WIDTH, HEIGHT - 121, COLORS.sand);
  rect(0, GROUND_Y + 17, WIDTH, 15, COLORS.sandDark);

  for (let x = -64; x < WIDTH + 64; x += 16) {
    const sx = x - game.sandOffset;
    rect(sx, 132, 7, 2, COLORS.sandDark);
    rect(sx + 9, 161, 4, 2, COLORS.sandDark);
    rect(sx + 3, 174, 10, 2, COLORS.sandDark);
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
  drawPlayer(x, footY, "cap", step);
  drawPlayer(x + 18, footY, "blond", step ? 0 : 1);
  drawPlayer(x + 36, footY, "beard", step);
}

function drawPlayer(x, footY, type, step) {
  const px = Math.round(x);
  const y = Math.round(footY - 32);
  const bob = game.jump > 0 ? 0 : step;

  rect(px + 3, y + 7 + bob, 13, 14, COLORS.black);
  rect(px + 5, y + 9 + bob, 9, 10, COLORS.skin);
  rect(px + 3, y + 20 + bob, 13, 12, COLORS.black);
  rect(px + 5, y + 21 + bob, 9, 8, COLORS.skin);

  if (type === "cap") {
    rect(px + 3, y + 3 + bob, 13, 5, COLORS.black);
    rect(px + 4, y + 4 + bob, 11, 4, COLORS.red);
    rect(px + 12, y + 6 + bob, 5, 2, COLORS.redDark);
    rect(px + 6, y + 12 + bob, 7, 3, COLORS.darkGray);
    rect(px + 4, y + 29 + bob, 12, 6, COLORS.blue);
  } else if (type === "blond") {
    rect(px + 2, y + 3 + bob, 15, 8, COLORS.black);
    rect(px + 4, y + 4 + bob, 11, 8, COLORS.hair);
    rect(px + 6, y + 14 + bob, 6, 2, COLORS.black);
    rect(px + 4, y + 29 + bob, 12, 6, COLORS.blue);
  } else {
    rect(px + 2, y + 3 + bob, 15, 6, COLORS.black);
    rect(px + 4, y + 4 + bob, 11, 4, COLORS.white);
    rect(px + 8, y + 5 + bob, 5, 4, COLORS.gray);
    rect(px + 4, y + 15 + bob, 10, 6, COLORS.brown);
    rect(px + 4, y + 29 + bob, 12, 6, COLORS.red);
  }

  rect(px + 2, y + 22 + bob, 3, 10, COLORS.black);
  rect(px + 14, y + 22 + bob, 3, 10, COLORS.black);
  rect(px + 5, y + 35, 4, 9, COLORS.black);
  rect(px + 11, y + 35, 4, 9, COLORS.black);
  rect(px + 6 - step, y + 36, 3, 7, COLORS.skin);
  rect(px + 12 + step, y + 36, 3, 7, COLORS.skin);
}

function drawObstacle(obstacle) {
  if (obstacle.kind === "crab") {
    rect(obstacle.x + 3, obstacle.y + 5, 14, 7, COLORS.black);
    rect(obstacle.x + 5, obstacle.y + 6, 10, 5, COLORS.red);
    rect(obstacle.x, obstacle.y + 7, 4, 2, COLORS.redDark);
    rect(obstacle.x + 16, obstacle.y + 7, 4, 2, COLORS.redDark);
    rect(obstacle.x + 6, obstacle.y + 4, 2, 2, COLORS.white);
    rect(obstacle.x + 12, obstacle.y + 4, 2, 2, COLORS.white);
  } else if (obstacle.kind === "cooler") {
    rect(obstacle.x, obstacle.y, obstacle.w, obstacle.h, COLORS.black);
    rect(obstacle.x + 2, obstacle.y + 3, obstacle.w - 4, obstacle.h - 5, COLORS.blue);
    rect(obstacle.x + 2, obstacle.y + 1, obstacle.w - 4, 5, COLORS.white);
    rect(obstacle.x + 8, obstacle.y + 6, 8, 3, COLORS.blueDark);
  } else if (obstacle.kind === "umbrella") {
    rect(obstacle.x + 11, obstacle.y + 8, 4, obstacle.h - 8, COLORS.black);
    rect(obstacle.x + 1, obstacle.y + 8, 25, 4, COLORS.black);
    rect(obstacle.x + 3, obstacle.y + 4, 21, 6, COLORS.sun);
    rect(obstacle.x + 9, obstacle.y + 4, 7, 6, COLORS.red);
  } else {
    const lift = Math.sin(obstacle.spin) * 2;
    rect(obstacle.x + 2, obstacle.y + lift + 2, 14, 14, COLORS.black);
    rect(obstacle.x + 4, obstacle.y + lift + 4, 10, 10, COLORS.white);
    rect(obstacle.x + 4, obstacle.y + lift + 4, 5, 5, COLORS.red);
    rect(obstacle.x + 9, obstacle.y + lift + 9, 5, 5, COLORS.blue);
  }
}

function drawTape(x, y) {
  const px = Math.round(x);
  const py = Math.round(y);
  rect(px, py, 15, 10, COLORS.black);
  rect(px + 2, py + 2, 11, 6, COLORS.tape);
  rect(px + 4, py + 3, 7, 2, COLORS.tapeLabel);
  rect(px + 3, py + 6, 2, 2, COLORS.white);
  rect(px + 10, py + 6, 2, 2, COLORS.white);
}

function drawCloud(x, y, scale) {
  const s = Math.max(1, scale);
  rect(x, y + 8 * s, 34 * s, 8 * s, COLORS.cloudBlue);
  rect(x + 4 * s, y + 4 * s, 22 * s, 8 * s, COLORS.cloud);
  rect(x + 12 * s, y, 14 * s, 8 * s, COLORS.cloud);
  rect(x + 25 * s, y + 7 * s, 10 * s, 6 * s, COLORS.cloud);
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
  let obstacle;

  if (roll < 0.28) {
    obstacle = { kind: "crab", x: WIDTH + 18, y: GROUND_Y - 12, w: 20, h: 12 };
  } else if (roll < 0.55) {
    obstacle = { kind: "cooler", x: WIDTH + 18, y: GROUND_Y - 22, w: 24, h: 22 };
  } else if (roll < 0.78) {
    obstacle = { kind: "ball", x: WIDTH + 18, y: GROUND_Y - 16, w: 18, h: 18, spin: 0 };
  } else {
    obstacle = { kind: "umbrella", x: WIDTH + 18, y: GROUND_Y - 31, w: 28, h: 31 };
  }

  game.obstacles.push(obstacle);

  if (difficulty > 0.45 && Math.random() < difficulty * 0.32) {
    const gap = 54 + Math.random() * 22;
    game.obstacles.push({ kind: "crab", x: obstacle.x + gap, y: GROUND_Y - 12, w: 20, h: 12 });
  }
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
    const obstacleRect = {
      x: obstacle.x + 3,
      y: obstacle.y + 3,
      w: obstacle.w - 6,
      h: obstacle.h - 3
    };
    if (rects.some((rectA) => overlaps(rectA, obstacleRect))) {
      endGame();
      return;
    }
  }
}

function playerRects() {
  const top = GROUND_Y - game.jump - 27;
  return [
    { x: game.x + 5, y: top, w: 11, h: 25 },
    { x: game.x + 23, y: top, w: 11, h: 25 },
    { x: game.x + 41, y: top, w: 11, h: 25 }
  ];
}

function startGame() {
  document.body.classList.add("is-playing");
  game.state = "playing";
  game.score = 0;
  game.x = 62;
  game.jump = 0;
  game.vy = 0;
  game.invincible = 1.1;
  game.spawnTimer = 1.2;
  game.tapeTimer = 1.8;
  game.obstacles = [];
  game.tapes = [];
  game.shake = 0;
  statusLine.textContent = "Dodge beach junk, grab tapes, keep the band moving.";
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
  if (game.jump > 2) return;
  game.vy = 92;
  game.jump = 1;
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
  return 54 + game.trackIndex * 2.2 + Math.min(24, game.score / 450) + game.bass * 7;
}

function nextSpawnDelay() {
  const difficulty = game.trackIndex / (TRACKS.length - 1);
  const scorePressure = Math.min(0.22, game.score / 7000);
  return 1.38 - difficulty * 0.42 - scorePressure + Math.random() * 0.32;
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
