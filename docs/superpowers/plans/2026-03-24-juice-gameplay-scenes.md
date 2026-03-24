# Juice, Gameplay Depth 2 & Scene Progression — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add visual polish (screen shake, color particles, rounded paddle, synthesized SFX), gameplay depth (combo multiplier, magnet/shield power-ups, brick HP with crack visuals), and proper Title/GameOver scenes to the Phaser 3.90.0 Breakout game.

**Architecture:** All changes are confined to `js/app.js` (single-file Phaser game). Specs are applied in order C → D → E — each builds on the last. No automated tests exist for this browser game; verification is manual in-browser after each task. Commits happen after each task.

**Tech Stack:** Phaser 3.90.0, plain JavaScript, Web Audio API (`this.sound.context`), `localStorage`.

**Spec document:** `docs/superpowers/specs/2026-03-24-juice-gameplay-scenes-design.md`

---

## Files Changed

- **Modify:** `js/app.js` — all changes (all 7 tasks)

No new files are created. The three Phaser scenes (`TitleScene`, `MainState`, `GameOverScene`) all live in `js/app.js`.

---

## Task 1: Spec C — Visual Polish (screen shake, color particles, paddle pulse, rounded paddle)

**Files:** `js/app.js`

Four changes in this task, all cosmetic/feel. No new state needed except `this.paddleGfx`.

### Step 1.1 — Enhance camera shake in `hit()`

In `hit(ball, brick)` (currently 5 lines), add a camera shake at the top of the method:

```js
hit(ball, brick) {
  this.cameras.main.shake(150, 0.006); // NEW
  brick.isFalling = true;
  brick.body.setImmovable(false);
  brick.body.setAllowGravity(true);
}
```

### Step 1.2 — Enhance camera shake + color particles in `explodeBrick()`

In `explodeBrick(bullet, brick)`:

1. Change the existing `this.cameras.main.shake(200, 0.005)` to `this.cameras.main.shake(300, 0.012)`.
2. Inside the shrapnel loop, after `shrapnel.setAlpha(1)`, add: `shrapnel.setFillStyle(brick.fillColor);`

The shrapnel loop section should look like:
```js
for (let i = 0; i < amount; i++) {
  const shrapnel = this.shrapnelPool.find(s => !s.active);
  if (shrapnel) {
    shrapnel.setAlpha(1);
    shrapnel.setFillStyle(brick.fillColor); // NEW — color match
    shrapnel.setActive(true).setVisible(true);
    // ... rest unchanged
  }
}
```

### Step 1.3 — Paddle pulse tween in `collectPowerUp()`

At the very end of `collectPowerUp(powerUp, paddle)`, after the switch statement closes, add:

```js
// Paddle pulse — cosmetic feedback on any power-up collect
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
```

### Step 1.4 — Rounded paddle visual (`this.paddleGfx`)

**In `create()`**, immediately after the paddle block (after `this.paddle.body.setCollideWorldBounds(true)`), add:

```js
// Rounded paddle graphic — draws over the invisible physics rectangle
this.paddleGfx = this.add.graphics();
this.paddle.setVisible(false); // physics rect is now the invisible hitbox only
```

**In `update(time, delta)`**, add a paddleGfx redraw block at the very top of the method (before the ball alignment loop). The redraw reads `paddle.scaleX/scaleY` so the pulse tween is visible:

```js
// Redraw rounded paddle visual
const pw = this.paddle.width * this.paddle.scaleX;
const ph = 15 * this.paddle.scaleY;
this.paddleGfx.clear();
this.paddleGfx.fillStyle(0xffffff);
this.paddleGfx.fillRoundedRect(
  this.paddle.x - pw / 2,
  this.paddle.y - ph / 2,
  pw, ph, 8
);
```

### Step 1.5 — Verify in browser

- [ ] Start the preview server if not running: `cd /tmp/jamesgentry-site && python3 -m http.server 8080` (or use existing server)
- [ ] Open `http://localhost:8080` in browser
- [ ] Press UP to start. Ball bounces off bricks — camera shakes subtly on each hit ✓
- [ ] Shoot a falling brick — explosion shrapnel matches the brick's color (not always white) ✓
- [ ] Larger camera shake on explosion than on ball hit ✓
- [ ] Paddle looks rounded (smooth corners) ✓
- [ ] Collect a power-up — paddle briefly scales up and back ✓
- [ ] Paddle hitbox still works after pulse (ball bounces off correctly) ✓
- [ ] No console errors

### Step 1.6 — Commit

```bash
git add js/app.js
git commit -m "feat(juice): screen shake on hit, color particles, paddle pulse, rounded paddle visual"
```

---

## Task 2: Spec C — Synthesized Sound System

**Files:** `js/app.js`

Add a `playTone(name)` method and wire it to 8 call sites. Sounds check `this.sound.mute` before playing — toggling M still silences everything.

### Step 2.1 — Add `playTone(name)` method

Add this new method after `toggleMusic()` in `MainState`:

```js
playTone(name) {
  if (this.sound.mute) return;
  const ctx = this.sound.context;
  if (!ctx || ctx.state === 'suspended') return;

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

  const sounds = {
    'hit-brick':  { freq: 220, type: 'square',   dur: 0.06, vol: 0.3 },
    'hit-paddle': { freq: 180, type: 'sine',      dur: 0.08, vol: 0.3 },
    'explode':    { freq: 80,  type: 'sawtooth',  dur: 0.10, vol: 0.4, freqEnd: 30 },
    'powerup':    { freq: 400, type: 'sine',      dur: 0.15, vol: 0.5, freqEnd: 600 },
    'life-lost':  { freq: 440, type: 'square',    dur: 0.40, vol: 0.5, freqEnd: 110 },
    'enemy-die':  { freq: 300, type: 'square',    dur: 0.05, vol: 0.3 },
    'shield-hit': { freq: 600, type: 'triangle',  dur: 0.10, vol: 0.4, freqEnd: 200 },
  };

  const s = sounds[name];
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
```

### Step 2.2 — Wire call sites

Add `this.playTone(...)` calls at the **start** of each handler (before any other logic):

**`hit(ball, brick)`** — add after the camera shake line:
```js
this.playTone('hit-brick');
```

**`paddleHit(paddle, ball)`** — add at the top:
```js
this.playTone('hit-paddle');
```

**`explodeBrick(bullet, brick)`** — add after the `if (!brick.isFalling) return;` guard:
```js
this.playTone('explode');
```

**`collectPowerUp(powerUp, paddle)`** — add at the top (before the switch):
```js
this.playTone('powerup');
```

**`loseLife()`** — add at the top (before `this.lives -= 1`):
```js
this.playTone('life-lost');
```

**`resetBricks()`** — add at the top:
```js
this.playTone('level-up');
```

**`shootEnemy(bullet, enemy)`** — add at the top:
```js
this.playTone('enemy-die');
```

Note: `shield-hit` call sites are in `shieldHitByBall()` and `shieldHitByBullet()` — those methods are added in Task 6.

### Step 2.3 — Verify in browser

- [ ] Open game in browser
- [ ] Press M to enable sound
- [ ] Press UP to start — ball moves (no sound on launch)
- [ ] Ball hits brick — short blip ✓
- [ ] Ball hits paddle — softer thud ✓
- [ ] Shoot falling brick — low rumble ✓
- [ ] Collect power-up — rising chime ✓
- [ ] Lose life (let ball fall) — descending wail ✓
- [ ] Clear all bricks — 3-note fanfare plays ✓
- [ ] Shoot enemy — short zap ✓
- [ ] Press M again to mute — all sounds silent ✓
- [ ] No console errors

### Step 2.4 — Commit

```bash
git add js/app.js
git commit -m "feat(juice): add synthesized sound effects via Web Audio API"
```

---

## Task 3: Spec D — Combo Multiplier + Updated Brick Patterns

**Files:** `js/app.js`

Two independent changes in one task: the combo scoring system and the new PATTERNS array.

### Step 3.1 — Add combo state in `create()`

After `this.paddleSpeed = 500;`, add:

```js
this.combo = 0;
this.comboMultiplier = 1;
```

After the score/lives text block, add the combo text (hidden by default):

```js
this.comboText = this.add.text(W / 2, H / 2, '', {
  font: '56px Bungee Shade', fill: '#ffff00'
}).setOrigin(0.5, 0.5).setAlpha(0);
```

### Step 3.2 — Add `showComboText()` helper

Add this method after `checkHighScore()`:

```js
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
```

### Step 3.3 — Update `hit()` to increment combo

Replace the current `hit()` method:

```js
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

  brick.isFalling = true;
  brick.body.setImmovable(false);
  brick.body.setAllowGravity(true);
}
```

### Step 3.4 — Update `paddleHit()` to reset combo

In `paddleHit(paddle, ball)`, add at the top (before existing logic):

```js
this.playTone('hit-paddle');
if (this.combo > 0) {
  this.combo = 0;
  this.comboMultiplier = 1;
}
```

### Step 3.5 — Update `loseLife()` to reset combo

In `loseLife()`, after `this.playTone('life-lost')`, add:

```js
this.combo = 0;
this.comboMultiplier = 1;
```

### Step 3.6 — Apply multiplier in `explodeBrick()` and `shootEnemy()`

In `explodeBrick()`, replace:
```js
this.score += 100;
```
with:
```js
this.score += 100 * this.comboMultiplier;
```

In `shootEnemy()`, replace:
```js
this.score += enemy.pointValue;
```
with:
```js
this.score += enemy.pointValue * this.comboMultiplier;
```

### Step 3.7 — Replace `PATTERNS` array

Replace the entire `PATTERNS` constant at the top of `app.js` (lines 16–59) with:

```js
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
```

### Step 3.8 — Verify in browser

- [ ] Start game — Level 1 shows T-shape (two full rows + 4-row stem in middle) ✓
- [ ] Hit multiple bricks without touching paddle — combo counter appears center screen ("x2", "x3"…) ✓
- [ ] Touch paddle — combo resets (no counter shown) ✓
- [ ] Shoot a falling brick at x3 combo — score increases by 300 ✓
- [ ] Complete level 1 — Level 2 shows diamond cluster ✓
- [ ] No console errors

### Step 3.9 — Commit

```bash
git add js/app.js
git commit -m "feat(gameplay): combo multiplier, updated brick patterns"
```

---

## Task 4: Spec D — Brick HP System

**Files:** `js/app.js`

The most complex task. Adds `brick.hp`, per-brick crack graphics, and a seeded RNG for HP distribution.

### Step 4.1 — Add `mulberry32` seeded RNG helper

Add this method anywhere in `MainState` (e.g. after `showComboText`):

```js
mulberry32(seed) {
  return function() {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
```

### Step 4.2 — Add per-brick crack Graphics pool in `create()`

After `this.initBricks(centerX)`, add:

```js
// Per-brick crack graphics (one per brick slot, index matches brickObjects[])
this.brickCrackGfx = [];
for (let i = 0; i < 60; i++) {
  const gfx = this.add.graphics();
  this.brickCrackGfx.push(gfx);
}
```

### Step 4.3 — Update `applyPattern()` to assign HP and clear cracks

Replace the existing `applyPattern(level)` method:

```js
applyPattern(level) {
  const pattern = PATTERNS[(level - 1) % PATTERNS.length];
  const color = PATTERN_COLORS[(level - 1) % PATTERN_COLORS.length];

  // Seeded RNG for HP — use actual level number, capped at level 4+ distribution
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
```

### Step 4.4 — Add `drawBrickCracks()` helper

Note on guards: `this.brickCrackGfx` is always populated in `create()` before any gameplay code runs, so `if (this.brickCrackGfx && ...)` style guards throughout this task are purely defensive. More importantly, always check `idx >= 0` before indexing — `indexOf` returns -1 if the brick isn't in the pool (shouldn't happen, but guard against silent failure).

```js
drawBrickCracks(brick) {
  const idx = this.brickObjects.indexOf(brick);
  if (idx < 0) return; // brick not in pool — should never happen
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
```

### Step 4.5 — Rewrite `hit()` with HP logic

Replace the current `hit()` method entirely:

```js
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
    // Clear cracks before brick falls (avoids stale graphics at wall position)
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
```

### Step 4.6 — Clear crack graphics when bricks are deactivated

In `update(time, delta)`, update the "kill bricks that fall off screen" block to also clear cracks:

```js
// Kill bricks that fall off screen
this.brickObjects.forEach(brick => {
  if (brick.active && brick.y > H + 50) {
    brick.setActive(false).setVisible(false);
    brick.body.enable = false;
    // Clear stale crack graphics
    const idx = this.brickObjects.indexOf(brick);
    if (this.brickCrackGfx && this.brickCrackGfx[idx]) {
      this.brickCrackGfx[idx].clear();
    }
  }
});
```

Also update `brickVsPaddle()` to clear cracks when a brick is deactivated by touching the paddle:

```js
brickVsPaddle(brick, paddle) {
  if (!brick.isFalling) return;
  brick.setActive(false).setVisible(false);
  brick.body.enable = false;
  // Clear crack graphics
  const idx = this.brickObjects.indexOf(brick);
  if (this.brickCrackGfx && this.brickCrackGfx[idx]) {
    this.brickCrackGfx[idx].clear();
  }
  if (this.shrinkPaddle(paddle)) this.loseLife();
}
```

And in `explodeBrick()`, after `brick.setActive(false).setVisible(false)`:

```js
// Clear crack graphics
const idx = this.brickObjects.indexOf(brick);
if (this.brickCrackGfx && this.brickCrackGfx[idx]) {
  this.brickCrackGfx[idx].clear();
}
```

### Step 4.7 — Verify in browser

- [ ] Level 1: all bricks have 1HP — single ball hit makes brick fall immediately ✓
- [ ] Level 2: most bricks fall on first hit; some require 2 hits. Hit a 2HP brick once — color darkens, one diagonal crack appears ✓
- [ ] Level 2: hit that same 2HP brick again — it starts falling (no second crack drawn) ✓
- [ ] Level 3+: some bricks require 3 hits. After 1 hit: one crack. After 2 hits: X pattern (two crossing cracks). After 3 hits: falls ✓
- [ ] Level 4+ uses the 40/40/20 HP distribution ✓
- [ ] Crack graphics clear when brick is shot/falls off screen ✓
- [ ] Repeated level clears reset brick colors and cracks correctly ✓
- [ ] `explodeBrick` guard still works: ball hits do NOT kill bricks from the wall (only makes them fall); player bullets kill falling bricks ✓
- [ ] No console errors

### Step 4.8 — Commit

```bash
git add js/app.js
git commit -m "feat(gameplay): brick HP system with crack visuals and seeded per-level distribution"
```

---

## Task 5: Spec D — Magnet Power-Up

**Files:** `js/app.js`

Adds the purple magnet power-up. When active, balls stick to the paddle on contact. UP releases them with spread angles. Changes the UP key trigger in `update()` from `isDown` to `JustDown` (prevents auto-release while key is held).

### Step 5.1 — Add `magnet` to `POWERUP_COLORS` and `spawnPowerUp()` types

In `POWERUP_COLORS` (top of file), add:
```js
const POWERUP_COLORS = {
  wide:   0x00ffff, // cyan
  fast:   0xffff00, // yellow
  multi:  0x00ff00, // green
  laser:  0xff4444, // red
  life:   0xff88cc, // pink
  magnet: 0x9933ff, // purple  — NEW
  shield: 0x44ffff, // light cyan — NEW (used by Task 6)
};
```

In `spawnPowerUp(x, y)`, replace the `types` array:
```js
const types = ['wide', 'fast', 'multi', 'laser', 'life', 'magnet', 'shield'];
```

### Step 5.2 — Add `this.magnetActive` state in `create()`

After `this.comboMultiplier = 1;`, add:
```js
this.magnetActive = false;
```

### Step 5.3 — Update `paddleHit()` for magnet sticking

Replace `paddleHit(paddle, ball)`. Note: the existing method only sets `setVelocityX` — Y velocity reversal is handled automatically by the physics engine (`setBounce(1)` on the ball + immovable paddle body). The replacement preserves this behavior.

```js
paddleHit(paddle, ball) {
  this.playTone('hit-paddle');

  // Reset combo on paddle contact
  if (this.combo > 0) {
    this.combo = 0;
    this.comboMultiplier = 1;
  }

  // Magnet: stick ball to paddle instead of bouncing
  if (this.magnetActive) {
    ball.body.setVelocity(0, 0);
    ball.startPos = true;
    return;
  }

  // Angle calc — sets X only; physics engine handles Y reversal via setBounce(1)
  const diff = ball.x - paddle.x;
  if (Math.abs(diff) < 5) {
    ball.body.setVelocityX(2 + Math.random() * 8);
  } else {
    ball.body.setVelocityX(5 * diff);
  }
}
```

### Step 5.4 — Change UP key trigger to `JustDown` in `update()`

In `update(time, delta)`, replace:
```js
if (this.cursors.up.isDown && this.balls.some(b => b.active && b.startPos)) {
  this.releaseBall();
}
```
with:
```js
if (Phaser.Input.Keyboard.JustDown(this.cursors.up) && this.balls.some(b => b.active && b.startPos)) {
  this.releaseBall();
}
```

### Step 5.5 — Rewrite `releaseBall()` with spread angles

Replace the current `releaseBall()` method. Keep `startText`/`legend` hide calls for now — they are still needed until Task 7 removes those objects from `MainState.create()`. Task 7 Steps 7.6–7.7 remove them.

```js
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
  this.startText.setVisible(false);
  this.legend.forEach(o => o.setVisible(false));
}
```

### Step 5.6 — Add magnet case to `collectPowerUp()` and `resetPowerUps()`

In `collectPowerUp(powerUp, paddle)`, add to the switch:
```js
case 'magnet':
  this.magnetActive = true;
  break;
```

In `resetPowerUps()`, add before the power-up deactivation loop:
```js
this.magnetActive = false;
```

### Step 5.7 — Verify in browser

- [ ] Purple magnet power-up drops occasionally from shot bricks ✓
- [ ] Collect magnet — next time the ball hits the paddle, it sticks (velocity 0, follows paddle) ✓
- [ ] Press UP once — ball(s) release and launch. **Key insight: tap, don't hold** ✓
- [ ] With multi-ball active and magnet: both balls stick when they hit; press UP to release both with different X velocities ✓
- [ ] After losing a life — `resetPowerUps()` clears magnet. Ball no longer sticks ✓
- [ ] Holding UP does NOT continuously release balls (JustDown fix) ✓
- [ ] No console errors

### Step 5.8 — Commit

```bash
git add js/app.js
git commit -m "feat(gameplay): magnet power-up — ball sticks to paddle, spread-angle release"
```

---

## Task 6: Spec D — Shield Power-Up

**Files:** `js/app.js`

Adds the cyan shield power-up — a one-hit barrier line at the bottom of the screen. Blocks one ball or one enemy bullet.

### Step 6.1 — Add shield state in `create()`

After `this.magnetActive = false;`, add:
```js
this.shieldActive = false;
```

### Step 6.2 — Create shield physics rect and Graphics in `create()`

After the power-up pool block (after the `this.powerUps.push(pu)` loop), add:

```js
// --- Shield (one-hit barrier) ---
const shieldY = H - 8;
this.shieldRect = this.add.rectangle(W / 2, shieldY, W, 6, 0x44ffff);
this.physics.add.existing(this.shieldRect);
this.shieldRect.body.setImmovable(true);
this.shieldRect.body.setAllowGravity(false);
this.shieldRect.setVisible(false);
this.shieldRect.body.enable = false;

this.shieldGfx = this.add.graphics();
this.shieldGfx.setVisible(false);
```

### Step 6.3 — Register shield overlap colliders in `create()`

After the existing collider registrations (after the `enemyHitsPaddle` overlap), add:

```js
// Shield colliders — only fire when shieldRect.body.enable = true
this.physics.add.overlap(this.balls, this.shieldRect, this.shieldHitByBall, null, this);
this.physics.add.overlap(this.enemyBullets, this.shieldRect, this.shieldHitByBullet, null, this);
```

### Step 6.4 — Add `drawShield()`, `deactivateShield()`, and collision callbacks

Add these methods to `MainState`:

```js
drawShield() {
  const W = this.scale.width;
  const H = this.scale.height;
  this.shieldGfx.clear();
  // Glow backing
  this.shieldGfx.fillStyle(0x44ffff, 0.25);
  this.shieldGfx.fillRoundedRect(0, H - 12, W, 10, 3);
  // Main bar
  this.shieldGfx.fillStyle(0x44ffff, 1.0);
  this.shieldGfx.fillRoundedRect(0, H - 11, W, 6, 3);
}

deactivateShield() {
  this.shieldActive = false;
  this.shieldRect.body.enable = false;
  this.shieldGfx.setVisible(false);
  this.shieldGfx.clear();
}

shieldHitByBall(ball, shieldRect) {
  if (ball.body.velocity.y > 0) {
    ball.body.setVelocityY(-ball.body.velocity.y);
  }
  this.deactivateShield();
  this.playTone('shield-hit');
}

shieldHitByBullet(enemyBullet, shieldRect) {
  enemyBullet.setActive(false).setVisible(false);
  enemyBullet.body.enable = false;
  this.deactivateShield();
  this.playTone('shield-hit');
}
```

### Step 6.5 — Add shield case to `collectPowerUp()`

In the switch statement in `collectPowerUp(powerUp, paddle)`, add:

```js
case 'shield':
  this.shieldActive = true;
  this.shieldRect.body.enable = true;
  this.shieldGfx.setVisible(true);
  this.drawShield();
  break;
```

### Step 6.6 — Add shield reset to `resetPowerUps()`

In `resetPowerUps()`, after `this.magnetActive = false;`, add:

```js
if (this.shieldActive) this.deactivateShield();
```

### Step 6.7 — Verify in browser

- [ ] Cyan shield power-up drops occasionally ✓
- [ ] Collect shield — a cyan glow bar appears near the bottom of the screen (below paddle) ✓
- [ ] Let ball slip past paddle — it hits the shield bar and bounces back up ✓
- [ ] Shield disappears after absorbing one ball ✓
- [ ] Enemy bullet hits shield — bullet destroyed, shield disappears ✓
- [ ] After losing a life — shield is deactivated ✓
- [ ] Sound plays on shield hit (M must be on) ✓
- [ ] No console errors

### Step 6.8 — Commit

```bash
git add js/app.js
git commit -m "feat(gameplay): shield power-up — one-hit barrier line at screen bottom"
```

---

## Task 7: Spec E — Scene Progression (TitleScene + GameOverScene)

**Files:** `js/app.js`

Adds two new Phaser scenes. `TitleScene` becomes the entry point. `MainState` transitions to `GameOverScene` on game over. This task also cleans up `startText`, `legend`, and `pauseText` from `MainState` (they no longer belong there).

### Step 7.1 — Add `TitleScene` class before `MainState`

Insert this class before `class MainState extends Phaser.Scene {`:

```js
class TitleScene extends Phaser.Scene {
  constructor() {
    super({ key: 'TitleScene' });
  }

  create() {
    const W = this.scale.width;
    const H = this.scale.height;
    const highScore = localStorage.getItem('breakout_highscore') || 0;

    // Prevent page scroll on DOWN keypress
    this.input.keyboard.addCapture(Phaser.Input.Keyboard.KeyCodes.DOWN);

    this.add.text(W / 2, H * 0.35, 'PRESS DOWN TO START', {
      font: '48px Bungee Shade', fill: '#ffffff'
    }).setOrigin(0.5, 0);

    this.add.text(W / 2, H * 0.35 + 60, 'BEST: ' + highScore, {
      font: '24px Bungee Shade', fill: '#aaddff'
    }).setOrigin(0.5, 0);

    this.input.keyboard.once('keydown-DOWN', () => this.scene.start('MainState'));
    this.input.on('pointerdown', () => this.scene.start('MainState'));
  }
}
```

### Step 7.2 — Add `GameOverScene` class after `MainState`

Insert this class after the closing `}` of `MainState` and before the `const config` block:

```js
class GameOverScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameOverScene' });
  }

  create() {
    const W = this.scale.width;
    const H = this.scale.height;
    const { score, level, highScore } = this.scene.settings.data;
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
    this.input.on('pointerdown', () => this.scene.start('TitleScene'));
  }
}
```

### Step 7.3 — Update Phaser config to use scene array

In the `config` object at the bottom of `app.js`, change:
```js
scene: MainState
```
to:
```js
scene: [TitleScene, MainState, GameOverScene]
```

### Step 7.4 — Update `restartGame()` in `MainState`

Replace the current `restartGame()` method:

```js
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
```

### Step 7.5 — Remove all `checkHighScore()` calls except the one in `restartGame()`

`restartGame()` is now the sole owner of `checkHighScore()`. Three existing call sites must be removed:

1. **`loseLife()`** — remove `this.checkHighScore();` (line ~552)
2. **`explodeBrick()`** — remove `this.checkHighScore();` (line ~587, after the score update)
3. **`shootEnemy()`** — remove `this.checkHighScore();` (line ~679, after the score update)

If any of these `checkHighScore()` calls remain, `prevBest` captured in `restartGame()` will see an already-updated high score and "NEW BEST!" will never display.

After removal, `explodeBrick()` score block looks like:
```js
this.score += 100 * this.comboMultiplier;
this.scoreText.text = 'Score: ' + this.score;
// (no checkHighScore here)
```

And `shootEnemy()` score block:
```js
this.score += enemy.pointValue * this.comboMultiplier;
this.scoreText.text = 'Score: ' + this.score;
// (no checkHighScore here)
```

The updated `loseLife()` (with `checkHighScore()` removed):

```js
loseLife() {
  this.playTone('life-lost');
  this.combo = 0;
  this.comboMultiplier = 1;
  this.lives -= 1;
  this.livesText.text = 'Lives: ' + this.lives;
  // NOTE: checkHighScore() removed — now only called in restartGame()
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
```

### Step 7.6 — Remove `startText` and `legend` from `MainState.create()`

`startText` and `legend` now belong to `TitleScene`. Remove them from `MainState.create()`.

**Keep `this.pauseText`** — `pauseToggle()` calls `this.pauseText.setVisible(...)` directly; removing it would break pause.

**Keep `this.cursors.down.on('down', this.pauseToggle, this)`** — DOWN in `MainState` triggers pause. In `TitleScene`/`GameOverScene`, DOWN triggers scene transitions via separate `keyboard.once` listeners on those scenes. Phaser runs scenes in isolation, so there is no conflict. Do not remove this line.

Delete only:
- The `startText` creation block (the `this.add.text(...)` call that creates `this.startText`)
- The Power-up legend block — the `const legendY`, `const puDefs`, `this.legend = []`, and the two `forEach` loops that populate it (approximately lines 216–239)

### Step 7.7 — Update `releaseBall()` to remove `startText`/`legend` references

In `releaseBall()`, remove:
```js
this.startText.setVisible(false);
this.legend.forEach(o => o.setVisible(false));
```

The final `releaseBall()` should be:

```js
releaseBall() {
  const xOffsets = [-75, 75, -150];
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
```

### Step 7.8 — Verify end-to-end flow

- [ ] Game opens to `TitleScene`: shows "PRESS DOWN TO START" (Bungee Shade, large, centered) ✓
- [ ] "BEST: X" shown below it (X is the stored high score, 0 initially) ✓
- [ ] Press DOWN or click → `MainState` launches, gameplay begins ✓
- [ ] Play through and lose all 3 lives → `GameOverScene` appears ✓
- [ ] GameOverScene shows "GAME OVER", score, level reached ✓
- [ ] If new high score was set → "NEW BEST!" text in gold appears ✓
- [ ] Press DOWN or click on game-over screen → `TitleScene` appears again ✓
- [ ] "BEST: X" on title now shows updated high score ✓
- [ ] Pause (DOWN during gameplay) still works and shows "Paused" text ✓
- [ ] No `startText` or legend visible during gameplay ✓
- [ ] No console errors

### Step 7.9 — Commit

```bash
git add js/app.js
git commit -m "feat(scenes): add TitleScene + GameOverScene, wire scene progression flow"
```

---

## Verification Checklist (Full End-to-End)

Run through this after all 7 tasks are complete:

1. **Title screen** — "PRESS DOWN TO START" + "BEST: 0" shown; DOWN or click starts game
2. **Level 1 T-shape** — 2 full rows + 4-row stem in center; all 1HP
3. **Rounded paddle** — smooth corners, no rectangle edges visible
4. **Screen shake** — subtle on ball-brick hit; stronger on explosion
5. **Color shrapnel** — particles match the brick color on explosion
6. **Sound (M to enable)** — 7 distinct sounds for different events
7. **Combo** — "x2", "x3"… text appears center-screen when hitting bricks without paddle contact
8. **Brick HP (level 2+)** — some bricks need 2–3 hits; color darkens + cracks appear per hit
9. **Magnet** — purple power-up; ball sticks to paddle, UP releases with spread
10. **Shield** — cyan power-up; glow bar at bottom bounces ball or blocks enemy bullet
11. **Power-up pulse** — paddle briefly scales up/down on any collection
12. **Game over → GameOverScene** — score + level displayed; "NEW BEST!" on record
13. **Play again → TitleScene** — updated best score shown
14. **Pause (DOWN in gameplay)** — still works correctly

---
