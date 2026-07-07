const CONFIG = {
  logicalWidth: 220,
  logicalHeight: 124,
  maxDevicePixelRatio: 2,
  bassHitThreshold: 0.42
};

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

const PALETTE = [
  [0, 0, 0],
  [255, 215, 0],
  [204, 0, 0]
];

const canvas = document.querySelector("#album-canvas");
const audio = document.querySelector("#album-audio");
const startButton = document.querySelector("#start-button");
const chapters = Array.from(document.querySelectorAll(".chapter"));
const ctx = canvas.getContext("2d", { alpha: false });
const artCanvas = document.createElement("canvas");
const art = artCanvas.getContext("2d", { alpha: false });

let dpr = 1;
let width = 0;
let height = 0;
let image = null;
let heat = null;
let color = null;

let audioContext = null;
let analyser = null;
let mediaSource = null;
let frequencyData = new Uint8Array(0);
let waveformData = new Uint8Array(0);
let currentTrackIndex = 0;
let hasStarted = false;
let warningLogged = false;

let activeChapter = 0;
let activeMode = "signal";
let scrollProgress = 0;
let chapterProgress = 0;
let phase = 0;
let lastFrameTime = performance.now();
let bass = 0;
let mids = 0;
let highs = 0;
let bassFloor = 0;
let lastHitAt = 0;

const bursts = [];

audio.preload = "none";
audio.addEventListener("ended", playNextTrack);

startButton.addEventListener("click", startAlbum);
window.addEventListener("pointerdown", maybeStartFromGesture);
window.addEventListener("keydown", maybeStartFromGesture);
window.addEventListener("resize", resize);
window.addEventListener("orientationchange", resize);
window.addEventListener("scroll", updateScrollState, { passive: true });

resize();
updateScrollState();
requestAnimationFrame(frame);

async function maybeStartFromGesture(event) {
  if (event.target === startButton) return;
  if (!hasStarted && window.scrollY > window.innerHeight * 0.08) {
    await startAlbum();
  }
}

async function startAlbum() {
  if (!hasStarted) {
    hasStarted = true;
    document.body.classList.add("is-started");
    setTrack(0);
    audio.preload = "auto";

    audioContext = new AudioContext();
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.68;
    frequencyData = new Uint8Array(analyser.frequencyBinCount);
    waveformData = new Uint8Array(analyser.fftSize);

    if (!mediaSource) {
      mediaSource = audioContext.createMediaElementSource(audio);
      mediaSource.connect(analyser);
      analyser.connect(audioContext.destination);
    }
  }

  await resumePlayback();
}

async function resumePlayback() {
  try {
    if (audioContext?.state === "suspended") {
      await audioContext.resume();
    }

    if (audio.paused) {
      await audio.play();
    }
  } catch (error) {
    if (!warningLogged) {
      console.warn("Audio could not start from this interaction.", error);
      warningLogged = true;
    }
  }
}

function setTrack(index) {
  currentTrackIndex = Math.max(0, Math.min(TRACKS.length - 1, index));
  const src = new URL(TRACKS[currentTrackIndex].src, window.location.href).href;

  if (audio.src !== src) {
    audio.src = src;
    audio.load();
  }
}

function playNextTrack() {
  if (currentTrackIndex >= TRACKS.length - 1) return;
  setTrack(currentTrackIndex + 1);
  resumePlayback();
}

function frame(now) {
  const dt = Math.min(0.05, (now - lastFrameTime) / 1000);
  lastFrameTime = now;
  phase += dt;

  readAudioBands();
  updateBursts(dt);
  draw(now);

  requestAnimationFrame(frame);
}

function readAudioBands() {
  if (analyser && frequencyData.length) {
    analyser.getByteFrequencyData(frequencyData);
    analyser.getByteTimeDomainData(waveformData);
    bass = lerp(bass, bandAverageHz(20, 250), 0.36);
    mids = lerp(mids, bandAverageHz(250, 2000), 0.28);
    highs = lerp(highs, bandAverageHz(2000, 9000), 0.32);
  } else {
    bass = 0.18 + Math.sin(phase * 1.4) * 0.07;
    mids = 0.18 + Math.sin(phase * 0.8 + 1.4) * 0.06;
    highs = 0.1 + Math.sin(phase * 2.2 + 2.5) * 0.05;
  }

  bassFloor = lerp(bassFloor, bass, 0.02);

  if (bass > CONFIG.bassHitThreshold && bass > bassFloor + 0.07 && performance.now() - lastHitAt > 150) {
    spawnBurst();
    lastHitAt = performance.now();
  }
}

function bandAverageHz(lowHz, highHz) {
  if (!audioContext || !frequencyData.length) return 0;

  const nyquist = audioContext.sampleRate / 2;
  const start = clamp(Math.floor((lowHz / nyquist) * frequencyData.length), 0, frequencyData.length - 1);
  const end = clamp(Math.ceil((highHz / nyquist) * frequencyData.length), start + 1, frequencyData.length);
  let sum = 0;

  for (let i = start; i < end; i += 1) {
    sum += frequencyData[i];
  }

  return sum / ((end - start) * 255);
}

function draw(now) {
  fadeField();
  drawModeComposition(now);
  drawWaveformThread();
  drawSignalNoise(now);
  drawBursts();
  renderField(now);

  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(artCanvas, 0, 0, width, height);
}

function fadeField() {
  const decay = 0.86 - bass * 0.06;

  for (let i = 0; i < heat.length; i += 1) {
    heat[i] *= decay;
    if (heat[i] < 0.018) heat[i] = 0;
  }
}

function drawModeComposition(now) {
  if (activeMode === "bars") {
    drawBars(now);
  } else if (activeMode === "corridor") {
    drawCorridor(now);
  } else if (activeMode === "grid") {
    drawGrid(now);
  } else if (activeMode === "wave") {
    drawWaves(now);
  } else {
    drawSignal(now);
  }
}

function drawWaves(now) {
  const lanes = 3 + (activeChapter % 3);
  const amp = 10 + bass * 28 + Math.sin(chapterProgress * Math.PI) * 18;

  for (let lane = 0; lane < lanes; lane += 1) {
    const yBase = CONFIG.logicalHeight * ((lane + 1) / (lanes + 1));
    const colorIndex = lane % 2 ? 2 : 1;

    for (let x = -4; x < CONFIG.logicalWidth + 4; x += 2) {
      const y = yBase + Math.sin(x * 0.055 + phase * 1.1 + activeChapter) * amp;
      drawBlock(x, y, 3 + bass * 8, 1 + highs * 3, 0.35 + mids * 0.7, colorIndex);
    }
  }
}

function drawBars(now) {
  const count = 18 + activeChapter;
  const step = CONFIG.logicalWidth / count;

  for (let i = 0; i < count; i += 1) {
    const energy = frequencyData.length ? frequencyData[Math.floor((i / count) * frequencyData.length * 0.55)] / 255 : hash2(i, activeChapter);
    const h = 12 + energy * 86 + Math.sin(chapterProgress * Math.PI) * 24;
    const x = i * step;
    const y = CONFIG.logicalHeight - h;
    drawBlock(x, y, Math.max(1, step * 0.42), h, 0.24 + energy, i % 3 === 0 ? 2 : 1);
  }
}

function drawCorridor(now) {
  const cx = CONFIG.logicalWidth * (0.5 + Math.sin(chapterProgress * Math.PI * 2) * 0.18);
  const cy = CONFIG.logicalHeight * 0.5;
  const depth = 8 + (activeChapter % 4);

  for (let i = 0; i < depth; i += 1) {
    const t = i / depth;
    const w = lerp(16, CONFIG.logicalWidth * 1.25, t) + bass * 20;
    const h = lerp(8, CONFIG.logicalHeight * 0.92, t) + mids * 18;
    drawRectRing(cx, cy, w * 0.5, h * 0.5, 0.28 + (1 - t) * 0.35, i % 2 ? 2 : 1);
  }
}

function drawGrid(now) {
  const size = 7 + (activeChapter % 4) * 3;
  const drift = Math.floor(phase * 12 + chapterProgress * 50);

  for (let y = -size; y < CONFIG.logicalHeight + size; y += size) {
    for (let x = -size; x < CONFIG.logicalWidth + size; x += size) {
      const gate = hash2(x + drift, y - drift);
      if (gate > 0.18 + mids * 0.18) continue;
      drawBlock(x + Math.sin(y * 0.13 + phase) * 4, y, size * 0.6, size * 0.18 + highs * 4, 0.28 + bass, gate > 0.72 ? 2 : 1);
    }
  }
}

function drawSignal(now) {
  const seed = Math.floor(now * 0.025);
  for (let y = 0; y < CONFIG.logicalHeight; y += 5) {
    const x = hash2(y, seed) * CONFIG.logicalWidth;
    drawBlock(x, y, 12 + hash2(seed, y) * 46, 1, 0.22 + highs * 0.5, y % 3 ? 1 : 2);
  }
}

function drawWaveformThread() {
  if (!waveformData.length) return;

  const yBase = CONFIG.logicalHeight * 0.5;
  for (let x = 0; x < CONFIG.logicalWidth; x += 2) {
    const sampleIndex = Math.floor((x / CONFIG.logicalWidth) * waveformData.length);
    const sample = (waveformData[sampleIndex] - 128) / 128;
    const y = yBase + sample * (8 + bass * 26);
    drawBlock(x, y, 2 + highs * 4, 1, 0.35 + bass * 0.7, 2);
  }
}

function drawSignalNoise(now) {
  const seed = Math.floor(now * 0.07);
  const count = 90 + Math.floor(highs * 620);

  for (let i = 0; i < count; i += 1) {
    const x = Math.floor(hash2(i, seed) * CONFIG.logicalWidth);
    const y = Math.floor(hash2(seed, i + activeChapter) * CONFIG.logicalHeight);
    const w = 1 + Math.floor(hash2(i + 21, seed) * (2 + highs * 10));
    drawBlock(x, y, w, 1, 0.12 + highs * 0.7, hash2(i, seed + 4) > 0.7 ? 2 : 1);
  }

  for (let y = seed % 5; y < CONFIG.logicalHeight; y += 5) {
    if (hash2(y, seed) > 0.62 - highs * 0.18) subtractLine(y, 0.18 + highs * 0.4);
  }
}

function spawnBurst() {
  bursts.push({
    x: CONFIG.logicalWidth * (0.5 + Math.sin(activeChapter * 1.9 + phase) * 0.34),
    y: CONFIG.logicalHeight * (0.5 + Math.cos(activeChapter * 1.3 + phase) * 0.28),
    age: 0,
    life: 0.48 + bass * 0.4,
    seed: Math.random() * 1000,
    color: Math.random() > 0.4 ? 1 : 2
  });

  if (bursts.length > 16) bursts.shift();
}

function updateBursts(dt) {
  for (let i = bursts.length - 1; i >= 0; i -= 1) {
    bursts[i].age += dt;
    if (bursts[i].age > bursts[i].life) bursts.splice(i, 1);
  }
}

function drawBursts() {
  for (const burst of bursts) {
    const t = burst.age / burst.life;
    const radius = 8 + t * (38 + bass * 48);
    const amount = (1 - t) * (0.65 + bass);
    drawRectRing(burst.x, burst.y, radius * 1.7, radius, amount, burst.color);

    for (let i = 0; i < 10; i += 1) {
      const angle = burst.seed + i * 1.7;
      drawBlock(
        burst.x + Math.cos(angle) * radius,
        burst.y + Math.sin(angle * 1.2) * radius,
        3 + bass * 12,
        1 + highs * 6,
        amount,
        i % 3 === 0 ? 2 : burst.color
      );
    }
  }
}

function renderField(now) {
  const data = image.data;
  const seed = Math.floor(now * 0.04);

  for (let i = 0; i < heat.length; i += 1) {
    const offset = i * 4;
    const lit = heat[i] > 0.16 + hash1(i + seed) * 0.38;

    if (!lit) {
      data[offset] = 0;
      data[offset + 1] = 0;
      data[offset + 2] = 0;
      data[offset + 3] = 255;
      continue;
    }

    const selected = PALETTE[color[i] === 2 ? 2 : 1];
    data[offset] = selected[0];
    data[offset + 1] = selected[1];
    data[offset + 2] = selected[2];
    data[offset + 3] = 255;
  }

  art.putImageData(image, 0, 0);
}

function drawBlock(x, y, blockWidth, blockHeight, amount, colorIndex) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.ceil(x + blockWidth);
  const y1 = Math.ceil(y + blockHeight);

  for (let py = y0; py < y1; py += 1) {
    if (py < 0 || py >= CONFIG.logicalHeight) continue;
    for (let px = x0; px < x1; px += 1) {
      if (px < 0 || px >= CONFIG.logicalWidth) continue;
      const index = py * CONFIG.logicalWidth + px;
      heat[index] = Math.min(1.8, heat[index] + amount);
      color[index] = colorIndex;
    }
  }
}

function drawRectRing(cx, cy, rx, ry, amount, colorIndex) {
  const thickness = 1 + Math.floor(bass * 4);
  drawBlock(cx - rx, cy - ry, rx * 2, thickness, amount, colorIndex);
  drawBlock(cx - rx, cy + ry, rx * 2, thickness, amount, colorIndex);
  drawBlock(cx - rx, cy - ry, thickness, ry * 2, amount, colorIndex);
  drawBlock(cx + rx, cy - ry, thickness, ry * 2, amount, colorIndex);
}

function subtractLine(y, amount) {
  const row = Math.floor(y);
  if (row < 0 || row >= CONFIG.logicalHeight) return;

  const start = row * CONFIG.logicalWidth;
  for (let x = 0; x < CONFIG.logicalWidth; x += 1) {
    heat[start + x] = Math.max(0, heat[start + x] - amount);
  }
}

function updateScrollState() {
  const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
  scrollProgress = clamp(window.scrollY / maxScroll, 0, 1);

  let best = chapters[0];
  let bestDistance = Number.POSITIVE_INFINITY;
  const viewportMiddle = window.innerHeight * 0.5;

  for (const chapter of chapters) {
    const rect = chapter.getBoundingClientRect();
    const distance = Math.abs(rect.top + rect.height * 0.5 - viewportMiddle);
    if (distance < bestDistance) {
      best = chapter;
      bestDistance = distance;
    }
  }

  chapters.forEach((chapter) => chapter.classList.toggle("is-active", chapter === best));
  activeChapter = Number(best.dataset.chapter || 0);
  activeMode = best.dataset.mode || "signal";

  const rect = best.getBoundingClientRect();
  chapterProgress = clamp((window.innerHeight - rect.top) / (window.innerHeight + rect.height), 0, 1);

  document.documentElement.style.setProperty("--scroll-progress", scrollProgress.toFixed(4));
  document.documentElement.style.setProperty("--chapter-progress", chapterProgress.toFixed(4));
}

function resize() {
  dpr = Math.max(1, Math.min(CONFIG.maxDevicePixelRatio, window.devicePixelRatio || 1));
  width = Math.floor(window.innerWidth * dpr);
  height = Math.floor(window.innerHeight * dpr);

  canvas.width = width;
  canvas.height = height;
  canvas.style.width = `${window.innerWidth}px`;
  canvas.style.height = `${window.innerHeight}px`;

  artCanvas.width = CONFIG.logicalWidth;
  artCanvas.height = CONFIG.logicalHeight;
  image = art.createImageData(CONFIG.logicalWidth, CONFIG.logicalHeight);
  heat = new Float32Array(CONFIG.logicalWidth * CONFIG.logicalHeight);
  color = new Uint8Array(CONFIG.logicalWidth * CONFIG.logicalHeight);

  ctx.imageSmoothingEnabled = false;
  art.imageSmoothingEnabled = false;
  updateScrollState();
}

function hash1(value) {
  const x = Math.sin(value * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

function hash2(a, b) {
  return hash1(a * 127.1 + b * 311.7);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
