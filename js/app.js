var mainState = {
  preload: function() {

    // preload the assets
    var boxWidth = 28
    var boxHeight = 28
    var paddleWidth = window.innerWidth / 3
    var paddleHeight = 15
    var ballWidth = 30
    var ballHeight = 30

    this.score = 0
    this.lives = 3

    // box
    this.box = game.add.bitmapData(boxWidth, boxHeight);
    this.box.ctx.beginPath();
    this.box.ctx.rect(0, 0, boxWidth, boxHeight);
    this.box.ctx.fillStyle = '#ffffff';
    this.box.ctx.fill();

    // paddle
    this.paddle = game.add.bitmapData(paddleWidth, paddleHeight);
    this.paddle.ctx.beginPath();
    this.paddle.ctx.rect(0, 0, paddleWidth, paddleHeight);
    this.paddle.ctx.fillStyle = '#ffffff';
    this.paddle.ctx.fill();

    // ball
    this.ball = game.add.bitmapData(ballWidth, ballHeight);
    this.ball.ctx.beginPath();
    this.ball.ctx.arc(15, 15, 5, 0, Math.PI * 2, true);
    this.ball.ctx.fillStyle = '#ffffff';
    this.ball.ctx.fill();

    // bullet
    this.bullet = game.add.bitmapData(30,30);
    this.bullet.ctx.beginPath();
    this.bullet.ctx.arc(15, 15, 5, 0, Math.PI*2, true);
    this.bullet.ctx.fillStyle = '#ffffff';
    this.bullet.ctx.fill();

    // shrapnel
    this.shrapnel = game.add.bitmapData(30,30);
    this.shrapnel.ctx.beginPath();
    this.shrapnel.ctx.arc(15, 15, 5, 0, Math.PI*2, true);
    this.shrapnel.ctx.fillStyle = '#ffffff';
    this.shrapnel.ctx.fill();

    // sounds
    game.load.audio('hit', 'audio/hit.wav');
    game.load.audio('box', 'audio/box.wav');
    game.load.audio('song', 'audio/aujou.mp3');
  },
  create: function() {
    // Start the Arcade physics system (for movements and collisions)
    game.physics.startSystem(Phaser.Physics.ARCADE);
    game.physics.arcade.checkCollision.down = false;
    game.world.enableBody = true;

    this.sfx = {
      hit: this.game.add.audio('hit'),
      box: this.game.add.audio('box')
    };

    // text
    var fontFamily = 'Bungee Shade'
    this.scoreText = game.add.text(10, 10, 'Score: ' + this.score, { font: "20px " + fontFamily, fill: "#ffffff", align: "left" });
    this.livesText = game.add.text((window.innerWidth - 10), 10, 'Lives: ' + this.lives, { font: "20px " + fontFamily, fill: "#ffffff", align: "right" });
    this.livesText.anchor.set(1,0);
    this.startText = game.add.text(this.world.centerX, this.world.centerY, 'Press "UP" to start & "DOWN" to pause', { font: "30px Bungee", fill: "#ffffff", align: "center" });
    this.pauseText = game.add.text(this.world.centerX, this.world.centerY, 'Paused', { font: "30px " + fontFamily, fill: "#ffffff", align: "center" });
    this.startText.anchor.set(0.5, 0.5);
    this.pauseText.anchor.set(0.5, 0.5);
    this.pauseText.visible = false;
    // this.startText.setShadow(2, 2, "#333333", 20, false, true);

    // Create the left/right arrow keys
    this.left = game.input.keyboard.addKey(Phaser.Keyboard.LEFT);
    this.right = game.input.keyboard.addKey(Phaser.Keyboard.RIGHT);
    this.up = game.input.keyboard.addKey(Phaser.Keyboard.UP);
    this.fire = game.input.keyboard.addKey(Phaser.Keyboard.SPACEBAR);
    this.pause = game.input.keyboard.addKey(Phaser.Keyboard.DOWN);
    this.restart = game.input.keyboard.addKey(Phaser.Keyboard.R);
    this.mute = game.input.keyboard.addKey(Phaser.Keyboard.M);

    // down to pause game
    this.pause.onDown.add(this.pauseToggle, this);

    // r to restart the game
    this.restart.onDown.add(this.restartGame, this);

    // add the paddle at the bottom of the screen
    this.paddle = game.add.sprite(this.world.centerX, (window.innerHeight - 5), this.paddle);
    this.paddle.anchor.set(0.5, 0.5);
    // paddle can't leave the world bounds
    this.paddle.body.collideWorldBounds = true;
    // make sure the paddle won't move when it hits the ball
    this.paddle.body.immovable = true;

    game.camera.follow(this.paddle, Phaser.Camera.FOLLOW_LOCKON, 0.1, 0.1);
    game.camera.flash(0xffffff, 2000);

    this.loadBricks();

    // add the ball
    this.ball = game.add.sprite(this.world.centerX, this.paddle.y -40, this.ball);
    this.ball.startPos = true;
    // give the ball some initial speed
    this.ball.body.velocity.x = 300;
    this.ball.body.tilePadding.x = 0;
    this.ball.body.tilePadding.y = 0;
    this.ball.body.bounce.setTo(1);
    this.ball.body.collideWorldBounds = true;

    // explosion
    this.explosion = game.add.group();
    this.explosion.enableBody = true;
    this.explosion.physicsBodyType = Phaser.Physics.ARCADE;
    this.explosion.createMultiple(100, this.shrapnel);
    this.explosion.callAll('body.setSize', 'body', 10, 10, 10, 10);
    this.explosion.setAll('checkWorldBounds', true);
    this.explosion.setAll('outOfBoundsKill', true);
    this.explosion.setAll('anchor.x', 0.5);
    this.explosion.setAll('anchor.y', 0.5);

    // 30 bullets
    this.weapon = this.game.add.weapon(30, this.bullet);
    // bullet killed when it leaves world bounds
    this.weapon.bulletKillType = Phaser.Weapon.KILL_WORLD_BOUNDS;
    // bullet speed
    this.weapon.bulletSpeed = 900;
    // rate of fire
    this.weapon.fireRate = 200;
    // track the paddle
    this.weapon.trackSprite(this.paddle, 0, 0, false);

    this.music = this.game.add.audio('song', 0.5, true);
    // this.music.play();
  },
  update: function() {
    if (this.ball.startPos && this.up.isDown) {
      this.releaseBall();
    }

    // move with pointer
    // this.paddle.body.x = game.input.activePointer.x;
    // or
    // Move the paddle left/right when an arrow key is pressed
    if (this.left.isDown) this.paddle.body.velocity.x = -500;
    else if (this.right.isDown) this.paddle.body.velocity.x = 500;
    // Stop the paddle when no key is pressed
    else this.paddle.body.velocity.x = 0;

    if (this.fire.isDown) {
      this.weapon.fire();
      // TODO: find good short sound for this
      // this.sfx.hit.play();
    }

    // all collisions
    // collisions between the paddle and the ball
    game.physics.arcade.collide(this.paddle, this.ball, this.paddleHit, null, this);
    // when the ball hits a brick
    game.physics.arcade.collide(this.ball, this.bricks, this.hit, null, this);
    // we die if brick hits us
    game.physics.arcade.overlap(this.bricks, this.paddle, this.brickVsPaddle, null, this);
    // block explodes if we shoot it while it's falling
    game.physics.arcade.overlap(this.weapon.bullets, this.bricks, this.explodeBrick, null, this);

    // ball is below the paddle!
    if (this.ball.y > this.paddle.y) {

      // get your consequence
      // reduce lives?
      this.lives -= 1;
      this.livesText.text = 'Lives: ' + this.lives;

      // reset the ball position
      this.resetBall();
    }

    // we out of bricks? reset for now.
    // TODO: load next level?
    if (!this.bricks.countLiving()) {
      this.loadBricks();
    }

    // TODO: game over if we are out of lives
    if (this.lives < 1) {
      this.restartGame();
    }
  },
  pauseToggle: function() {
    game.physics.arcade.isPaused = (game.physics.arcade.isPaused) ? false : true;
    this.pauseText.visible = game.physics.arcade.isPaused;
    // toggle music TODO
    // this.music.mute();
  },
  releaseBall: function() {
    if (this.ball.startPos === true)
    {
      this.ball.startPos = false;
      this.ball.body.velocity.y = -300;
      this.ball.body.velocity.x = -75;
      this.startText.visible = false;
    }
  },
  resetBall: function() {
    this.ball.startPos = true;
    this.ball.reset(this.world.centerX, this.paddle.y - 40);
    this.ball.body.velocity.x = 300;
  },
  hit: function(ball, brick) {
    // this.sfx.box.play();
    brick.body.gravity.y = 300;
  },
  brickVsPaddle: function(brick, paddle) {
    // TODO: decrease paddle size down by some factor to a lower limit
  },
  explodeBrick: function(bullet, brick) {
    bullet.kill();

    // is this brick falling?
    if (brick.body.gravity.y > 0) {
      // this.sfx.hit.play();

      this.score += 100;
      this.scoreText.text = 'score: ' + this.score;

      // TODO: increase paddle size up by some factor to a max

      // shake shake shake
      game.camera.shake(0.005, 200);

      var amount, start, step, i, angle, speed;
      amount = 12;
      start = Math.PI * -1;
      step = Math.PI / amount * 2;
      i = amount;
      while (i > 0) {
        shrapnel = this.explosion.getFirstDead();
        if (shrapnel) {
          shrapnel.reset(brick.body.x, brick.body.y);
          var angle = start + i * step;
          speed = 200;
          shrapnel.body.velocity.x = Math.cos(angle) * speed;
          shrapnel.body.velocity.y = Math.sin(angle) * speed;
          shrapnel.alpha = 1;
          game.add.tween(shrapnel).to( { alpha: 0 }, 1000, Phaser.Easing.Linear.None, true, 0, 1000, true);
        }
        i--;
      }

      // kill it
      brick.kill();
    }
  },
  // ball hits paddle
  paddleHit: function(paddle, ball) {
    // this.sfx.hit.play();
    var diff = 0;

    if (ball.x < paddle.x)
    {
      // left side
      diff = paddle.x - ball.x;
      ball.body.velocity.x = (-5 * (diff/2));
    }
    else if (ball.x > paddle.x)
    {
      // right side
      diff = ball.x -paddle.x;
      ball.body.velocity.x = (5 * (diff/2));
    }
    else
    {
      // middle?
      ball.body.velocity.x = 2 + Math.random() * 8;
    }
  },
  loadBricks:  function() {
    // Create a group that will contain all the bricks
    this.bricks = game.add.group();

    // Add bricks to the group (10 columns and 6 lines)
    for (var i = 0; i < 10; i++) {
      for (var j = 0; j < 6; j++) {
        // Create the brick at the correct position
        var brick = game.add.sprite(55 + i * 60, 55 + j * 35, this.box);

        // Make sure the brick won't move when the ball hits it
        brick.body.immovable = true;

        // auto kill bricks you miss
        brick.autoCull = true;
        brick.outOfCameraBoundsKill = true;

        // Add the brick to the group
        this.bricks.add(brick);
        this.bricks.centerX = this.world.centerX;
        // this.bricks.centerY = ;
      }
    }
  },
  restartGame: function() {
    // this.music.stop();
    game.state.start('main');
  }
};

// Initialize the game and start our state
var game = new Phaser.Game(window.outerWidth, window.outerHeight, Phaser.AUTO);
game.transparent = true;
game.state.add('main', mainState);
game.state.start('main');
