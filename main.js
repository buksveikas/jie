const CONFIG = {
  pixelsPerSecond: 165,
  logicalWidth: 240,
  logicalHeight: 135,
  maxDevicePixelRatio: 2,
  bassHitThreshold: 0.46,
  scrubWindowMs: 460
};

const TRACKS = [
  { title: "Jie", src: "./assets/1. EGOMAŠINA - Jie mix 2.m4a", duration: 180.382132 },
  { title: "Bamboaze", src: "./assets/2. EGOMAŠINA - Bamboaze.m4a", duration: 211 },
  { title: "Patogu, Patinka", src: "./assets/3. EGOMAŠINA - Patogu, Patinka Mix 2.m4a", duration: 173.403061 },
  { title: "Sakau Tau Labas", src: "./assets/4. EGOMAŠINA - Sakau Tau Labas mix 3.m4a", duration: 161.142857 },
  { title: "Tu nežinai", src: "./assets/5. EGOMAŠINA - Tu nežinai.m4a", duration: 183.5 },
  { title: "Paleisk Jau", src: "./assets/6. EGOMAŠINA - Paleisk Jau.m4a", duration: 122.5 },
  { title: "Ūkio Mazas", src: "./assets/7. EGOMAŠINA - Ūkio Mazas (1).m4a", duration: 241 },
  { title: "Piktas Vyras", src: "./assets/8. EGOMAŠINA - Piktas Vyras mix 3.m4a", duration: 209.620204 },
  { title: "Ne Vienas Tu", src: "./assets/9. EGOMAŠINA - Ne Vienas Tu mix 2.m4a", duration: 218.860113 },
  { title: "Trys Ir", src: "./assets/10. EGOMAŠINA - Trys Ir.m4a", duration: 211.5 },
  { title: "Seagul Sounds", src: "./assets/11. EGOMAŠINA - Seagul Sounds mix 3.m4a", duration: 162 },
  { title: "Vesiai", src: "./assets/12. EGOMAŠINA - vesiai.m4a", duration: 193.333333 },
  { title: "Plomba", src: "./assets/13. EGOMAŠINA - Plomba.m4a", duration: 144.545465 }
];

const TRACK_OFFSETS = TRACKS.reduce((offsets, track, index) => {
  offsets[index] = index === 0 ? 0 : offsets[index - 1] + TRACKS[index - 1].duration;
  return offsets;
}, []);
const TOTAL_DURATION = TRACKS.reduce((sum, track) => sum + track.duration, 0);

const PALETTE = [
  [0, 0, 0],
  [255, 215, 0],
  [204, 0, 0]
];

const canvas = document.querySelector("#album-canvas");
const audio = document.querySelector("#album-audio");
const scrollSpace = document.querySelector("#scroll-space");
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
let playRequested = false;
let warningLogged = false;

let scrollProgress = 0;
let lastScrollProgress = -1;
let targetGlobalTime = 0;
let smoothedGlobalTime = 0;
let scrubUntil = 0;

let lastFrameTime = performance.now();
let phase = 0;
let bass = 0;
let mids = 0;
let highs = 0;
let bassFloor = 0;
let bassMemory = 0;
let lastHitAt = 0;

const bursts = [];

audio.preload = "none";
audio.addEventListener("ended", playNextTrack);
audio.addEventListener("canplay", () => {
  if (playRequested) resumePlayback();
});

window.addEventListener("resize", resize);
window.addEventListener("orientationchange", resize);
window.addEventListener("scroll", updateScrollProgress, { passive: true });
window.addEventListener("pointerdown", startExperience);
window.addEventListener("click", startExperience);
window.addEventListener("keydown", startExperience);
window.addEventListener("touchstart", startExperience, { passive: true });

resize();
syncScrollHeight();
updateScrollProgress();
requestAnimationFrame(frame);

async function startExperience() {
  playRequested = true;

  if (!hasStarted) {
    hasStarted = true;
    document.body.classList.add("is-started");
    setTrack(getTrackAtTime(scrollProgress * TOTAL_DURATION).index);
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

    await seekToGlobalTime(scrollProgress * TOTAL_DURATION, true);
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

function frame(now) {
  const dt = Math.min(0.05, (now - lastFrameTime) / 1000);
  lastFrameTime = now;
  phase += dt;

  readAudioBands();
  updateAudioTarget(now);
  updateBursts(dt);
  draw(now);

  requestAnimationFrame(frame);
}

function readAudioBands() {
  if (analyser && frequencyData.length) {
    analyser.getByteFrequencyData(frequencyData);
    analyser.getByteTimeDomainData(waveformData);

    bass = lerp(bass, bandAverageHz(20, 250), 0.38);
    mids = lerp(mids, bandAverageHz(250, 2000), 0.28);
    highs = lerp(highs, bandAverageHz(2000, 9000), 0.32);
  } else {
    bass = 0.2 + Math.sin(phase * 1.55) * 0.08;
    mids = 0.22 + Math.sin(phase * 0.77 + 1.2) * 0.07;
    highs = 0.12 + Math.sin(phase * 2.1 + 2.1) * 0.06;
  }

  bassFloor = lerp(bassFloor, bass, 0.018);

  if (bass > CONFIG.bassHitThreshold && bass > bassFloor + 0.08 && performance.now() - lastHitAt > 130) {
    spawnBurst();
    lastHitAt = performance.now();
  }

  bassMemory = lerp(bassMemory, bass, 0.18);
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

async function updateAudioTarget(now) {
  if (!hasStarted || now > scrubUntil) return;

  smoothedGlobalTime = lerp(smoothedGlobalTime, targetGlobalTime, 0.34);

  if (Math.abs(getGlobalAudioTime() - smoothedGlobalTime) > 0.18) {
    await seekToGlobalTime(smoothedGlobalTime, false);
  }
}

async function seekToGlobalTime(globalTime, force) {
  const target = getTrackAtTime(globalTime);
  const localTime = clamp(globalTime - TRACK_OFFSETS[target.index], 0, Math.max(0, target.track.duration - 0.2));

  if (target.index !== currentTrackIndex || !audio.src) {
    setTrack(target.index);
    await waitForTrackReady();
  }

  if (force || Math.abs(audio.currentTime - localTime) > 0.18) {
    audio.currentTime = localTime;
  }
}

function setTrack(index) {
  currentTrackIndex = Math.round(clamp(index, 0, TRACKS.length - 1));
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

function waitForTrackReady() {
  if (audio.readyState >= HTMLMediaElement.HAVE_METADATA) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    audio.addEventListener("loadedmetadata", resolve, { once: true });
  });
}

function draw(now) {
  fadeField();
  drawTimelineField(now);
  drawDitherDrift(now);
  drawWaveformRidges();
  drawFrequencyTeeth();
  drawBursts();
  drawHighFlicker(now);
  renderField(now);

  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(artCanvas, 0, 0, width, height);
}

function fadeField() {
  const decay = hasStarted ? 0.86 - bass * 0.08 : 0.9;

  for (let i = 0; i < heat.length; i += 1) {
    heat[i] *= decay;
    if (heat[i] < 0.02) heat[i] = 0;
  }
}

function drawTimelineField(now) {
  const w = CONFIG.logicalWidth;
  const h = CONFIG.logicalHeight;
  const albumPosition = scrollProgress * TRACKS.length;
  const act = Math.min(TRACKS.length - 1, Math.floor(albumPosition));
  const local = albumPosition - act;
  const redBias = clamp(0.22 + mids * 0.75 + (act % 3) * 0.08, 0.16, 0.86);
  const density = 0.12 + mids * 0.16 + bass * 0.1;
  const speed = hasStarted ? phase : phase * 0.45;
  const centerX = w * (0.5 + Math.sin(scrollProgress * Math.PI * 6) * 0.18);
  const centerY = h * (0.5 + Math.cos(scrollProgress * Math.PI * 4) * 0.12);

  if (act % 4 === 0) {
    for (let y = 0; y < h; y += 2) {
      const wave = Math.sin(y * (0.06 + local * 0.035) + scrollProgress * 44);
      const x = centerX + wave * (18 + bass * 34);
      drawBlock(x, y, 2 + bass * 7, 1, 0.5 + bass, pickColor(redBias + wave * 0.08));
      drawBlock(w - x, y, 1 + highs * 5, 1, 0.35 + highs, 1);
    }
  } else if (act % 4 === 1) {
    for (let x = 0; x < w; x += 4) {
      const gate = hash2(Math.floor(x / 4), act) < density + local * 0.08;
      if (!gate) continue;
      const top = Math.floor((Math.sin(x * 0.09 + scrollProgress * 30) * 0.5 + 0.5) * h * 0.42);
      const bar = h * (0.12 + hash2(act, x) * 0.52 + bass * 0.24);
      drawBlock(x, top, 2 + bass * 6, bar, 0.55 + mids, pickColor(redBias));
    }
  } else if (act % 4 === 2) {
    for (let ring = 0; ring < 8; ring += 1) {
      const r = 7 + ring * (5 + local * 3) + bass * 18;
      drawRectRing(centerX, centerY, r * 1.55, r, 0.36 + highs * 0.6, ring % 2 ? 2 : 1);
    }
  } else {
    for (let y = 0; y < h; y += 5) {
      const skew = Math.sin(y * 0.21 + scrollProgress * 60 + speed) * (18 + mids * 28);
      for (let x = -20; x < w + 20; x += 13) {
        if (hash2(x + act * 17, y) > density + 0.18) continue;
        drawBlock(x + skew, y, 8 + bass * 13, 2 + highs * 5, 0.42 + bass, pickColor(redBias));
      }
    }
  }

  drawGridScars(act, local, now);
}

function drawGridScars(act, local, now) {
  const w = CONFIG.logicalWidth;
  const h = CONFIG.logicalHeight;
  const stride = 6 + (act % 5) * 2;
  const pulse = Math.floor(now * 0.012 + act * 17);

  for (let y = 0; y < h; y += stride) {
    const offset = Math.floor(Math.sin(y * 0.13 + local * 12) * 8);
    for (let x = offset; x < w; x += stride * 2) {
      if (hash2(x + pulse, y - pulse) > 0.18 + highs * 0.22) continue;
      drawBlock(x, y, 2 + mids * 4, 1, 0.22 + highs * 0.65, (x + y + act) % 3 === 0 ? 2 : 1);
    }
  }
}

function drawDitherDrift(now) {
  const w = CONFIG.logicalWidth;
  const h = CONFIG.logicalHeight;
  const frameSeed = Math.floor(now * 0.018);
  const rows = 18 + Math.floor(mids * 34);
  const columns = 10 + Math.floor(bass * 18);

  for (let i = 0; i < rows; i += 1) {
    const y = Math.floor(hash2(i + frameSeed, 19) * h);
    const x = Math.floor((hash2(i, frameSeed) * w + scrollProgress * w * 3) % w);
    const length = 5 + Math.floor(hash2(i + 51, frameSeed) * (16 + highs * 34));
    const amount = 0.14 + hash2(frameSeed, i) * 0.24 + highs * 0.2;
    drawBlock(x, y, length, 1, amount, hash2(i, frameSeed + 9) > 0.72 ? 2 : 1);
  }

  for (let i = 0; i < columns; i += 1) {
    const x = Math.floor(hash2(i + 73, frameSeed) * w);
    const y = Math.floor(hash2(frameSeed + 29, i) * h);
    const height = 4 + Math.floor(hash2(i, frameSeed + 41) * (18 + bass * 36));
    const amount = 0.12 + bass * 0.46;
    drawBlock(x, y, 1 + Math.floor(bass * 3), height, amount, i % 3 === 0 ? 2 : 1);
  }
}

function drawWaveformRidges() {
  const w = CONFIG.logicalWidth;
  const h = CONFIG.logicalHeight;
  const rows = hasStarted && waveformData.length ? 4 : 2;

  for (let row = 0; row < rows; row += 1) {
    const yBase = h * (0.22 + row * 0.18);
    const colorIndex = row % 2 ? 2 : 1;

    for (let x = 0; x < w; x += 2) {
      const sampleIndex = Math.floor((x / w) * waveformData.length);
      const sample = waveformData.length ? (waveformData[sampleIndex] - 128) / 128 : Math.sin(x * 0.06 + phase * 1.7);
      const y = yBase + sample * (6 + bass * 24) + Math.sin(scrollProgress * 20 + x * 0.03) * 4;
      drawBlock(x, y, 2 + highs * 4, 1, 0.44 + bass * 0.45, colorIndex);
    }
  }
}

function drawFrequencyTeeth() {
  if (!frequencyData.length) return;

  const w = CONFIG.logicalWidth;
  const h = CONFIG.logicalHeight;
  const bins = 48;
  const baseY = h - 4;

  for (let i = 0; i < bins; i += 1) {
    const bin = Math.floor((i / bins) * frequencyData.length * 0.72);
    const energy = frequencyData[bin] / 255;
    if (energy < 0.08) continue;

    const x = Math.floor((i / bins) * w);
    const tooth = energy * (18 + mids * 30);
    drawBlock(x, baseY - tooth, 2 + energy * 4, tooth, 0.35 + energy, i % 3 === 0 ? 2 : 1);
  }
}

function spawnBurst() {
  bursts.push({
    x: CONFIG.logicalWidth * (0.5 + Math.sin(scrollProgress * 31) * 0.34),
    y: CONFIG.logicalHeight * (0.5 + Math.cos(scrollProgress * 19) * 0.28),
    age: 0,
    life: 0.45 + bass * 0.5,
    seed: Math.random() * 1000,
    color: Math.random() < 0.55 + mids * 0.35 ? 1 : 2
  });

  if (bursts.length > 22) bursts.shift();
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
    const force = (1 - t) * (0.7 + bass * 1.4);
    const radius = 5 + t * (35 + bass * 58);
    const chunks = 12 + Math.floor(bass * 18);

    drawRectRing(burst.x, burst.y, radius * 1.8, radius, force, burst.color);

    for (let i = 0; i < chunks; i += 1) {
      const angle = burst.seed + i * 1.91;
      const dist = radius * (0.35 + hash2(i, burst.seed) * 0.9);
      const x = burst.x + Math.cos(angle) * dist;
      const y = burst.y + Math.sin(angle * 1.27) * dist;
      const size = 2 + hash2(burst.seed, i) * (7 + bass * 14);
      drawBlock(x, y, size, Math.max(1, size * 0.5), force, i % 4 === 0 ? 2 : burst.color);
    }
  }
}

function drawHighFlicker(now) {
  const w = CONFIG.logicalWidth;
  const h = CONFIG.logicalHeight;
  const noiseCount = Math.floor(90 + highs * 760);
  const frameSeed = Math.floor(now * 0.06);

  for (let i = 0; i < noiseCount; i += 1) {
    const x = Math.floor(hash2(i, frameSeed) * w);
    const y = Math.floor(hash2(frameSeed, i + 31) * h);
    const length = 1 + Math.floor(hash2(i + 7, frameSeed) * (2 + highs * 10));
    const colorIndex = hash2(i + 3, frameSeed) > 0.7 ? 2 : 1;
    drawBlock(x, y, length, 1, 0.18 + highs * 0.82, colorIndex);
  }

  for (let y = frameSeed % 4; y < h; y += 4) {
    if (hash2(y, frameSeed) < 0.62 + highs * 0.2) {
      subtractLine(y, 0.2 + highs * 0.42);
    }
  }
}

function renderField(now) {
  const data = image.data;
  const frameSeed = Math.floor(now * 0.03);

  for (let i = 0; i < heat.length; i += 1) {
    const n = hash1(i + frameSeed);
    const lit = heat[i] > 0.18 + n * 0.42;
    const offset = i * 4;

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
  const left = cx - rx;
  const right = cx + rx;
  const top = cy - ry;
  const bottom = cy + ry;
  const thickness = 1 + bass * 5;

  drawBlock(left, top, rx * 2, thickness, amount, colorIndex);
  drawBlock(left, bottom, rx * 2, thickness, amount, colorIndex);
  drawBlock(left, top, thickness, ry * 2, amount, colorIndex);
  drawBlock(right, top, thickness, ry * 2, amount, colorIndex);
}

function subtractLine(y, amount) {
  const row = Math.floor(y);
  if (row < 0 || row >= CONFIG.logicalHeight) return;

  const start = row * CONFIG.logicalWidth;
  for (let x = 0; x < CONFIG.logicalWidth; x += 1) {
    heat[start + x] = Math.max(0, heat[start + x] - amount);
  }
}

function pickColor(redBias) {
  return Math.random() < redBias ? 2 : 1;
}

function updateScrollProgress() {
  const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
  scrollProgress = clamp(window.scrollY / maxScroll, 0, 1);
  targetGlobalTime = clamp(scrollProgress * TOTAL_DURATION, 0, Math.max(0, TOTAL_DURATION - 0.2));
  scrubUntil = performance.now() + CONFIG.scrubWindowMs;

  if (!hasStarted) {
    smoothedGlobalTime = targetGlobalTime;
  }

  if (Math.abs(scrollProgress - lastScrollProgress) > 0.001) {
    document.body.classList.toggle("is-ending", scrollProgress > 0.965);
    lastScrollProgress = scrollProgress;
  }

  if (!hasStarted && window.scrollY > 2) {
    startExperience();
  }
}

function syncScrollHeight() {
  const heightPx = Math.max(window.innerHeight * 3, Math.round(TOTAL_DURATION * CONFIG.pixelsPerSecond));
  scrollSpace.style.minHeight = `${heightPx}px`;
  updateScrollProgress();
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
  art.imageSmoothingEnabled = false;
  ctx.imageSmoothingEnabled = false;

  image = art.createImageData(CONFIG.logicalWidth, CONFIG.logicalHeight);
  heat = new Float32Array(CONFIG.logicalWidth * CONFIG.logicalHeight);
  color = new Uint8Array(CONFIG.logicalWidth * CONFIG.logicalHeight);

  syncScrollHeight();
}

function getTrackAtTime(globalTime) {
  const time = clamp(globalTime, 0, Math.max(0, TOTAL_DURATION - 0.001));

  for (let i = TRACKS.length - 1; i >= 0; i -= 1) {
    if (time >= TRACK_OFFSETS[i]) {
      return { index: i, track: TRACKS[i] };
    }
  }

  return { index: 0, track: TRACKS[0] };
}

function getGlobalAudioTime() {
  return TRACK_OFFSETS[currentTrackIndex] + (Number.isFinite(audio.currentTime) ? audio.currentTime : 0);
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
