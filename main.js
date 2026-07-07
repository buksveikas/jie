const CONFIG = {
  pixelsPerSecond: 210,
  logicalWidth: 192,
  logicalHeight: 108,
  bassHitThreshold: 0.62
};

const TRACKS = [
  {
    title: "Jie",
    src: "./assets/1. EGOMAŠINA - Jie mix 2.m4a",
    duration: 180.382132
  },
  {
    title: "Bamboaze",
    src: "./assets/2. EGOMAŠINA - Bamboaze.m4a",
    duration: 211
  },
  {
    title: "Patogu, Patinka",
    src: "./assets/3. EGOMAŠINA - Patogu, Patinka Mix 2.m4a",
    duration: 173.403061
  },
  {
    title: "Sakau Tau Labas",
    src: "./assets/4. EGOMAŠINA - Sakau Tau Labas mix 3.m4a",
    duration: 161.142857
  },
  {
    title: "Tu nežinai",
    src: "./assets/5. EGOMAŠINA - Tu nežinai.m4a",
    duration: 183.5
  },
  {
    title: "Paleisk Jau",
    src: "./assets/6. EGOMAŠINA - Paleisk Jau.m4a",
    duration: 122.5
  },
  {
    title: "Ūkio Mazas",
    src: "./assets/7. EGOMAŠINA - Ūkio Mazas (1).m4a",
    duration: 241
  },
  {
    title: "Piktas Vyras",
    src: "./assets/8. EGOMAŠINA - Piktas Vyras mix 3.m4a",
    duration: 209.620204
  },
  {
    title: "Ne Vienas Tu",
    src: "./assets/9. EGOMAŠINA - Ne Vienas Tu mix 2.m4a",
    duration: 218.860113
  },
  {
    title: "Trys Ir",
    src: "./assets/10. EGOMAŠINA - Trys Ir.m4a",
    duration: 211.5
  },
  {
    title: "Seagul Sounds",
    src: "./assets/11. EGOMAŠINA - Seagul Sounds mix 3.m4a",
    duration: 162
  },
  {
    title: "Vesiai",
    src: "./assets/12. EGOMAŠINA - vesiai.m4a",
    duration: 193.333333
  },
  {
    title: "Plomba",
    src: "./assets/13. EGOMAŠINA - Plomba.m4a",
    duration: 144.545465
  }
];

const TRACK_OFFSETS = TRACKS.reduce((offsets, track, index) => {
  offsets[index] = index === 0 ? 0 : offsets[index - 1] + TRACKS[index - 1].duration;
  return offsets;
}, []);
const TOTAL_DURATION = TRACKS.reduce((sum, track) => sum + track.duration, 0);

const COLORS = {
  black: "#000000",
  yellow: "#FFD700",
  red: "#CC0000"
};

const canvas = document.querySelector("#album-canvas");
const audio = document.querySelector("#album-audio");
const scrollSpace = document.querySelector("#scroll-space");
const ctx = canvas.getContext("2d", { alpha: false });
const artCanvas = document.createElement("canvas");
const art = artCanvas.getContext("2d", { alpha: false });

let width = 0;
let height = 0;
let dpr = 1;
let audioContext;
let analyser;
let mediaSource;
let frequencyData = new Uint8Array(0);
let hasStarted = false;
let lastFrameTime = performance.now();
let smoothedTargetTime = 0;
let currentTrackIndex = 0;
let activeScrubUntil = 0;
let scrollProgress = 0;
let lastScrollProgress = -1;
let bassEnergy = 0;
let midEnergy = 0;
let highEnergy = 0;
let bassMemory = 0;
let phase = 0;
let warningLogged = false;

const explosions = [];
const sections = [
  { stride: 12, drift: 0.8, density: 0.16 },
  { stride: 9, drift: 1.4, density: 0.23 },
  { stride: 7, drift: 2.1, density: 0.31 },
  { stride: 5, drift: 3.2, density: 0.39 }
];

audio.addEventListener("ended", playNextTrack);
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
  if (hasStarted) {
    await resumePlayback();
    return;
  }

  hasStarted = true;

  setTrack(0);
  audio.preload = "auto";

  audioContext = new AudioContext();
  analyser = audioContext.createAnalyser();
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0.72;
  frequencyData = new Uint8Array(analyser.frequencyBinCount);

  if (!mediaSource) {
    mediaSource = audioContext.createMediaElementSource(audio);
    mediaSource.connect(analyser);
    analyser.connect(audioContext.destination);
  }

  try {
    await audioContext.resume();
    await seekToGlobalTime(scrollProgress * TOTAL_DURATION, true);
    await resumePlayback();
  } catch (error) {
    if (!warningLogged) {
      console.warn("Audio could not start.", error);
      warningLogged = true;
    }
  }
}

async function resumePlayback() {
  if (audioContext?.state === "suspended") {
    await audioContext.resume();
  }

  if (audio.paused) {
    await audio.play();
  }
}

function frame(now) {
  const dt = Math.min(0.05, (now - lastFrameTime) / 1000);
  lastFrameTime = now;
  phase += dt;

  readAudioBands();
  updateAudioTarget(now);
  draw(dt);

  requestAnimationFrame(frame);
}

function readAudioBands() {
  if (analyser && frequencyData.length) {
    analyser.getByteFrequencyData(frequencyData);
    bassEnergy = bandAverage(0, 0.08);
    midEnergy = bandAverage(0.08, 0.42);
    highEnergy = bandAverage(0.42, 1);
  } else {
    bassEnergy = 0.14 + Math.sin(phase * 1.7) * 0.035;
    midEnergy = 0.18 + Math.sin(phase * 0.9 + 1.6) * 0.04;
    highEnergy = 0.1 + Math.sin(phase * 2.2 + 3) * 0.025;
  }

  if (bassEnergy > CONFIG.bassHitThreshold && bassEnergy > bassMemory + 0.08) {
    spawnExplosion();
  }

  bassMemory = lerp(bassMemory, bassEnergy, 0.18);
}

function bandAverage(startRatio, endRatio) {
  const start = Math.max(0, Math.floor(frequencyData.length * startRatio));
  const end = Math.min(frequencyData.length, Math.max(start + 1, Math.floor(frequencyData.length * endRatio)));
  let sum = 0;

  for (let i = start; i < end; i += 1) {
    sum += frequencyData[i];
  }

  return sum / ((end - start) * 255);
}

async function updateAudioTarget(now) {
  if (!hasStarted || now > activeScrubUntil) return;

  const target = clamp(scrollProgress * TOTAL_DURATION, 0, Math.max(0, TOTAL_DURATION - 0.2));
  smoothedTargetTime = lerp(smoothedTargetTime || target, target, 0.32);

  if (Math.abs(getGlobalAudioTime() - smoothedTargetTime) > 0.2) {
    await seekToGlobalTime(smoothedTargetTime, false);
  }
}

async function seekToGlobalTime(globalTime, force) {
  const target = getTrackAtTime(globalTime);
  const localTime = clamp(globalTime - TRACK_OFFSETS[target.index], 0, Math.max(0, target.track.duration - 0.2));

  if (target.index !== currentTrackIndex || !audio.src) {
    setTrack(target.index);
    await waitForTrackReady();
  }

  if (force || Math.abs(audio.currentTime - localTime) > 0.2) {
    audio.currentTime = localTime;
  }
}

function setTrack(index) {
  currentTrackIndex = clamp(index, 0, TRACKS.length - 1);
  const track = TRACKS[currentTrackIndex];
  const src = new URL(track.src, window.location.href).href;

  if (audio.src !== src) {
    audio.src = src;
    audio.load();
  }
}

function playNextTrack() {
  if (currentTrackIndex >= TRACKS.length - 1) return;

  setTrack(currentTrackIndex + 1);
  audio.play().catch((error) => {
    if (!warningLogged) {
      console.warn("Could not continue to the next track.", error);
      warningLogged = true;
    }
  });
}

function waitForTrackReady() {
  if (audio.readyState >= HTMLMediaElement.HAVE_METADATA) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    audio.addEventListener("loadedmetadata", resolve, { once: true });
  });
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

function draw(dt) {
  const sectionIndex = Math.min(sections.length - 1, Math.floor(scrollProgress * sections.length));
  const section = sections[sectionIndex];
  const shift = Math.floor(scrollProgress * 4000);
  const yellowBias = clamp(0.35 + midEnergy * 0.9, 0.2, 0.9);
  const redBias = 1 - yellowBias;

  art.globalCompositeOperation = "source-over";
  art.fillStyle = `rgba(0, 0, 0, ${hasStarted ? 0.16 : 0.28})`;
  art.fillRect(0, 0, CONFIG.logicalWidth, CONFIG.logicalHeight);

  drawSectionGrid(section, shift, yellowBias, redBias);
  drawExplosions(dt);
  drawHighNoise();
  drawScanlines();

  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = COLORS.black;
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(artCanvas, 0, 0, width, height);
}

function drawSectionGrid(section, shift, yellowBias, redBias) {
  const stride = section.stride;
  const wobble = Math.round((bassEnergy * 8 + highEnergy * 4) * section.drift);
  const timeJitter = hasStarted ? Math.floor(phase * (4 + highEnergy * 22)) : 0;

  for (let y = -stride; y < CONFIG.logicalHeight + stride; y += stride) {
    for (let x = -stride; x < CONFIG.logicalWidth + stride; x += stride) {
      const index = ((x + shift) * 13 + (y - shift) * 7 + timeJitter * 19) & 255;
      const gate = ((index / 255) + Math.sin((x * 0.1) + scrollProgress * 18) * 0.08);
      if (gate > section.density + bassEnergy * 0.16) continue;

      const colorPick = ((index % 100) / 100) < yellowBias ? COLORS.yellow : COLORS.red;
      const size = Math.max(1, Math.floor(stride * (0.35 + bassEnergy * 0.9)));
      const offset = ((index % 3) - 1) * wobble;

      art.globalAlpha = clamp(0.3 + midEnergy + bassEnergy * 0.5, 0.28, 0.94);
      art.fillStyle = colorPick;
      art.fillRect(x + offset, y - offset, size, size);

      if (redBias > 0.45 && index % 5 === 0) {
        art.globalAlpha = clamp(redBias, 0.2, 0.72);
        art.fillStyle = COLORS.red;
        art.fillRect(x + size, y, Math.max(1, Math.floor(size * 0.5)), size);
      }
    }
  }

  art.globalAlpha = 1;
}

function drawExplosions(dt) {
  for (let i = explosions.length - 1; i >= 0; i -= 1) {
    const burst = explosions[i];
    burst.age += dt;
    const life = burst.age / burst.duration;

    if (life >= 1) {
      explosions.splice(i, 1);
      continue;
    }

    const radius = burst.radius * (0.3 + life * 1.9);
    const alpha = (1 - life) * (0.45 + bassEnergy * 0.65);
    const block = Math.max(3, Math.floor(5 + bassEnergy * 18));

    art.globalAlpha = alpha;
    art.fillStyle = burst.color;

    for (let n = 0; n < 9; n += 1) {
      const angle = burst.seed + n * 0.72 + life * 0.9;
      const x = burst.x + Math.cos(angle) * radius * (0.35 + (n % 3) * 0.28);
      const y = burst.y + Math.sin(angle * 1.3) * radius * (0.25 + (n % 4) * 0.2);
      art.fillRect(Math.round(x / block) * block, Math.round(y / block) * block, block * 2, block);
    }
  }

  art.globalAlpha = 1;
}

function drawHighNoise() {
  const amount = Math.floor(28 + highEnergy * 360);

  for (let i = 0; i < amount; i += 1) {
    const x = Math.floor(Math.random() * CONFIG.logicalWidth);
    const y = Math.floor(Math.random() * CONFIG.logicalHeight);
    const w = 1 + Math.floor(Math.random() * (2 + highEnergy * 8));
    const colorRoll = Math.random();

    art.globalAlpha = clamp(0.16 + highEnergy * 0.84, 0.16, 0.92);
    art.fillStyle = colorRoll > 0.72 ? COLORS.black : colorRoll > 0.42 ? COLORS.red : COLORS.yellow;
    art.fillRect(x, y, w, 1);
  }

  art.globalAlpha = 1;
}

function drawScanlines() {
  const spacing = highEnergy > 0.4 ? 2 : 3;
  art.globalAlpha = clamp(0.12 + highEnergy * 0.42, 0.12, 0.58);
  art.fillStyle = COLORS.black;

  for (let y = 0; y < CONFIG.logicalHeight; y += spacing) {
    if ((y + Math.floor(phase * 24)) % 5 !== 0) {
      art.fillRect(0, y, CONFIG.logicalWidth, 1);
    }
  }

  art.globalAlpha = 1;
}

function spawnExplosion() {
  const centerDrift = Math.sin(scrollProgress * Math.PI * 8);
  explosions.push({
    age: 0,
    duration: 0.35 + bassEnergy * 0.5,
    radius: 10 + bassEnergy * 58,
    seed: Math.random() * Math.PI * 2,
    x: CONFIG.logicalWidth * (0.5 + centerDrift * 0.32),
    y: CONFIG.logicalHeight * (0.5 + Math.cos(scrollProgress * Math.PI * 5) * 0.26),
    color: Math.random() > midEnergy ? COLORS.yellow : COLORS.red
  });

  if (explosions.length > 18) {
    explosions.shift();
  }
}

function updateScrollProgress() {
  const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
  scrollProgress = clamp(window.scrollY / maxScroll, 0, 1);
  activeScrubUntil = performance.now() + 420;
  smoothedTargetTime = hasStarted ? getGlobalAudioTime() : scrollProgress * TOTAL_DURATION;

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
  dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
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

  syncScrollHeight();
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
