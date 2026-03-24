const BOX_W = 28;
const BOX_H = 28;
const BALL_SIZE = 16;
const COLS = 10;
const ROWS = 6;

const POWERUP_COLORS = {
  wide:  0x00ffff, // cyan
  fast:  0xffff00, // yellow
  multi: 0x00ff00, // green
  laser: 0xff4444, // red
  life:  0xff88cc  // pink
};

class MainState extends Phaser.Scene {
  constructor() {
    super({ key: 'MainState' });
  }

  create() {
    const W = this.scale.width;
    const H = this.scale.height;
    const centerX = W / 2;
    const centerY = H / 2;

    this.score = 0;
    this.lives = 3;
    this.lastFired = 0;
    this.fireRate = 200;
    this.bulletSpeed = 900;
    this.level = 1;
    this.ballSpeed = 300;
    this.formationDir = 1;
    this.paddleBaseWidth = W / 3;
    this.paddleSpeed = 500;

    // --- Paddle ---
    this.paddle = this.add.rectangle(centerX, H - 20, W / 3, 15, 0xffffff);
    this.physics.add.existing(this.paddle);
    this.paddle.body.setImmovable(true);
    this.paddle.body.setAllowGravity(false);
    this.paddle.body.setCollideWorldBounds(true);

    // --- Ball pool (1 main + 2 extras for multi-ball) ---
    this.balls = [];
    for (let i = 0; i < 3; i++) {
      const b = this.add.rectangle(-200, -200, BALL_SIZE, BALL_SIZE, 0xffffff);
      this.physics.add.existing(b);
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
    this.livesText = this.add.text(W - 10, 10, 'Lives: ' + this.lives, {
      font: '20px ' + fontBold, fill: '#ffffff'
    }).setOrigin(1, 0);
    this.levelText = this.add.text(W / 2, 10, 'Level: 1', {
      font: '20px ' + fontBold, fill: '#ffffff'
    }).setOrigin(0.5, 0);
    this.startText = this.add.text(centerX, centerY,
      'Press UP to start\nSPACE to shoot   DOWN to pause', {
      font: '24px Bungee', fill: '#ffffff', align: 'center'
    }).setOrigin(0.5, 0.5);
    this.pauseText = this.add.text(centerX, centerY, 'Paused', {
      font: '30px ' + fontBold, fill: '#ffffff', align: 'center'
    }).setOrigin(0.5, 0.5).setVisible(false);

    // --- Keyboard ---
    this.cursors = this.input.keyboard.createCursorKeys();
    this.fireKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.restartKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.R);

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
    for (let i = 0; i < COLS; i++) {
      for (let j = 0; j < ROWS; j++) {
        const x = startX + i * (BOX_W + 4);
        const y = 60 + j * (BOX_H + 8);
        const brick = this.add.rectangle(x, y, BOX_W, BOX_H, 0xffffff);
        this.physics.add.existing(brick);
        brick.body.setImmovable(true);
        brick.body.setAllowGravity(false);
        brick.initX = x;
        brick.initY = y;
        brick.isFalling = false;
        this.brickObjects.push(brick);
      }
    }
  }

  resetBricks() {
    this.brickObjects.forEach(brick => {
      brick.setPosition(brick.initX, brick.initY);
      brick.setActive(true).setVisible(true);
      brick.body.reset(brick.initX, brick.initY);
      brick.body.enable = true;
      brick.body.setImmovable(true);
      brick.body.setAllowGravity(false);
      brick.body.setVelocity(0, 0);
      brick.isFalling = false;
    });
    this.level += 1;
    this.levelText.text = 'Level: ' + this.level;
    this.ballSpeed = Math.min(this.ballSpeed + 20, 500);
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

  update(time, delta) {
    const H = this.scale.height;

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
      this.lives -= 1;
      this.livesText.text = 'Lives: ' + this.lives;
      this.resetPowerUps();
      this.enemyBullets.forEach(b => {
        if (b.active) { b.setActive(false).setVisible(false); b.body.enable = false; }
      });
      this.activateBall(this.balls[0], this.paddle.x, this.paddle.y - 40, true);
    }

    // Game over
    if (this.lives < 1) {
      this.restartGame();
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
    brick.isFalling = true;
    brick.body.setImmovable(false);
    brick.body.setAllowGravity(true);
  }

  shrinkPaddle(paddle) {
    const minW = 80;
    const newW = Math.max(paddle.width * 0.85, minW);
    paddle.setSize(newW, 15);
    paddle.body.setSize(newW, 15);
    paddle.body.setOffset(0, 0);
  }

  brickVsPaddle(brick, paddle) {
    if (!brick.isFalling) return;
    this.shrinkPaddle(paddle);
    brick.setActive(false).setVisible(false);
    brick.body.enable = false;
  }

  explodeBrick(bullet, brick) {
    // Only explode bricks that are actively falling
    if (!brick.isFalling) return;

    // Kill bullet
    bullet.setActive(false).setVisible(false);
    bullet.body.enable = false;

    // Score
    this.score += 100;
    this.scoreText.text = 'Score: ' + this.score;

    // Camera shake
    this.cameras.main.shake(200, 0.005);

    // Shrapnel burst in a circle
    const amount = 12;
    const step = (Math.PI * 2) / amount;
    for (let i = 0; i < amount; i++) {
      const shrapnel = this.shrapnelPool.find(s => !s.active);
      if (shrapnel) {
        shrapnel.setAlpha(1);
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

    // Power-up drop — 33% chance
    if (Math.random() < 0.33) {
      this.spawnPowerUp(brick.x, brick.y);
    }
  }

  paddleHit(paddle, ball) {
    const diff = ball.x - paddle.x;
    if (Math.abs(diff) < 5) {
      ball.body.setVelocityX(2 + Math.random() * 8);
    } else {
      ball.body.setVelocityX(5 * diff);
    }
  }

  pauseToggle() {
    if (this.physics.world.isPaused) {
      this.physics.world.resume();
    } else {
      this.physics.world.pause();
    }
    this.pauseText.setVisible(this.physics.world.isPaused);
  }

  restartGame() {
    this.scene.restart();
  }

  shootEnemy(bullet, enemy) {
    bullet.setActive(false).setVisible(false);
    bullet.body.enable = false;
    enemy.setActive(false).setVisible(false);
    enemy.body.enable = false;
    this.score += enemy.pointValue;
    this.scoreText.text = 'Score: ' + this.score;
  }

  enemyBulletHit(enemyBullet, paddle) {
    enemyBullet.setActive(false).setVisible(false);
    enemyBullet.body.enable = false;
    this.shrinkPaddle(paddle);
  }

  enemyHitsPaddle(enemy, paddle) {
    enemy.setActive(false).setVisible(false);
    enemy.body.enable = false;
    this.shrinkPaddle(paddle);
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
