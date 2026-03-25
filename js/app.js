const BOX_W = 46;
const BOX_H = 26;
const BALL_RADIUS = 9;
const COLS = 10;
const ROWS = 6;

const POWERUP_COLORS = {
  wide:  0x00ffff, // cyan
  fast:  0xffff00, // yellow
  multi: 0x00ff00, // green
  laser: 0xff4444, // red
  life:  0xff88cc  // pink
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
    this.startText = this.add.text(centerX, centerY,
      'Press UP to start\nSPACE to shoot   DOWN to pause   M to toggle sound', {
      font: '24px Bungee', fill: '#ffffff', align: 'center'
    }).setOrigin(0.5, 0.5);
    this.pauseText = this.add.text(centerX, centerY, 'Paused', {
      font: '30px ' + fontBold, fill: '#ffffff', align: 'center'
    }).setOrigin(0.5, 0.5).setVisible(false);
    this.comboText = this.add.text(W / 2, H / 2, '', {
      font: '56px Bungee Shade', fill: '#ffff00'
    }).setOrigin(0.5, 0.5).setAlpha(0).setDepth(20);

    // --- Power-up legend (shown on start screen, hidden on launch) ---
    const legendY = centerY + 100;
    const puDefs = [
      { label: 'Wide Paddle', color: '#00ffff' },
      { label: 'Speed Boost', color: '#ffff00' },
      { label: 'Multi-Ball',  color: '#00ff00' },
      { label: 'Laser Burst', color: '#ff4444' },
      { label: 'Extra Life',  color: '#ff88cc' },
    ];
    this.legend = [];
    this.legend.push(this.add.text(centerX, legendY - 24, '— POWER-UPS —', {
      font: '14px Bungee', fill: '#aaaaaa', align: 'center'
    }).setOrigin(0.5, 0));
    const itemW = 120;
    const totalW = puDefs.length * itemW;
    puDefs.forEach((pu, idx) => {
      const x = centerX - totalW / 2 + idx * itemW + itemW / 2;
      this.legend.push(this.add.text(x, legendY, '■', {
        font: '18px Bungee', fill: pu.color
      }).setOrigin(0.5, 0));
      this.legend.push(this.add.text(x, legendY + 22, pu.label, {
        font: '11px Bungee', fill: '#cccccc', align: 'center'
      }).setOrigin(0.5, 0));
    });

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
    this.musicText = this.add.text(W / 2, H - 24, '♪ M: sound off', {
      font: '13px Bungee', fill: '#557799'
    }).setOrigin(0.5, 0);

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

    // --- Camera flash on start ---
    this.cameras.main.flash(2000, 255, 255, 255);

    this.activateBall(this.balls[0], centerX, this.paddle.y - 40, true);
  }

  initBricks(centerX) {
    const startX = centerX - (COLS * (BOX_W + 4)) / 2 + BOX_W / 2;
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
        } else {
          brick.setActive(false).setVisible(false);
          brick.body.enable = false;
          brick.hp = 0;
          brick.maxHp = 0;
        }
      }
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
    if (this.cursors.up.isDown && this.balls.some(b => b.active && b.startPos)) {
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

    // Level clear — reset all bricks (check BEFORE life-loss so they can't both fire)
    const activeBricks = this.brickObjects.filter(b => b.active).length;
    if (activeBricks === 0) {
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
    this.balls.forEach(ball => {
      if (ball.active && ball.startPos) {
        ball.startPos = false;
        ball.body.setVelocity(-75, -this.ballSpeed);
      }
    });
    this.startText.setVisible(false);
    this.legend.forEach(o => o.setVisible(false));
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
    const types = ['wide', 'fast', 'multi', 'laser', 'life'];
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
      }
    });
  }

  hit(ball, brick) {
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
    this.playTone('life-lost');
    this.combo = 0;
    this.comboMultiplier = 1;
    this.lives -= 1;
    this.livesText.text = 'Lives: ' + this.lives;
    this.checkHighScore();
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
    this.checkHighScore();

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

    // Power-up drop — 33% chance
    if (Math.random() < 0.33) {
      this.spawnPowerUp(brick.x, brick.y);
    }
  }

  paddleHit(paddle, ball) {
    this.playTone('hit-paddle');
    if (this.combo > 0) {
      this.combo = 0;
      this.comboMultiplier = 1;
    }
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
      this.musicText.setText('♪ M: sound on').setStyle({ fill: '#aaddff' });
    } else {
      this.musicText.setText('♪ M: sound off').setStyle({ fill: '#557799' });
    }
  }

  playTone(name) {
    if (this.sound.mute) return;
    const ctx = this.sound.context;
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      ctx.resume();
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

  restartGame() {
    this.checkHighScore();
    this.scene.restart();
  }

  shootEnemy(bullet, enemy) {
    this.playTone('enemy-die');
    bullet.setActive(false).setVisible(false);
    bullet.body.enable = false;
    enemy.setActive(false).setVisible(false);
    enemy.body.enable = false;
    this.score += enemy.pointValue * this.comboMultiplier;
    this.scoreText.text = 'Score: ' + this.score;
    this.checkHighScore();
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
    if (startPos) {
      ball.body.setVelocity(0, 0);  // held in place; launch handled by releaseBall()
    } else {
      ball.body.setVelocity(-75, -this.ballSpeed);
    }
  }

  resetPowerUps() {
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
  scene: MainState
};

const game = new Phaser.Game(config);
