const TEXT = {
  " ": ["000", "000", "000", "000", "000"],
  "/": ["001", "001", "010", "100", "100"],
  "[": ["111", "100", "100", "100", "111"],
  "]": ["111", "001", "001", "001", "111"],
  "0": ["111", "101", "101", "101", "111"],
  "1": ["010", "110", "010", "010", "111"],
  "2": ["111", "001", "111", "100", "111"],
  "3": ["111", "001", "111", "001", "111"],
  "4": ["101", "101", "111", "001", "001"],
  "5": ["111", "100", "111", "001", "111"],
  "6": ["111", "100", "111", "101", "111"],
  "7": ["111", "001", "010", "100", "100"],
  "8": ["111", "101", "111", "101", "111"],
  "9": ["111", "101", "111", "001", "111"],
  "A": ["010", "101", "111", "101", "101"],
  "C": ["111", "100", "100", "100", "111"],
  "E": ["111", "100", "111", "100", "111"],
  "G": ["111", "100", "101", "101", "111"],
  "L": ["100", "100", "100", "100", "111"],
  "M": ["101", "111", "111", "101", "101"],
  "O": ["111", "101", "101", "101", "111"],
  "P": ["111", "101", "111", "100", "100"],
  "R": ["111", "101", "111", "110", "101"],
  "S": ["111", "100", "111", "001", "111"],
  "T": ["111", "010", "010", "010", "010"],
  "V": ["101", "101", "101", "101", "010"],
  "Y": ["101", "101", "010", "010", "010"]
};

export class GameLayer {
  constructor({ canvas, drawBlock, isAlbumStarted, isAlbumPlaying }) {
    this.canvas = canvas;
    this.drawBlock = drawBlock;
    this.isAlbumStarted = isAlbumStarted || (() => false);
    this.isAlbumPlaying = isAlbumPlaying || this.isAlbumStarted;

    this.state = "idle";
    this.obstacles = [];
    this.score = 0;
    this.velocityY = 0;
    this.jumpY = 0;
    this.spawnTimer = 0.8;
    this.gameOverTimer = 0;
    this.groundPulse = 0;
    this.fade = 1;
    this.frame = 0;
    this.lastHighFlicker = 0;
    this.activeChapter = 1;
    this.groundY = 123;
    this.width = 220;
    this.height = 124;

    this.runners = [
      { x: 24, flavor: "moustache" },
      { x: 36, flavor: "cap" },
      { x: 48, flavor: "beanie" }
    ];

    window.addEventListener("keydown", (event) => this.handleKey(event));
    window.addEventListener("pointerdown", (event) => this.handlePointer(event), { passive: false });
    if (this.canvas) {
      this.canvas.addEventListener("pointerdown", (event) => this.handlePointer(event), { passive: false });
    }
  }

  update(dt, bass, highs, activeChapter) {
    this.frame += 1;
    this.activeChapter = Math.max(1, Math.min(13, Number(activeChapter) || 1));
    this.groundPulse = Math.max(0, this.groundPulse - dt * 9);

    if (bass > 0.43) {
      this.groundPulse = 1;
    }

    if (highs > 0.48 && this.lastHighFlicker <= 0) {
      this.lastHighFlicker = 0.14;
    } else {
      this.lastHighFlicker = Math.max(0, this.lastHighFlicker - dt);
    }

    if (this.state === "gameover") {
      this.gameOverTimer -= dt;
      this.fade = Math.max(0, this.gameOverTimer / 0.35);
      if (this.gameOverTimer <= 0) {
        this.resetToIdle();
      }
      return;
    }

    if (this.state !== "active") return;

    const tuning = this.getTuning(this.activeChapter);
    this.score += dt * tuning.speed * 0.42;
    this.spawnTimer -= dt;
    this.jumpY = Math.max(0, this.jumpY + this.velocityY * dt);
    this.velocityY -= 112 * dt;

    if (this.jumpY <= 0) {
      this.jumpY = 0;
      this.velocityY = 0;
    }

    for (const obstacle of this.obstacles) {
      obstacle.x -= tuning.speed * dt;
    }

    while (this.spawnTimer <= 0) {
      this.spawnObstacle(tuning);
      this.spawnTimer += tuning.gap * (0.82 + this.random() * 0.42);
    }

    this.obstacles = this.obstacles.filter((obstacle) => obstacle.x + obstacle.w > -4);

    if (this.hasCollision()) {
      this.enterGameOver();
    }
  }

  draw(art, CONFIG) {
    void art;
    this.width = CONFIG.logicalWidth;
    this.height = CONFIG.logicalHeight;
    this.groundY = CONFIG.logicalHeight - 1;

    if (this.isAlbumStarted() && this.state === "idle") {
      const blink = Math.floor(this.frame / 28) % 2 === 0;
      if (blink) {
        this.drawCenteredText("[ SPACE / TAP TO PLAY ]", this.groundY - 16, 1, 1, 0.95);
      }
      return;
    }

    if (this.state !== "active" && this.state !== "gameover") return;

    const amount = 1.2 * this.fade;
    const colorIndex = this.activeChapter % 2 === 0 ? 2 : 1;
    const groundHeight = this.groundPulse > 0 ? 2 : 1;

    this.drawBlock(0, this.groundY, this.width, groundHeight, amount, colorIndex);

    const hideObstacles = this.lastHighFlicker > 0.07 && this.frame % 2 === 0;
    if (!hideObstacles) {
      for (const obstacle of this.obstacles) {
        this.drawBlock(obstacle.x, this.groundY - obstacle.h, obstacle.w, obstacle.h, amount, obstacle.color);
        if (obstacle.teeth) {
          this.drawBlock(obstacle.x + 1, this.groundY - obstacle.h - 2, Math.max(1, obstacle.w - 2), 2, amount * 0.8, obstacle.color);
        }
      }
    }

    for (const runner of this.runners) {
      this.drawRunner(runner.x, this.groundY - 12 - this.jumpY, runner.flavor, amount);
    }

    const scoreText = `SCORE ${Math.floor(this.score)}`;
    this.drawPixelText(scoreText, this.width - this.measureText(scoreText, 1) - 9, 5, 1, 1, amount);

    if (this.state === "gameover") {
      this.drawCenteredText("[ GAME OVER ]", 43, 2, 2, amount);
      this.drawCenteredText(`SCORE ${Math.floor(this.score)}`, 59, 1, 1, amount);
    }
  }

  handleKey(event) {
    if (event.code !== "Space") return;
    if (!this.isAlbumStarted()) return;

    event.preventDefault();

    if (this.state === "active") {
      this.jump();
    } else if (this.state === "idle" && this.isAlbumPlaying()) {
      this.start();
    }
  }

  handlePointer(event) {
    if (!this.isAlbumStarted()) return;
    if (event.target?.closest?.("#start-button")) return;

    if (this.state === "active") {
      event.preventDefault();
      this.jump();
    } else if (this.state === "idle" && this.isAlbumPlaying()) {
      event.preventDefault();
      this.start();
    }
  }

  start() {
    this.state = "active";
    document.body.classList.add("is-game-running");
    if (this.canvas) this.canvas.style.zIndex = "4";
    this.score = 0;
    this.jumpY = 0;
    this.velocityY = 0;
    this.fade = 1;
    this.obstacles = [];
    this.spawnTimer = 0.55;
  }

  jump() {
    if (this.jumpY > 0.4) return;
    this.velocityY = 43;
    this.jumpY = 0.1;
  }

  enterGameOver() {
    this.state = "gameover";
    this.gameOverTimer = 2;
    this.velocityY = 0;
  }

  resetToIdle() {
    this.state = "idle";
    document.body.classList.remove("is-game-running");
    if (this.canvas) this.canvas.style.zIndex = "";
    this.obstacles = [];
    this.jumpY = 0;
    this.velocityY = 0;
    this.fade = 1;
  }

  getTuning(chapter) {
    if (chapter <= 4) {
      return {
        speed: 32 + chapter * 2.8,
        gap: 1.35 - chapter * 0.05,
        doubleChance: 0.02
      };
    }

    if (chapter <= 9) {
      return {
        speed: 44 + (chapter - 5) * 3.5,
        gap: 1.02 - (chapter - 5) * 0.045,
        doubleChance: 0.22
      };
    }

    return {
      speed: 63 + (chapter - 10) * 5.4,
      gap: 0.78 - (chapter - 10) * 0.035,
      doubleChance: 0.34
    };
  }

  spawnObstacle(tuning) {
    const color = this.activeChapter % 2 === 0 ? 2 : 1;
    const base = {
      x: this.width + 4,
      w: 3 + Math.floor(this.random() * 4),
      h: 2 + Math.floor(this.random() * 7),
      color,
      teeth: this.activeChapter >= 8 && this.random() > 0.62
    };

    this.obstacles.push(base);

    if (this.random() < tuning.doubleChance) {
      this.obstacles.push({
        x: base.x + 9 + this.random() * 7,
        w: 3 + Math.floor(this.random() * 4),
        h: 2 + Math.floor(this.random() * 7),
        color,
        teeth: this.activeChapter >= 10 && this.random() > 0.54
      });
    }
  }

  hasCollision() {
    for (const runner of this.runners) {
      const rx = runner.x + 1;
      const ry = this.groundY - 11 - this.jumpY;
      const rw = 6;
      const rh = 11;

      for (const obstacle of this.obstacles) {
        const ox = obstacle.x;
        const oy = this.groundY - obstacle.h;
        if (rx < ox + obstacle.w && rx + rw > ox && ry < oy + obstacle.h && ry + rh > oy) {
          return true;
        }
      }
    }

    return false;
  }

  drawRunner(x, y, flavor, amount) {
    const px = Math.round(x);
    const py = Math.round(y);

    if (flavor === "moustache") {
      this.drawBlock(px + 2, py, 4, 1, amount, 1);
      this.drawBlock(px + 1, py + 1, 6, 1, amount, 1);
      this.drawBlock(px + 2, py + 2, 4, 3, amount, 1);
      this.drawBlock(px + 2, py + 5, 4, 1, amount, 2);
      this.drawBlock(px + 1, py + 6, 6, 4, amount, 2);
      this.drawBlock(px, py + 7, 1, 3, amount, 2);
      this.drawBlock(px + 7, py + 7, 1, 3, amount, 2);
      this.drawRunLegs(px, py, amount, 1);
      return;
    }

    if (flavor === "cap") {
      this.drawBlock(px + 1, py, 6, 2, amount, 2);
      this.drawBlock(px + 6, py + 1, 2, 1, amount, 2);
      this.drawBlock(px + 2, py + 2, 4, 3, amount, 1);
      this.drawBlock(px + 1, py + 4, 6, 2, amount, 2);
      this.drawBlock(px + 2, py + 6, 4, 4, amount, 1);
      this.drawBlock(px, py + 7, 1, 3, amount, 1);
      this.drawBlock(px + 7, py + 7, 1, 3, amount, 1);
      this.drawRunLegs(px, py, amount, 2);
      return;
    }

    this.drawBlock(px + 1, py, 6, 2, amount, 2);
    this.drawBlock(px + 2, py + 2, 4, 1, amount, 2);
    this.drawBlock(px + 2, py + 3, 1, 1, amount, 1);
    this.drawBlock(px + 5, py + 3, 1, 1, amount, 1);
    this.drawBlock(px + 1, py + 5, 6, 5, amount, 1);
    this.drawBlock(px, py + 7, 1, 3, amount, 1);
    this.drawBlock(px + 7, py + 7, 1, 3, amount, 1);
    this.drawRunLegs(px, py, amount, 2);
  }

  drawRunLegs(px, py, amount, colorIndex) {
    const stride = Math.floor(this.frame / 7) % 2;
    if (this.jumpY > 0.2 || stride === 0) {
      this.drawBlock(px + 2, py + 10, 1, 2, amount, colorIndex);
      this.drawBlock(px + 5, py + 10, 1, 2, amount, colorIndex);
    } else {
      this.drawBlock(px + 1, py + 10, 2, 1, amount, colorIndex);
      this.drawBlock(px + 5, py + 10, 2, 1, amount, colorIndex);
      this.drawBlock(px + 2, py + 11, 1, 1, amount, colorIndex);
      this.drawBlock(px + 6, py + 11, 1, 1, amount, colorIndex);
    }
  }

  drawCenteredText(text, y, scale, colorIndex, amount) {
    const x = Math.floor((this.width - this.measureText(text, scale)) / 2);
    this.drawPixelText(text, x, y, scale, colorIndex, amount);
  }

  drawPixelText(text, x, y, scale, colorIndex, amount) {
    let cursor = Math.floor(x);
    const top = Math.floor(y);
    const size = Math.max(1, Math.floor(scale));

    for (const rawChar of text.toUpperCase()) {
      const glyph = TEXT[rawChar] || TEXT[" "];
      for (let row = 0; row < glyph.length; row += 1) {
        for (let col = 0; col < glyph[row].length; col += 1) {
          if (glyph[row][col] === "1") {
            this.drawBlock(cursor + col * size, top + row * size, size, size, amount, colorIndex);
          }
        }
      }
      cursor += (glyph[0].length + 1) * size;
    }
  }

  measureText(text, scale) {
    let width = 0;
    const size = Math.max(1, Math.floor(scale));

    for (const rawChar of text.toUpperCase()) {
      const glyph = TEXT[rawChar] || TEXT[" "];
      width += (glyph[0].length + 1) * size;
    }

    return Math.max(0, width - size);
  }

  random() {
    const x = Math.sin((this.frame + 1) * 12.9898 + this.score * 78.233 + this.obstacles.length * 19.19) * 43758.5453;
    return x - Math.floor(x);
  }
}
