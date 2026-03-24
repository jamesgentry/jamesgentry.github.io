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
  }

  update() {
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

    // Kill power-ups that fall off screen
    this.powerUps.forEach(pu => {
      if (pu.active && pu.y > H + 20) {
        pu.setActive(false).setVisible(false);
        pu.body.enable = false;
      }
    });

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
      this.activateBall(this.balls[0], this.paddle.x, this.paddle.y - 40, true);
    }

    // Level clear — reset all bricks
    const activeBricks = this.brickObjects.filter(b => b.active).length;
    if (activeBricks === 0) {
      this.resetBricks();
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
        ball.body.setVelocity(-75, -300);
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

  brickVsPaddle(brick, paddle) {
    // TODO: decrease paddle size by some factor to a lower limit
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

  activateBall(ball, x, y, startPos = false) {
    ball.setActive(true).setVisible(true);
    ball.body.enable = true;
    ball.body.reset(x, y);
    ball.startPos = startPos;
    if (startPos) {
      ball.body.setVelocity(0, 0);  // held in place; launch handled by releaseBall()
    } else {
      ball.body.setVelocity(-75, -300);
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
