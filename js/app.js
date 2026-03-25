const BOX_W = 46;
const BOX_H = 26;
const BALL_RADIUS = 9;
const COLS = 10;
const ROWS = 6;

const BOSS_W = BOX_W * 3 + 4 * 2;  // 46*3 + 8 = 146
const BOSS_H = BOX_H * 2 + 10;     // 26*2 + 10 = 62

const POWERUP_COLORS = {
  wide:   0xff8800, // orange
  fast:   0xffff00, // yellow
  multi:  0x00ff00, // green
  laser:  0xff4444, // red
  life:   0xff88cc, // pink
  shield: 0x44ffff, // light cyan
  bigball: 0x00aaff, // sky blue
  timeslow: 0xaaaaff, // pale lavender
};

const SOUNDS = {
  'hit-brick':  { freq: 220, type: 'square',   dur: 0.06, vol: 0.3 },
  'hit-paddle': { freq: 180, type: 'sine',      dur: 0.08, vol: 0.3 },
  'explode':    { freq: 80,  type: 'sawtooth',  dur: 0.10, vol: 0.4, freqEnd: 30 },
  'powerup':    { freq: 400, type: 'sine',      dur: 0.15, vol: 0.5, freqEnd: 600 },
  'life-lost':  { freq: 440, type: 'square',    dur: 0.40, vol: 0.5, freqEnd: 110 },
  'enemy-die':  { freq: 300, type: 'square',    dur: 0.05, vol: 0.3 },
  'shield-hit': { freq: 600, type: 'triangle',  dur: 0.10, vol: 0.4, freqEnd: 200 },
};

// Each entry is 6 rows × 10 cols, '1' = active brick, '0' = gap
const PATTERNS = [
  // Level 1 — T-shape (28 bricks, all 1HP)
  ['1111111111',
   '1111111111',
   '0000110000',
   '0000110000',
   '0000110000',
   '0000110000'],
  // Level 2 — Diamond cluster (~38 bricks)
  ['0011111100',
   '0111111110',
   '1111111111',
   '0111111110',
   '0011111100',
   '0000000000'],
  // Level 3 — Chevron (~38 bricks)
  ['1000000001',
   '1100000011',
   '1110000111',
   '1111001111',
   '1111111111',
   '0111111110'],
  // Level 4 — Cross + border (~44 bricks)
  ['1111111111',
   '1000110001',
   '1011111101',
   '1011111101',
   '1000110001',
   '1111111111'],
  // Level 5 — Frame + fill (~48 bricks)
  ['1111111111',
   '1111111111',
   '1100000011',
   '1100000011',
   '1111111111',
   '1111111111'],
  // Level 6 — Full grid (60 bricks)
  ['1111111111',
   '1111111111',
   '1111111111',
   '1111111111',
   '1111111111',
   '1111111111'],
];

// [from-color, to-color] for body gradient — cycles with levels
const BG_GRADIENTS = [
  ['#00E5FF', '#311B92'], // Level 1 — cyan → deep purple   (default)
  ['#FF6B35', '#4A0030'], // Level 2 — orange → dark magenta
  ['#00FF99', '#003322'], // Level 3 — neon green → dark teal
  ['#FF44CC', '#220055'], // Level 4 — hot pink → deep purple
  ['#FFCC00', '#441100'], // Level 5 — gold → dark ember
  ['#00AAFF', '#000833'], // Level 6 — electric blue → near black
];

const PATTERN_COLORS = [
  0x88ccff, // Level 1 — soft blue
  0xffaa44, // Level 2 — orange
  0xcc66ff, // Level 3 — purple
  0x44ff88, // Level 4 — green
  0xff4466, // Level 5 — red
  0xffdd00, // Level 6 — gold
];

class TitleScene extends Phaser.Scene {
  constructor() {
    super({ key: 'TitleScene' });
  }

  create() {
    const W = this.scale.width;
    const H = this.scale.height;
    const highScore = localStorage.getItem('breakout_highscore') || 0;

    this.add.text(W / 2, H * 0.35, 'PRESS UP TO START', {
      font: '48px Bungee Shade', fill: '#ffffff'
    }).setOrigin(0.5, 0);

    this.add.text(W / 2, H * 0.35 + 60, 'BEST: ' + highScore, {
      font: '24px Bungee Shade', fill: '#aaddff'
    }).setOrigin(0.5, 0);

    // Power-up legend
    const legendDefs = [
      ['WIDE',     0xff8800], ['FAST',   0xffff00],
      ['MULTI',    0x00ff00], ['LASER',  0xff4444],
      ['LIFE',     0xff88cc],
      ['SHIELD',   0x44ffff], ['BIG BALL', 0x00aaff],
      ['TIME SLOW', 0xaaaaff],
    ];
    const legendStartY = H * 0.35 + 120;
    const colW = 130;
    const col0X = W / 2 - colW;
    const col1X = W / 2 + 10;
    legendDefs.forEach(([label, color], i) => {
      const x = i % 2 === 0 ? col0X : col1X;
      const y = legendStartY + Math.floor(i / 2) * 28;
      this.add.rectangle(x + 6, y + 8, 12, 12, color);
      this.add.text(x + 16, y, label, { font: '13px Arial', fill: '#ffffff' });
    });

    this.add.text(W / 2, legendStartY + Math.ceil(legendDefs.length / 2) * 28 + 16, 'M — toggle sound', {
      font: '13px Arial', fill: '#ffffff'
    }).setOrigin(0.5, 0);

    this.input.keyboard.once('keydown-UP', () => this.scene.start('MainState'));
    this.time.delayedCall(300, () => {
      this.input.once('pointerdown', () => this.scene.start('MainState'));
    });
  }
}

class MainState extends Phaser.Scene {
  constructor() {
    super({ key: 'MainState' });
  }

  preload() {
    this.load.on('loaderror', () => {}); // silently skip missing assets
    this.load.audio('music', 'assets/music.mp3');
  }

  create() {
    const W = this.scale.width;
    const H = this.scale.height;
    const centerX = W / 2;
    const centerY = H / 2;

    this.score = 0;
    this.highScore = parseInt(localStorage.getItem('breakout_highscore') || '0');
    this.lives = 3;
    this._losingLife = false;
    this.lastFired = 0;
    this.fireRate = 200;
    this.bulletSpeed = 900;
    this.level = 1;
    this.ballSpeed = 300;
    this.formationDir = 1;
    this.paddleBaseWidth = W / 3;
    this.paddleSpeed = 500;
    this.combo = 0;
    this.comboMultiplier = 1;
    this.shieldActive = false;
    this.ballSizeActive = false;
    this.ballSizeTimer = null;
    this.timeSlowActive = false;
    this.timeSlowTimer = null;
    this.bossActive = false;
    this.bossHp = 0;
    this.bossMaxHp = 0;
    this.bossFireTimer = 0;
    this.bossHitCooldown = 0;

    // --- Paddle ---
    this.paddle = this.add.rectangle(centerX, H - 20, W / 3, 15, 0xffffff);
    this.physics.add.existing(this.paddle);
    this.paddle.body.setImmovable(true);
    this.paddle.body.setAllowGravity(false);
    this.paddle.body.setCollideWorldBounds(true);

    // Rounded paddle graphic — draws over the invisible physics rectangle
    this.paddleGfx = this.add.graphics();
    this.paddleGfx.setDepth(10);
    this.paddle.setVisible(false); // physics rect is now the invisible hitbox only

    // --- Ball pool (1 main + 2 extras for multi-ball) ---
    this.balls = [];
    for (let i = 0; i < 3; i++) {
      const b = this.add.circle(-200, -200, BALL_RADIUS, 0xffffff);
      this.physics.add.existing(b);
      b.body.setCircle(BALL_RADIUS);
      b.body.setBounce(1);
      b.body.setAllowGravity(false);
      b.body.setCollideWorldBounds(true);
      b.setActive(false).setVisible(false);
      b.body.enable = false;
      b.startPos = false;
      this.balls.push(b);
    }

    // --- Bricks (pre-created, pooled) ---
    this.brickObjects = [];
    this.initBricks(centerX);

    // Per-brick crack graphics (one per brick slot, index matches brickObjects[])
    this.brickCrackGfx = [];
    for (let i = 0; i < 60; i++) {
      const gfx = this.add.graphics();
      gfx.setDepth(1); // above bricks (depth 0), below paddle (depth 10)
      this.brickCrackGfx.push(gfx);
    }

    // Boss brick — single entity, shown/hidden per level
    // Position is set after _gridStartX is known (initBricks was called above)
    // Boss occupies cols 3,4,5 × rows 2,3 (0-indexed), center = col 4, midpoint of rows 2-3
    this.bossX = this._gridStartX + 4 * (BOX_W + 4);
    this.bossY = 130 + (BOX_H + 10) * 2.5; // midpoint of rows 2 and 3: 130 + 90 = 220
    this.bossBrick = this.add.rectangle(this.bossX, this.bossY, BOSS_W, BOSS_H, 0xffcc00);
    this.physics.add.existing(this.bossBrick);
    this.bossBrick.body.setImmovable(true);
    this.bossBrick.body.setAllowGravity(false);
    this.bossBrick.setVisible(false);
    this.bossBrick.body.enable = false;
    this.bossBrickGfx = this.add.graphics();
    this.bossBrickGfx.setDepth(2);
    this.bossBrickGfx.setVisible(false);

    this.applyPattern(1);
    this.setBackground(1);

    // --- Explosion shrapnel pool ---
    this.shrapnelPool = [];
    for (let i = 0; i < 100; i++) {
      const s = this.add.rectangle(-200, -200, 10, 10, 0xffffff);
      this.physics.add.existing(s);
      s.setActive(false).setVisible(false);
      s.body.enable = false;
      this.shrapnelPool.push(s);
    }

    // --- Bullet pool ---
    this.bulletObjects = [];
    for (let i = 0; i < 30; i++) {
      const b = this.add.rectangle(-200, -200, 6, 14, 0xffffff);
      this.physics.add.existing(b);
      b.setActive(false).setVisible(false);
      b.body.enable = false;
      b.body.setAllowGravity(false);
      this.bulletObjects.push(b);
    }

    // --- Enemy pool (30 enemies, type-driven) ---
    this.enemies = [];
    for (let i = 0; i < 30; i++) {
      const e = this.add.rectangle(-200, -200, 18, 18, 0xffffff);
      this.physics.add.existing(e);
      e.setActive(false).setVisible(false);
      e.body.enable = false;
      e.body.setAllowGravity(false);
      e.type = null;
      e.waveAngle = 0;
      e.fireTimer = 0;
      e.pointValue = 0;
      this.enemies.push(e);
    }

    // --- Enemy bullet pool ---
    this.enemyBullets = [];
    for (let i = 0; i < 20; i++) {
      const b = this.add.rectangle(-200, -200, 4, 12, 0xffff00);
      this.physics.add.existing(b);
      b.setActive(false).setVisible(false);
      b.body.enable = false;
      b.body.setAllowGravity(false);
      this.enemyBullets.push(b);
    }

    // --- Power-up pool ---
    this.powerUps = [];
    for (let i = 0; i < 10; i++) {
      const pu = this.add.rectangle(-200, -200, 20, 12, 0xffffff);
      this.physics.add.existing(pu);
      pu.setActive(false).setVisible(false);
      pu.body.enable = false;
      pu.type = null;
      this.powerUps.push(pu);
    }

    // --- Shield (one-hit barrier — sits above the paddle) ---
    const shieldY = H - 42;
    this.shieldRect = this.add.rectangle(W / 2, shieldY, W, 6, 0x44ffff);
    this.physics.add.existing(this.shieldRect);
    this.shieldRect.body.setImmovable(true);
    this.shieldRect.body.setAllowGravity(false);
    this.shieldRect.setVisible(false);
    this.shieldRect.body.enable = false;

    this.shieldGfx = this.add.graphics();
    this.shieldGfx.setDepth(5); // above bricks (depth 1), below paddle (depth 10)
    this.shieldGfx.setVisible(false);

    // --- Text ---
    const fontBold = 'Bungee Shade';
    this.scoreText = this.add.text(10, 10, 'Score: ' + this.score, {
      font: '20px ' + fontBold, fill: '#ffffff'
    });
    this.highScoreText = this.add.text(10, 36, 'Best: ' + this.highScore, {
      font: '14px ' + fontBold, fill: '#aaddff'
    });
    this.livesText = this.add.text(W - 10, 10, 'Lives: ' + this.lives, {
      font: '20px ' + fontBold, fill: '#ffffff'
    }).setOrigin(1, 0);
    this.levelText = this.add.text(W / 2, 10, 'Level: 1', {
      font: '20px ' + fontBold, fill: '#ffffff'
    }).setOrigin(0.5, 0);
    this.pauseText = this.add.text(centerX, centerY, 'Paused', {
      font: '30px ' + fontBold, fill: '#ffffff', align: 'center'
    }).setOrigin(0.5, 0.5).setVisible(false);
    this.comboText = this.add.text(W / 2, H / 2, '', {
      font: '56px Bungee Shade', fill: '#ffff00'
    }).setOrigin(0.5, 0.5).setAlpha(0).setDepth(20);

    // --- Keyboard ---
    this.cursors = this.input.keyboard.createCursorKeys();
    this.fireKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.restartKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.R);
    this.musicKey  = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.M);

    // Prevent browser scroll on game keys
    this.input.keyboard.addCapture([
      Phaser.Input.Keyboard.KeyCodes.SPACE,
      Phaser.Input.Keyboard.KeyCodes.UP,
      Phaser.Input.Keyboard.KeyCodes.DOWN,
      Phaser.Input.Keyboard.KeyCodes.LEFT,
      Phaser.Input.Keyboard.KeyCodes.RIGHT,
    ]);

    this.cursors.down.on('down', this.pauseToggle, this);
    this.restartKey.on('down', this.restartGame, this);
    this.musicKey.on('down', this.toggleMusic, this);

    // --- Music + SFX (all audio off by default) ---
    this.sound.mute = true;           // global mute covers music + all future SFX
    this.musicOn = false;
    if (this.cache.audio.exists('music')) {
      this.music = this.sound.add('music', { loop: true, volume: 0.5 });
      // Don't play yet — wait for first M keypress (user gesture unlocks AudioContext)
    } else {
      this.music = null;
    }
    this.musicText = this.add.text(W - 10, 36, 'M: OFF', {
      font: '12px Bungee', fill: '#557799'
    }).setOrigin(1, 0);

    // --- Colliders (registered once, persist across frames) ---
    this.physics.add.collider(this.paddle, this.balls, this.paddleHit, null, this);
    this.physics.add.collider(this.balls, this.brickObjects, this.hit, null, this);
    this.physics.add.overlap(this.brickObjects, this.paddle, this.brickVsPaddle, null, this);
    this.physics.add.overlap(this.bulletObjects, this.brickObjects, this.explodeBrick, null, this);
    this.physics.add.overlap(this.powerUps, this.paddle, this.collectPowerUp, null, this);
    // Player bullets kill enemies
    this.physics.add.overlap(this.bulletObjects, this.enemies, this.shootEnemy, null, this);
    // Enemy bullets shrink paddle
    this.physics.add.overlap(this.enemyBullets, this.paddle, this.enemyBulletHit, null, this);
    // Enemy body hitting paddle: destroy enemy + shrink paddle
    this.physics.add.overlap(this.enemies, this.paddle, this.enemyHitsPaddle, null, this);

    // Shield colliders — only fire when shieldRect.body.enable = true
    this.physics.add.overlap(this.balls, this.shieldRect, this.shieldHitByBall, null, this);
    this.physics.add.overlap(this.enemyBullets, this.shieldRect, this.shieldHitByBullet, null, this);
    this.physics.add.overlap(this.balls, this.bossBrick, this.hitBoss, null, this);
    this.physics.add.overlap(this.bulletObjects, this.bossBrick, this.shootBoss, null, this);

    // --- Camera flash on start ---
    this.cameras.main.flash(2000, 255, 255, 255);

    this.activateBall(this.balls[0], centerX, this.paddle.y - 40, true);
  }

  initBricks(centerX) {
    const startX = centerX - (COLS * (BOX_W + 4)) / 2 + BOX_W / 2;
    this._gridStartX = startX;
    this._gridStartY = 130;
    for (let col = 0; col < COLS; col++) {
      for (let row = 0; row < ROWS; row++) {
        const x = startX + col * (BOX_W + 4);
        const y = 130 + row * (BOX_H + 10);
        const brick = this.add.rectangle(x, y, BOX_W, BOX_H, 0xffffff);
        this.physics.add.existing(brick);
        brick.body.setImmovable(true);
        brick.body.setAllowGravity(false);
        brick.setActive(false).setVisible(false);
        brick.body.enable = false;
        brick.initX = x;
        brick.initY = y;
        brick.isFalling = false;
        this.brickObjects.push(brick);
      }
    }
  }

  resetBricks() {
    this.playTone('level-up');
    this.level += 1;
    this.levelText.text = 'Level: ' + this.level;
    this.ballSpeed = Math.min(this.ballSpeed + 20, 500);
    this.applyPattern(this.level);
    this.setBackground(this.level);
    this.enemies.forEach(e => {
      if (e.active) { e.setActive(false).setVisible(false); e.body.enable = false; }
    });
    this.enemyBullets.forEach(b => {
      if (b.active) { b.setActive(false).setVisible(false); b.body.enable = false; }
    });
    if (this.level >= 3) {
      this.spawnEnemies(this.level);
    }
  }

  setBackground(level) {
    const [from, to] = BG_GRADIENTS[(level - 1) % BG_GRADIENTS.length];
    document.body.style.background = `linear-gradient(to top left, ${from}, ${to})`;
  }

  applyPattern(level) {
    const patternIndex = level <= 1 ? 0 : ((level - 2) % (PATTERNS.length - 1)) + 1;
    const pattern = PATTERNS[patternIndex];
    const color = PATTERN_COLORS[(level - 1) % PATTERN_COLORS.length];

    // Seeded RNG for HP — use actual level number
    const rng = level >= 2 ? this.mulberry32(level) : null;

    for (let col = 0; col < COLS; col++) {
      for (let row = 0; row < ROWS; row++) {
        const idx = col * ROWS + row;
        const brick = this.brickObjects[idx];
        const active = pattern[row][col] === '1';

        // Always clear stale crack graphics
        if (this.brickCrackGfx && this.brickCrackGfx[idx]) {
          this.brickCrackGfx[idx].clear();
        }

        brick.isFalling = false;
        if (active) {
          brick.setFillStyle(color);
          brick.setActive(true).setVisible(true);
          brick.body.reset(brick.initX, brick.initY);
          brick.body.enable = true;
          brick.body.setImmovable(true);
          brick.body.setAllowGravity(false);
          brick.body.setVelocity(0, 0);

          // Assign HP
          let hp = 1;
          if (level >= 2 && rng) {
            const r = rng();
            if (level === 2) {
              hp = r < 0.8 ? 1 : 2;
            } else if (level === 3) {
              hp = r < 0.6 ? 1 : r < 0.9 ? 2 : 3;
            } else {
              hp = r < 0.4 ? 1 : r < 0.8 ? 2 : 3;
            }
          }
          brick.hp = hp;
          brick.maxHp = hp;
          brick.isExplosive = false;
          // Assign explosive flag from level 2+ using RNG
          if (level >= 2 && rng) {
            // Call rng() for explosive AFTER hp rng() call — reuse same seeded sequence
            brick.isExplosive = rng() < 0.15;
          }
          if (brick.isExplosive) {
            brick.setFillStyle(0xff6600); // orange-red, overrides pattern color
            this.drawExplosiveMarker(brick);
          }
        } else {
          brick.setActive(false).setVisible(false);
          brick.body.enable = false;
          brick.hp = 0;
          brick.maxHp = 0;
          brick.isExplosive = false;
        }
      }
    }

    // Boss: from level 2+, clear the 6 bricks in boss footprint and activate boss
    if (level >= 2) {
      [3, 4, 5].forEach(c => [2, 3].forEach(r => {
        const idx = c * ROWS + r;
        const brick = this.brickObjects[idx];
        if (brick) {
          brick.setActive(false).setVisible(false);
          brick.body.enable = false;
          brick.hp = 0;
          brick.isExplosive = false;
          if (this.brickCrackGfx && this.brickCrackGfx[idx]) this.brickCrackGfx[idx].clear();
        }
      }));
      this.activateBoss(level);
    }
  }

  update(time, delta) {
    const H = this.scale.height;

    // Redraw rounded paddle visual
    const pw = this.paddle.width * this.paddle.scaleX;
    const ph = this.paddle.height * this.paddle.scaleY;
    this.paddleGfx.clear();
    this.paddleGfx.fillStyle(0xffffff);
    this.paddleGfx.fillRoundedRect(
      this.paddle.x - pw / 2,
      this.paddle.y - ph / 2,
      pw, ph, 8
    );

    // Keep startPos balls aligned with paddle
    this.balls.forEach(ball => {
      if (ball.active && ball.startPos) ball.setX(this.paddle.x);
    });

    // Release ball on UP
    if (Phaser.Input.Keyboard.JustDown(this.cursors.up) && this.balls.some(b => b.active && b.startPos)) {
      this.releaseBall();
    }

    // Paddle movement
    if (this.cursors.left.isDown) {
      this.paddle.body.setVelocityX(-this.paddleSpeed);
    } else if (this.cursors.right.isDown) {
      this.paddle.body.setVelocityX(this.paddleSpeed);
    } else {
      this.paddle.body.setVelocityX(0);
    }

    // Fire bullets
    if (this.fireKey.isDown) {
      this.fireBullet();
    }

    if (!this.physics.world.isPaused) {
      this.updateEnemies(delta);
    }

    // Kill bullets that exit the top
    this.bulletObjects.forEach(b => {
      if (b.active && b.y < -20) {
        b.setActive(false).setVisible(false);
        b.body.enable = false;
      }
    });

    // Kill bricks that fall off screen
    this.brickObjects.forEach(brick => {
      if (brick.active && brick.y > H + 50) {
        const idx = this.brickObjects.indexOf(brick);
        if (this.brickCrackGfx && this.brickCrackGfx[idx]) {
          this.brickCrackGfx[idx].clear();
        }
        brick.setActive(false).setVisible(false);
        brick.body.enable = false;
      }
    });

    // Deactivate enemies that exit bottom of screen
    this.enemies.forEach(e => {
      if (e.active && e.y > H + 30) {
        e.setActive(false).setVisible(false);
        e.body.enable = false;
      }
    });

    // Deactivate enemy bullets that exit bottom of screen
    this.enemyBullets.forEach(b => {
      if (b.active && b.y > H + 20) {
        b.setActive(false).setVisible(false);
        b.body.enable = false;
      }
    });

    // Kill power-ups that fall off screen
    this.powerUps.forEach(pu => {
      if (pu.active && pu.y > H + 20) {
        pu.setActive(false).setVisible(false);
        pu.body.enable = false;
      }
    });

    if (this.bossActive) {
      this.bossFireTimer -= delta;
      if (this.bossFireTimer <= 0) {
        this.fireBossBullet();
        this.bossFireTimer = Phaser.Math.Between(3000, 4000);
      }
    }

    // Level clear — reset all bricks (check BEFORE life-loss so they can't both fire)
    const activeBricks = this.brickObjects.filter(b => b.active).length;
    if (activeBricks === 0 && !this.bossActive) {
      this.resetBricks();
      return;
    }

    // Detect missed balls
    this.balls.forEach(ball => {
      if (ball.active && ball.y > this.paddle.y + 40) {
        ball.setActive(false).setVisible(false);
        ball.body.enable = false;
      }
    });

    // All balls gone → lose life
    if (!this.balls.some(b => b.active)) {
      this.loseLife();
    }
  }

  releaseBall() {
    const xOffsets = [-75, 75, -150]; // spread angles for up to 3 stuck balls
    let i = 0;
    this.balls.forEach(ball => {
      if (ball.active && ball.startPos) {
        ball.startPos = false;
        const vx = xOffsets[i] !== undefined ? xOffsets[i] : -75;
        ball.body.setVelocity(vx, -this.ballSpeed);
        i++;
      }
    });
  }

  fireBullet() {
    const now = this.time.now;
    if (now - this.lastFired < this.fireRate) return;
    this.lastFired = now;

    const bullet = this.bulletObjects.find(b => !b.active);
    if (bullet) {
      bullet.setPosition(this.paddle.x, this.paddle.y - 20);
      bullet.setActive(true).setVisible(true);
      bullet.body.enable = true;
      bullet.body.reset(this.paddle.x, this.paddle.y - 20);
      bullet.body.setVelocityY(-this.bulletSpeed);
    }
  }

  spawnPowerUp(x, y) {
    const types = ['wide', 'fast', 'multi', 'laser', 'life', 'shield', 'bigball', 'timeslow'];
    const pu = this.powerUps.find(p => !p.active);
    if (!pu) return;
    pu.type = Phaser.Utils.Array.GetRandom(types);
    pu.setFillStyle(POWERUP_COLORS[pu.type]);
    pu.setActive(true).setVisible(true);
    pu.body.enable = true;
    pu.body.reset(x, y);
    pu.body.setVelocityY(150);
  }

  collectPowerUp(powerUp, paddle) {
    this.playTone('powerup');
    powerUp.setActive(false).setVisible(false);
    powerUp.body.enable = false;

    switch (powerUp.type) {
      case 'wide': {
        const newW = Math.min(this.paddle.width * 1.5, this.scale.width / 2);
        this.paddle.setSize(newW, 15);
        this.paddle.body.setSize(newW, 15);
        this.paddle.body.setOffset(0, 0);
        break;
      }
      case 'fast':
        this.paddleSpeed = 800;
        break;
      case 'multi':
        this.activateMultiBall();
        break;
      case 'laser':
        this.fireRate = 50;
        break;
      case 'life':
        this.lives = Math.min(this.lives + 1, 5);
        this.livesText.text = 'Lives: ' + this.lives;
        break;
      case 'shield':
        this.shieldActive = true;
        this.shieldRect.body.enable = true;
        this.shieldGfx.setVisible(true);
        this.drawShield();
        break;
      case 'bigball':
        this.activateBigBall();
        break;
      case 'timeslow':
        this.activateTimeSlow();
        break;
    }

    // Paddle pulse — cosmetic feedback on any power-up collect
    this.tweens.killTweensOf(this.paddle);
    this.tweens.add({
      targets: this.paddle,
      scaleX: 1.15, scaleY: 1.15,
      duration: 80,
      ease: 'Quad.easeOut',
      onComplete: () => {
        this.tweens.add({
          targets: this.paddle,
          scaleX: 1.0, scaleY: 1.0,
          duration: 120,
          ease: 'Quad.easeIn'
        });
      }
    });
  }

  activateMultiBall() {
    const activeBalls = this.balls.filter(b => b.active && !b.startPos);
    const inactiveBalls = this.balls.filter(b => !b.active);
    activeBalls.forEach(ball => {
      const extra = inactiveBalls.shift();
      if (extra) {
        extra.setActive(true).setVisible(true);
        extra.body.enable = true;
        extra.body.reset(ball.x, ball.y);
        extra.startPos = false;
        extra.body.setVelocity(-ball.body.velocity.x, ball.body.velocity.y);
        // Apply current ball size
        const r = this.ballSizeActive ? BALL_RADIUS * 2 : BALL_RADIUS;
        extra.setRadius(r);
        extra.body.setCircle(r);
      }
    });
  }

  hit(ball, brick) {
    if (brick.isFalling) return; // ball can still bounce off mid-air bricks but they're already counted
    this.cameras.main.shake(150, 0.006);
    this.playTone('hit-brick');

    // Combo increment
    this.combo += 1;
    const newMult = Math.min(Math.floor(this.combo / 2) + 1, 5);
    if (newMult > this.comboMultiplier) {
      this.showComboText('x' + newMult);
    }
    this.comboMultiplier = newMult;

    // HP system
    brick.hp -= 1;
    if (brick.hp <= 0) {
      // Clear cracks before brick falls
      const idx = this.brickObjects.indexOf(brick);
      if (this.brickCrackGfx && this.brickCrackGfx[idx]) {
        this.brickCrackGfx[idx].clear();
      }
      brick.isFalling = true;
      brick.body.setImmovable(false);
      brick.body.setAllowGravity(true);
      if (brick.isExplosive) this.triggerExplosion(brick);
    } else {
      // Damage visual: darken color + draw cracks
      const c = Phaser.Display.Color.IntegerToColor(brick.fillColor).darken(25);
      brick.setFillStyle(c.color);
      this.drawBrickCracks(brick);
    }
  }

  shrinkPaddle(paddle) {
    const minW = 80;
    if (paddle.width <= minW) {
      return true; // already at minimum — caller should trigger loseLife()
    }
    const newW = Math.max(paddle.width * 0.85, minW);
    paddle.setSize(newW, 15);
    paddle.body.setSize(newW, 15);
    paddle.body.setOffset(0, 0);
    return false;
  }

  loseLife() {
    if (this._losingLife) return;
    this._losingLife = true;
    this.playTone('life-lost');
    this.combo = 0;
    this.comboMultiplier = 1;
    this.lives -= 1;
    this.livesText.text = 'Lives: ' + this.lives;
    this.resetPowerUps();
    this.enemyBullets.forEach(b => {
      if (b.active) { b.setActive(false).setVisible(false); b.body.enable = false; }
    });
    this.balls.forEach(b => {
      b.setActive(false).setVisible(false);
      b.body.enable = false;
    });
    if (this.lives < 1) {
      this.restartGame();
      return;
    }
    this._losingLife = false;
    this.cameras.main.flash(500, 255, 0, 0, true);
    this.activateBall(this.balls[0], this.paddle.x, this.paddle.y - 40, true);
  }

  brickVsPaddle(brick, paddle) {
    if (!brick.isFalling) return;
    const idx = this.brickObjects.indexOf(brick);
    if (this.brickCrackGfx && this.brickCrackGfx[idx]) {
      this.brickCrackGfx[idx].clear();
    }
    brick.setActive(false).setVisible(false);
    brick.body.enable = false;
    if (this.shrinkPaddle(paddle)) this.loseLife();
  }

  explodeBrick(bullet, brick) {
    // Only explode bricks that are actively falling
    if (!brick.isFalling) return;
    this.playTone('explode');

    // Kill bullet
    bullet.setActive(false).setVisible(false);
    bullet.body.enable = false;

    // Score
    this.score += 100 * this.comboMultiplier;
    this.scoreText.text = 'Score: ' + this.score;

    // Camera shake
    this.cameras.main.shake(300, 0.012);

    // Shrapnel burst in a circle
    const amount = 12;
    const step = (Math.PI * 2) / amount;
    for (let i = 0; i < amount; i++) {
      const shrapnel = this.shrapnelPool.find(s => !s.active);
      if (shrapnel) {
        shrapnel.setAlpha(1);
        shrapnel.setFillStyle(brick.fillColor); // NEW — color match
        shrapnel.setActive(true).setVisible(true);
        shrapnel.body.enable = true;
        shrapnel.body.reset(brick.x, brick.y);
        const angle = i * step;
        shrapnel.body.setVelocity(
          Math.cos(angle) * 200,
          Math.sin(angle) * 200
        );
        this.tweens.add({
          targets: shrapnel,
          alpha: 0,
          duration: 1000,
          onComplete: () => {
            shrapnel.setActive(false).setVisible(false);
            shrapnel.body.enable = false;
          }
        });
      }
    }

    // Kill brick first
    brick.setActive(false).setVisible(false);
    brick.body.enable = false;
    const idx = this.brickObjects.indexOf(brick);
    if (this.brickCrackGfx && this.brickCrackGfx[idx]) {
      this.brickCrackGfx[idx].clear();
    }
    if (brick.isExplosive) this.triggerExplosion(brick);

    // Power-up drop — 33% chance
    if (Math.random() < 0.33) {
      this.spawnPowerUp(brick.x, brick.y);
    }
  }

  paddleHit(paddle, ball) {
    if (ball.startPos) return; // already stuck — don't re-trigger sound/combo every frame
    this.playTone('hit-paddle');

    // Reset combo on paddle contact
    if (this.combo > 0) {
      this.combo = 0;
      this.comboMultiplier = 1;
    }

    // Angle calc — sets X only; physics engine handles Y reversal via setBounce(1)
    const diff = ball.x - paddle.x;
    if (Math.abs(diff) < 5) {
      ball.body.setVelocityX(2 + Math.random() * 8);
    } else {
      ball.body.setVelocityX(5 * diff);
    }
  }

  toggleMusic() {
    this.musicOn = !this.musicOn;
    this.sound.mute = !this.musicOn;
    if (this.musicOn) {
      // First M press acts as the user gesture that unlocks the AudioContext
      if (this.music && !this.music.isPlaying) this.music.play();
      this.musicText.setText('M: ON ').setStyle({ fill: '#aaddff' });
    } else {
      this.musicText.setText('M: OFF').setStyle({ fill: '#557799' });
    }
  }

  playTone(name) {
    if (this.sound.mute) return;
    const ctx = this.sound.context;
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      ctx.resume().then(() => this.playTone(name));
      return;
    }

    // level-up: 3-note fanfare C5→E5→G5
    if (name === 'level-up') {
      [523, 659, 784].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.value = freq;
        const t = ctx.currentTime + i * 0.1;
        gain.gain.setValueAtTime(0.4, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
        osc.start(t);
        osc.stop(t + 0.12);
      });
      return;
    }

    const s = SOUNDS[name];
    if (!s) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = s.type;
    osc.frequency.setValueAtTime(s.freq, ctx.currentTime);
    if (s.freqEnd !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(s.freqEnd, ctx.currentTime + s.dur);
    }
    gain.gain.setValueAtTime(s.vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + s.dur);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + s.dur + 0.01);
  }

  pauseToggle() {
    if (this.physics.world.isPaused) {
      this.physics.world.resume();
    } else {
      this.physics.world.pause();
    }
    this.pauseText.setVisible(this.physics.world.isPaused);
  }

  checkHighScore() {
    if (this.score > this.highScore) {
      this.highScore = this.score;
      localStorage.setItem('breakout_highscore', this.highScore);
      this.highScoreText.text = 'Best: ' + this.highScore;
    }
  }

  showComboText(label) {
    const W = this.scale.width;
    const H = this.scale.height;
    this.comboText.setText(label);
    this.comboText.setPosition(W / 2, H / 2);
    this.comboText.setAlpha(1);
    this.tweens.killTweensOf(this.comboText);
    this.tweens.add({
      targets: this.comboText,
      alpha: 0,
      delay: 500,
      duration: 300,
    });
  }

  mulberry32(seed) {
    return function() {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  drawBrickCracks(brick) {
    const idx = this.brickObjects.indexOf(brick);
    if (idx < 0) return;
    const gfx = this.brickCrackGfx[idx];
    if (!gfx) return;
    const hitsAbsorbed = brick.maxHp - brick.hp;
    gfx.clear();
    gfx.lineStyle(2, 0x000000, 0.55);
    if (hitsAbsorbed >= 1) {
      gfx.beginPath();
      gfx.moveTo(brick.x - BOX_W / 2 + 4, brick.y - BOX_H / 2 + 4);
      gfx.lineTo(brick.x + BOX_W / 2 - 4, brick.y + BOX_H / 2 - 4);
      gfx.strokePath();
    }
    if (hitsAbsorbed >= 2) {
      gfx.beginPath();
      gfx.moveTo(brick.x + BOX_W / 2 - 4, brick.y - BOX_H / 2 + 4);
      gfx.lineTo(brick.x - BOX_W / 2 + 4, brick.y + BOX_H / 2 - 4);
      gfx.strokePath();
    }
  }

  drawExplosiveMarker(brick) {
    const idx = this.brickObjects.indexOf(brick);
    if (idx < 0) return;
    const gfx = this.brickCrackGfx[idx];
    if (!gfx) return;
    gfx.clear();
    gfx.lineStyle(2, 0x000000, 0.7);
    gfx.beginPath();
    gfx.moveTo(brick.x - BOX_W / 2 + 6, brick.y - BOX_H / 2 + 4);
    gfx.lineTo(brick.x + BOX_W / 2 - 6, brick.y + BOX_H / 2 - 4);
    gfx.strokePath();
    gfx.beginPath();
    gfx.moveTo(brick.x + BOX_W / 2 - 6, brick.y - BOX_H / 2 + 4);
    gfx.lineTo(brick.x - BOX_W / 2 + 6, brick.y + BOX_H / 2 - 4);
    gfx.strokePath();
  }

  triggerExplosion(brick) {
    const col = Math.round((brick.initX - this._gridStartX) / (BOX_W + 4));
    const row = Math.round((brick.initY - this._gridStartY) / (BOX_H + 10));
    const neighbors = [
      [col - 1, row], [col + 1, row], [col, row - 1], [col, row + 1]
    ];
    neighbors.forEach(([nc, nr]) => {
      if (nc < 0 || nc >= COLS || nr < 0 || nr >= ROWS) return;
      const idx = nc * ROWS + nr;
      const neighbor = this.brickObjects[idx];
      if (!neighbor || !neighbor.active || neighbor.isFalling) return;
      neighbor.hp -= 1;
      if (neighbor.hp <= 0) {
        const nidx = this.brickObjects.indexOf(neighbor);
        if (this.brickCrackGfx[nidx]) this.brickCrackGfx[nidx].clear();
        neighbor.isFalling = true; // set BEFORE recursive call — prevents re-entry on same brick
        neighbor.body.setImmovable(false);
        neighbor.body.setAllowGravity(true);
        if (neighbor.isExplosive) this.triggerExplosion(neighbor); // chain
      } else {
        const c = Phaser.Display.Color.IntegerToColor(neighbor.fillColor).darken(25);
        neighbor.setFillStyle(c.color);
        this.drawBrickCracks(neighbor);
      }
    });
  }

  restartGame() {
    // Capture high score BEFORE checkHighScore updates it — GameOverScene uses this to detect new best
    const prevBest = parseInt(localStorage.getItem('breakout_highscore') || 0);
    this.checkHighScore();
    this.scene.start('GameOverScene', {
      score: this.score,
      level: this.level,
      highScore: prevBest
    });
  }

  shootEnemy(bullet, enemy) {
    this.playTone('enemy-die');
    bullet.setActive(false).setVisible(false);
    bullet.body.enable = false;
    enemy.setActive(false).setVisible(false);
    enemy.body.enable = false;
    this.score += enemy.pointValue * this.comboMultiplier;
    this.scoreText.text = 'Score: ' + this.score;
  }

  enemyBulletHit(enemyBullet, paddle) {
    enemyBullet.setActive(false).setVisible(false);
    enemyBullet.body.enable = false;
    if (this.shrinkPaddle(paddle)) this.loseLife();
  }

  enemyHitsPaddle(enemy, paddle) {
    enemy.setActive(false).setVisible(false);
    enemy.body.enable = false;
    if (this.shrinkPaddle(paddle)) this.loseLife();
  }

  activateEnemy(e, type, x, y, color, pointValue) {
    e.type = type;
    e.pointValue = pointValue;
    e.fireTimer = Phaser.Math.Between(2000, 5000);
    e.setFillStyle(color);
    e.setActive(true).setVisible(true);
    e.body.enable = true;
    e.body.reset(x, y);
    e.body.setAllowGravity(false);
    if (type === 'diver') {
      e.body.setVelocityY(120);
    } else if (type === 'wander') {
      e.waveAngle = Math.random() * Math.PI * 2;
    }
  }

  spawnEnemies(level) {
    this.formationDir = 1;
    const W = this.scale.width;

    // Determine counts per type
    let diverCount = 0, wanderCount = 0, formationCount = 0;
    if (level === 3) {
      diverCount = 4;
    } else if (level === 4) {
      diverCount = 3; wanderCount = 3;
    } else {
      diverCount = 2; wanderCount = 2; formationCount = 5;
    }

    const pool = this.enemies.filter(e => !e.active);
    let idx = 0;

    // Dive-bombers
    for (let i = 0; i < diverCount; i++) {
      if (!pool[idx]) break;
      const x = diverCount === 1 ? W / 2 : 80 + ((W - 160) / (diverCount - 1)) * i;
      this.activateEnemy(pool[idx++], 'diver', x, -30, 0xff6600, 50);
    }

    // Wanderers
    for (let i = 0; i < wanderCount; i++) {
      if (!pool[idx]) break;
      const x = wanderCount === 1 ? W / 2 : 80 + ((W - 160) / (wanderCount - 1)) * i;
      this.activateEnemy(pool[idx++], 'wander', x, -60, 0xaa00ff, 75);
    }

    // Formation movers
    const formStart = W * 0.2;
    const formEnd = W * 0.8;
    for (let i = 0; i < formationCount; i++) {
      if (!pool[idx]) break;
      const x = formationCount === 1 ? W / 2 : formStart + ((formEnd - formStart) / (formationCount - 1)) * i;
      this.activateEnemy(pool[idx++], 'formation', x, 40, 0xff0044, 100);
    }
  }

  updateEnemies(delta) {
    const W = this.scale.width;

    this.enemies.forEach(e => {
      if (!e.active) return;

      if (e.type === 'wander') {
        e.waveAngle += delta * 0.003;
        e.body.setVelocity(
          Math.sin(e.waveAngle) * 150,
          80
        );
      } else if (e.type === 'formation') {
        const speed = 60 + this.level * 5;
        e.body.setVelocityX(this.formationDir * speed);
      }
      // 'diver' velocity is set once on spawn; no per-frame update needed

      // Fire timer
      e.fireTimer -= delta;
      if (e.fireTimer <= 0) {
        this.fireEnemyBullet(e.x, e.y);
        e.fireTimer = Phaser.Math.Between(3000, 6000);
      }
    });

    // Formation edge flip — once per frame, not per enemy
    const anyAtEdge = this.enemies.some(e =>
      e.active && e.type === 'formation' && (e.x < 50 || e.x > W - 50)
    );
    if (anyAtEdge) {
      this.formationDir *= -1;
      this.enemies.forEach(e => {
        if (e.active && e.type === 'formation') {
          const clampedX = Phaser.Math.Clamp(e.x, 60, W - 60);
          e.body.reset(clampedX, e.y + 15);
        }
      });
    }
  }

  fireEnemyBullet(x, y) {
    const b = this.enemyBullets.find(b => !b.active);
    if (!b) return;
    b.setActive(true).setVisible(true);
    b.body.enable = true;
    b.body.reset(x, y);
    b.body.setAllowGravity(false);
    b.body.setVelocityY(400);
  }

  activateBall(ball, x, y, startPos = false) {
    ball.setActive(true).setVisible(true);
    ball.body.enable = true;
    ball.body.reset(x, y);
    ball.startPos = startPos;
    // Apply current ball size (respects bigball power-up)
    const r = this.ballSizeActive ? BALL_RADIUS * 2 : BALL_RADIUS;
    ball.setRadius(r);
    ball.body.setCircle(r);
    if (startPos) {
      ball.body.setVelocity(0, 0);  // held in place; launch handled by releaseBall()
    } else {
      ball.body.setVelocity(-75, -this.ballSpeed);
    }
  }

  drawShield() {
    const W = this.scale.width;
    const H = this.scale.height;
    const sy = H - 42; // matches shieldRect Y
    this.shieldGfx.clear();
    // Glow backing
    this.shieldGfx.fillStyle(0x44ffff, 0.25);
    this.shieldGfx.fillRoundedRect(0, sy - 4, W, 10, 3);
    // Main bar
    this.shieldGfx.fillStyle(0x44ffff, 1.0);
    this.shieldGfx.fillRoundedRect(0, sy - 3, W, 6, 3);
  }

  deactivateShield() {
    this.shieldActive = false;
    this.shieldRect.body.enable = false;
    this.shieldGfx.setVisible(false);
    this.shieldGfx.clear();
  }

  activateBigBall() {
    if (this.ballSizeTimer) this.ballSizeTimer.remove();
    this.ballSizeActive = true;
    this.balls.forEach(ball => {
      if (ball.active) {
        ball.setRadius(BALL_RADIUS * 2);
        ball.body.setCircle(BALL_RADIUS * 2);
      }
    });
    this.ballSizeTimer = this.time.delayedCall(8000, () => this.deactivateBigBall());
  }

  deactivateBigBall() {
    this.ballSizeActive = false;
    this.ballSizeTimer = null;
    this.balls.forEach(ball => {
      if (ball.active) {
        ball.setRadius(BALL_RADIUS);
        ball.body.setCircle(BALL_RADIUS);
      }
    });
  }

  activateTimeSlow() {
    if (this.timeSlowTimer) this.timeSlowTimer.remove();
    this.timeSlowActive = true;
    this.physics.world.timeScale = 0.35;
    this.timeSlowTimer = this.time.delayedCall(5000, () => this.deactivateTimeSlow());
  }

  deactivateTimeSlow() {
    this.timeSlowActive = false;
    this.timeSlowTimer = null;
    this.physics.world.timeScale = 1.0;
  }

  activateBoss(level) {
    this.bossMaxHp = (level - 2) + 5; // level 2 = 5HP, level 3 = 6HP, etc.
    this.bossHp = this.bossMaxHp;
    this.bossActive = true;
    this.bossBrick.setFillStyle(0xffcc00);
    this.bossBrick.setVisible(true);
    this.bossBrick.body.enable = true;
    this.bossFireTimer = 3500;
    this.bossHitCooldown = 0;
    this.drawBossHpBar();
  }

  deactivateBoss(silent = false) {
    this.bossActive = false;
    this.bossBrick.setVisible(false);
    this.bossBrick.body.enable = false;
    this.bossBrickGfx.clear();
    this.bossBrickGfx.setVisible(false);
    if (!silent) {
      this.score += 500 * this.comboMultiplier;
      this.scoreText.text = 'Score: ' + this.score;
    }
  }

  drawBossHpBar() {
    this.bossBrickGfx.setVisible(true);
    this.bossBrickGfx.clear();
    const barY = this.bossY + BOSS_H / 2 + 6;
    // Background
    this.bossBrickGfx.fillStyle(0x333333, 0.8);
    this.bossBrickGfx.fillRect(this.bossX - BOSS_W / 2, barY, BOSS_W, 4);
    // Fill
    this.bossBrickGfx.fillStyle(0x00ff88, 1.0);
    this.bossBrickGfx.fillRect(
      this.bossX - BOSS_W / 2, barY,
      BOSS_W * (this.bossHp / this.bossMaxHp), 4
    );
  }

  hitBoss(ball, bossBrick) {
    if (!this.bossActive) return;
    const now = this.time.now;
    if (now - this.bossHitCooldown < 300) return; // debounce 300ms
    this.bossHitCooldown = now;
    this.cameras.main.shake(150, 0.006);
    this.playTone('hit-brick');
    this.bossHp -= 1;
    if (this.bossHp <= 0) {
      this.deactivateBoss();
    } else {
      const pct = 1 - this.bossHp / this.bossMaxHp;
      const c = Phaser.Display.Color.IntegerToColor(0xffcc00).darken(Math.floor(25 * pct));
      this.bossBrick.setFillStyle(c.color);
      this.drawBossHpBar();
      this.fireBossBullet();
    }
  }

  shootBoss(bullet, bossBrick) {
    if (!this.bossActive) return;
    // Always consume the bullet on contact
    bullet.setActive(false).setVisible(false);
    bullet.body.enable = false;
    // Debounce damage
    const now = this.time.now;
    if (now - this.bossHitCooldown < 300) return; // debounce 300ms
    this.bossHitCooldown = now;
    this.bossHp -= 1;
    this.cameras.main.shake(200, 0.01);
    this.playTone('explode');
    if (this.bossHp <= 0) {
      this.deactivateBoss();
    } else {
      const pct = 1 - this.bossHp / this.bossMaxHp;
      const c = Phaser.Display.Color.IntegerToColor(0xffcc00).darken(Math.floor(25 * pct));
      this.bossBrick.setFillStyle(c.color);
      this.drawBossHpBar();
      this.fireBossBullet();
    }
  }

  fireBossBullet() {
    const bullet = this.enemyBullets.find(b => !b.active);
    if (!bullet) return;
    bullet.setPosition(this.bossX, this.bossY + BOSS_H / 2);
    bullet.setActive(true).setVisible(true);
    bullet.body.enable = true;
    bullet.body.reset(this.bossX, this.bossY + BOSS_H / 2);
    bullet.body.setVelocity(Phaser.Math.Between(-60, 60), 350);
  }

  shieldHitByBall(ball, shieldRect) {
    if (!this.shieldActive) return;
    if (ball.body.velocity.y > 0) {
      ball.body.setVelocityY(-ball.body.velocity.y);
    }
    this.deactivateShield();
    this.playTone('shield-hit');
  }

  shieldHitByBullet(enemyBullet, shieldRect) {
    if (!this.shieldActive) return;
    enemyBullet.setActive(false).setVisible(false);
    enemyBullet.body.enable = false;
    this.deactivateShield();
    this.playTone('shield-hit');
  }

  resetPowerUps() {
    if (this.timeSlowTimer) { this.timeSlowTimer.remove(); this.timeSlowTimer = null; }
    this.timeSlowActive = false;
    this.physics.world.timeScale = 1.0;
    if (this.ballSizeTimer) { this.ballSizeTimer.remove(); this.ballSizeTimer = null; }
    this.ballSizeActive = false;
    this.balls.forEach(ball => {
      ball.setRadius(BALL_RADIUS);
      ball.body.setCircle(BALL_RADIUS);
    });
    if (this.shieldActive) this.deactivateShield();
    this.powerUps.forEach(pu => {
      if (pu.active) {
        pu.setActive(false).setVisible(false);
        pu.body.enable = false;
      }
    });
    this.paddle.setSize(this.paddleBaseWidth, 15);
    this.paddle.body.setSize(this.paddleBaseWidth, 15);
    this.paddle.body.setOffset(0, 0);
    this.paddleSpeed = 500;
    this.fireRate = 200;
    this.balls.slice(1).forEach(b => {
      b.setActive(false).setVisible(false);
      b.body.enable = false;
    });
    if (this.bossActive) this.deactivateBoss(true); // silent — no score on life loss
  }
}

class GameOverScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameOverScene' });
  }

  create() {
    const W = this.scale.width;
    const H = this.scale.height;
    const { score = 0, level = 1, highScore = 0 } = this.scene.settings.data ?? {};
    const isNewBest = score > highScore;

    // Prevent page scroll on DOWN keypress
    this.input.keyboard.addCapture(Phaser.Input.Keyboard.KeyCodes.DOWN);

    this.add.text(W / 2, H * 0.3, 'GAME OVER', {
      font: '64px Bungee Shade', fill: '#ffffff'
    }).setOrigin(0.5, 0);

    this.add.text(W / 2, H * 0.3 + 60, 'Score: ' + score + '  ·  Level ' + level + ' reached', {
      font: '24px Bungee Shade', fill: '#ffffff'
    }).setOrigin(0.5, 0);

    if (isNewBest) {
      this.add.text(W / 2, H * 0.3 + 100, 'NEW BEST!', {
        font: '32px Bungee Shade', fill: '#ffdd00'
      }).setOrigin(0.5, 0);
    }

    this.add.text(W / 2, H * 0.3 + 150, 'PRESS DOWN TO PLAY AGAIN', {
      font: '20px Bungee Shade', fill: '#aaddff'
    }).setOrigin(0.5, 0);

    this.input.keyboard.once('keydown-DOWN', () => this.scene.start('TitleScene'));
    this.time.delayedCall(300, () => {
      this.input.once('pointerdown', () => this.scene.start('TitleScene'));
    });
  }
}

const config = {
  type: Phaser.AUTO,
  width: window.innerWidth,
  height: window.innerHeight,
  transparent: true,
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { y: 300 },
      debug: false
    }
  },
  scene: [TitleScene, MainState, GameOverScene]
};

const game = new Phaser.Game(config);
