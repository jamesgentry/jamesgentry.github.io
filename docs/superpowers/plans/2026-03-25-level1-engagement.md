# Level 1 Engagement & Polish — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add "GO" layout, armored bricks, guaranteed power-ups, drop-in animation, ghost ball trail, and boss enrage to the Phaser 3.90.0 breakout game.

**Architecture:** All changes are in `js/app.js` (single-file game). Tasks are ordered by dependency: layout/bricks first (Task 1), intro animation second (Task 2, depends on brick structure), then independent polish features (Tasks 3 & 4).

**Tech Stack:** Phaser 3.90.0, vanilla JS, no test framework — verification is via browser preview screenshot after each task.

**Spec:** `docs/superpowers/specs/2026-03-25-level1-engagement-design.md`

---

## Files Modified

- **Modify:** `js/app.js` — all changes in this file only

---

## Task 1: "GO" Layout, Armored Bricks & Guaranteed Power-ups

**Files:**
- Modify: `js/app.js` — `PATTERNS[0]`, `applyPattern()`, `hitBrick()`

**Context for implementor:**
- `PATTERNS` is at the top of the file (~line 32). Each entry is an array of 6 strings, each 10 chars (`'1'`=active, `'0'`=gap). Index 0 = level 1.
- `applyPattern(level)` (~line 444) loops `col` 0–9, `row` 0–5, column-major: `idx = col * ROWS + row` where `ROWS=6`.
- In the main active-brick branch (~line 464), properties like `brick.hp`, `brick.isExplosive` are set. Add `brick.forcePowerUp = false` here.
- After the main loop, add a `if (level === 1)` post-pass for armored bricks and `forcePowerUp` flags.
- `explodeBrick()` (laser bullet hit handler) power-up drop is at ~line 907. Note: the ball-hit handler `hit()` does NOT call `spawnPowerUp` — only `explodeBrick()` does.
- `PATTERN_COLORS[0]` = `0x88ccff` (soft blue) — use this as `baseColor` for armored brick darkening.

- [ ] **Step 1.1: Replace `PATTERNS[0]` with the "GO" shape**

  In `js/app.js`, find `PATTERNS` (~line 32–75) and replace the level 1 entry (the T-shape comment + 6 strings):
  ```js
  // Level 1 — "GO" shape (30 bricks)
  ['1111001111',
   '1000001001',
   '1011001001',
   '1001001001',
   '1101001001',
   '1111001111'],
  ```

- [ ] **Step 1.2: Add `brick.forcePowerUp = false` to default brick init**

  In `applyPattern()`, inside the `if (active)` branch (~line 464), add after `brick.isExplosive = false;`:
  ```js
  brick.forcePowerUp = false;
  ```
  Also add in the `else` (inactive) branch after `brick.isExplosive = false;`:
  ```js
  brick.forcePowerUp = false;
  ```

- [ ] **Step 1.3: Add level 1 post-pass for armored bricks and guaranteed power-ups**

  In `applyPattern()`, after the closing `}` of the main `for (let col...)` loop and before the `// Boss:` block (~line 507), add:
  ```js
  // Level 1 post-pass: armored corners + guaranteed power-ups on bottom row
  if (level === 1) {
    const baseColor = PATTERN_COLORS[0]; // 0x88ccff
    const armorColor = Phaser.Display.Color.IntegerToColor(baseColor).darken(20).color;
    // G corners: (col,row) = (0,0),(3,0),(0,5),(3,5) → idx = col*6+row
    // O corners: (6,0),(9,0),(6,5),(9,5)
    [0, 18, 5, 23, 36, 54, 41, 59].forEach(idx => {
      const brick = this.brickObjects[idx];
      if (brick && brick.active) {
        brick.hp = 2;
        brick.maxHp = 2;
        brick.setFillStyle(armorColor);
      }
    });
    // Bottom row (row 5) active bricks get guaranteed power-up
    for (let col = 0; col < COLS; col++) {
      const idx = col * ROWS + 5;
      const brick = this.brickObjects[idx];
      if (brick && brick.active) {
        brick.forcePowerUp = true;
      }
    }
  }
  ```

- [ ] **Step 1.4: Update `explodeBrick()` to respect `forcePowerUp`**

  In `explodeBrick()` (~line 907 — this is the laser bullet hit handler, NOT the ball-hit handler `hit()`), replace:
  ```js
  // Power-up drop — 33% chance
  if (Math.random() < 0.33) {
    this.spawnPowerUp(brick.x, brick.y);
  }
  ```
  with:
  ```js
  // Power-up drop — 33% chance, or guaranteed if flagged
  if (brick.forcePowerUp || Math.random() < 0.33) {
    this.spawnPowerUp(brick.x, brick.y);
  }
  ```

- [ ] **Step 1.5: Verify in browser**

  Open preview. Start game. Confirm:
  - Level 1 shows "GO" shape in soft blue
  - 8 corner bricks are visibly darker than the others
  - Breaking a bottom-row brick always drops a power-up
  - Screenshot to confirm visual

- [ ] **Step 1.6: Commit**
  ```bash
  git add js/app.js
  git commit -m "feat: GO layout for level 1, armored corners, guaranteed bottom-row power-ups"
  ```

---

## Task 2: Drop-from-Above Intro Animation

**Files:**
- Modify: `js/app.js` — `create()`, `applyPattern()`, `update()`, `resetPowerUps()`

**Context for implementor:**
- `create()` initializes all state (~line 159). Add `this._dropTweens = []` and `this.introAnimating = false` here.
- `applyPattern()` (~line 444) — at the very top of the method body, add tween cancellation. After the main loop + level 1 post-pass, add the tween launch block.
- The boss `activateBoss(level)` call is at ~line 520 inside `applyPattern()`. Move it to the `tweensRemaining === 0` callback. The boss footprint clearing block (lines 508–519) stays synchronous.
- In `update()`, the release-ball block is at ~line 544. Wrap it with the `introAnimating` guard.
- `resetPowerUps()` ends at ~line 1469. Add tween cleanup before the closing `}`.
- `this.tweens.add()` returns a tween object. In Phaser 3, call `tween.remove()` to cancel it.

- [ ] **Step 2.1: Initialize `_dropTweens` and `introAnimating` in `create()`**

  In `create()`, after the existing state init block (~line 188, after `this.bossHitCooldown = 0;`), add:
  ```js
  this._dropTweens = [];
  this.introAnimating = false;
  ```

- [ ] **Step 2.2: Cancel stale tweens at top of `applyPattern()`**

  At the very start of `applyPattern(level)` body (~line 445, before `const patternIndex`), add:
  ```js
  // Cancel any in-flight drop tweens from previous level
  this._dropTweens.forEach(t => t.remove());
  this._dropTweens = [];
  ```

- [ ] **Step 2.3: Launch drop tweens after brick setup, defer `activateBoss()`**

  In `applyPattern()`, find the boss block (~line 507):
  ```js
  // Boss: from level 2+, clear the 6 bricks in boss footprint and activate boss
  if (level >= 2) {
    [3, 4, 5].forEach(c => [2, 3].forEach(r => {
      ...
    }));
    this.activateBoss(level);
  }
  ```

  Replace `this.activateBoss(level);` with nothing (remove it). The call will move into the tween callback below.

  Then, after the entire boss block (after its closing `}`), add the drop animation block:
  ```js
  // Drop-from-above intro animation
  const activeBricks = this.brickObjects.filter(b => b.active);
  let tweensRemaining = activeBricks.length;
  this.introAnimating = true;

  activeBricks.forEach(brick => {
    // Determine column from initX
    const col = Math.round((brick.initX - this._gridStartX) / (BOX_W + 4));
    // Move brick off-screen and disable physics until it lands
    brick.y = -50;
    brick.body.enable = false;

    const tween = this.tweens.add({
      targets: brick,
      y: brick.initY,
      duration: 400,
      ease: 'Bounce.Out',
      delay: col * 40,
      onComplete: () => {
        brick.body.enable = true;
        tweensRemaining--;
        if (tweensRemaining === 0) {
          this.introAnimating = false;
          if (level >= 2) this.activateBoss(level);
        }
      }
    });
    this._dropTweens.push(tween);
  });
  ```

- [ ] **Step 2.4: Guard `releaseBall()` in `update()`**

  In `update()`, find (~line 543–546):
  ```js
  // Release ball on UP
  if (Phaser.Input.Keyboard.JustDown(this.cursors.up) && this.balls.some(b => b.active && b.startPos)) {
    this.releaseBall();
  }
  ```
  Replace with:
  ```js
  // Release ball on UP — blocked during intro animation
  if (!this.introAnimating && Phaser.Input.Keyboard.JustDown(this.cursors.up) && this.balls.some(b => b.active && b.startPos)) {
    this.releaseBall();
  }
  ```

- [ ] **Step 2.5: Clean up tweens in `resetPowerUps()`**

  In `resetPowerUps()` (~line 1441), after the opening line (`this.nudgeCooldown = 0;`), add:
  ```js
  this._dropTweens.forEach(t => t.remove());
  this._dropTweens = [];
  this.introAnimating = false;
  ```

- [ ] **Step 2.6: Verify in browser**

  Open preview. Start game. Confirm:
  - Bricks drop from above and bounce into place when level starts
  - Stagger is left-to-right (column 0 first)
  - Ball cannot be launched until all bricks have landed (~760ms)
  - Advance to level 2 — bricks drop, boss appears only after animation completes
  - Lose a life mid-animation — verify no stuck `introAnimating` state (ball can be launched on respawn)
  - Screenshot to confirm

- [ ] **Step 2.7: Commit**
  ```bash
  git add js/app.js
  git commit -m "feat: drop-from-above intro animation for all levels, boss deferred to animation complete"
  ```

---

## Task 3: Ghost Ball Trail

**Files:**
- Modify: `js/app.js` — `create()`, `activateBall()`, `activateMultiBall()`, `update()`, `resetPowerUps()`

**Context for implementor:**
- `create()` — add `this.trailGfx` after the `brickCrackGfx` loop (~line 227).
- `activateBall()` — find where ball is set up and add `ball.trail = []`. Search for `activateBall` method.
- `activateMultiBall()` (~line 751) — add `extra.trail = []` after `extra.startPos = false`.
- `update()` — add trail drawing after the paddle redraw section, before or after the ball-follows-paddle block. Use `Math.hypot()` (native JS — not `Phaser.Math.hypot`).
- `resetPowerUps()` — add `this.trailGfx.clear()` and trail array reset.
- Ball deactivation happens in `update()` at ~line 641 (`ball.setActive(false)...`). Add `ball.trail = []` there.
- `ball.fillColor` is a valid property on `Phaser.GameObjects.Arc`.
- `this.trailGfx.fillStyle(color, alpha)` and `this.trailGfx.fillCircle(x, y, r)` are valid Phaser Graphics APIs.

- [ ] **Step 3.1: Add `trailGfx` in `create()`**

  After the `brickCrackGfx` loop (~line 227), add:
  ```js
  // Ghost ball trail graphics
  this.trailGfx = this.add.graphics().setDepth(1);
  ```

- [ ] **Step 3.2: Initialize `ball.trail` in `activateBall()`**

  Find `activateBall()` method. After the line that sets `ball.startPos = startPos`, add:
  ```js
  ball.trail = [];
  ```

- [ ] **Step 3.3: Initialize `extra.trail` in `activateMultiBall()`**

  In `activateMultiBall()` (~line 751), after `extra.startPos = false;`, add:
  ```js
  extra.trail = [];
  ```

- [ ] **Step 3.4: Draw trail in `update()`**

  In `update()`, after the `paddleGfx` redraw block and before `// Keep startPos balls aligned`, add:
  ```js
  // Ghost ball trail
  this.trailGfx.clear();
  this.balls.forEach(ball => {
    if (!ball.active) return;
    // Update position history
    ball.trail = ball.trail || [];
    ball.trail.push({ x: ball.x, y: ball.y });
    if (ball.trail.length > 4) ball.trail.shift();
    // Draw trail if fast enough
    const speed = Math.hypot(ball.body.velocity.x, ball.body.velocity.y);
    if (speed > 420) {
      const alphas = [0.15, 0.25, 0.40, 0.55];
      ball.trail.forEach((pos, i) => {
        this.trailGfx.fillStyle(ball.fillColor, alphas[i]);
        this.trailGfx.fillCircle(pos.x, pos.y, ball.radius - 1);
      });
    }
  });
  ```

- [ ] **Step 3.5: Clear trail on ball deactivation**

  In `update()`, find the ball deactivation block (~line 641):
  ```js
  this.balls.forEach(ball => {
    if (ball.active && ball.y > this.paddle.y + 40) {
      ball.setActive(false).setVisible(false);
      ball.body.enable = false;
    }
  });
  ```
  Add `ball.trail = [];` after `ball.body.enable = false;`.

- [ ] **Step 3.6: Clean up in `resetPowerUps()`**

  In `resetPowerUps()`, after the `_dropTweens` cleanup added in Task 2, add:
  ```js
  this.trailGfx.clear();
  this.balls.forEach(ball => { ball.trail = []; });
  ```

- [ ] **Step 3.7: Verify in browser**

  Open preview. Start game. Collect the FAST power-up (yellow). Confirm:
  - Ghost trail appears behind the ball at high speed (fading circles)
  - Trail disappears when ball slows down
  - Multi-ball also shows trails when fast
  - No trail at normal speed (below 420 px/s)
  - Screenshot to confirm

- [ ] **Step 3.8: Commit**
  ```bash
  git add js/app.js
  git commit -m "feat: ghost ball trail at speed > 420px/s"
  ```

---

## Task 4: Boss Enrage — Scaling Fire Rate, Spread Shot & Color Interpolation

**Files:**
- Modify: `js/app.js` — `update()`, `hitBoss()`, `shootBoss()`, `fireBossBullet()`

**Context for implementor:**
- In `update()`, boss fire timer reset is at ~line 628: `this.bossFireTimer = Phaser.Math.Between(3000, 4000);` — replace with formula.
- `hitBoss()` (~line 1372) — has `darken()` color call at line 1384. Replace with interpolation.
- `shootBoss()` (~line 1391) — has same `darken()` pattern at line 1407. Replace with interpolation.
- `fireBossBullet()` (~line 1414) — replace single-bullet logic with spread-or-single based on HP ratio.
- `Phaser.Math.DegToRad(deg)` is valid in Phaser 3.
- Use variable name `shot` (not `b`) in the spread loop to avoid shadowing the `b` component in the color formula.

- [ ] **Step 4.1: Replace fire timer reset in `update()` with scaling formula**

  In `update()`, find (~line 627–629):
  ```js
  this.fireBossBullet();
  this.bossFireTimer = Phaser.Math.Between(3000, 4000);
  ```
  Replace with:
  ```js
  this.fireBossBullet();
  const hpRatio = this.bossHp / this.bossMaxHp;
  this.bossFireTimer = 1000 + Math.round(hpRatio * 2500);
  ```

- [ ] **Step 4.2: Replace `darken()` color with interpolation in `hitBoss()`**

  In `hitBoss()` (~line 1382–1387), find the `else` branch:
  ```js
  } else {
    const pct = 1 - this.bossHp / this.bossMaxHp;
    const c = Phaser.Display.Color.IntegerToColor(0xffcc00).darken(Math.floor(25 * pct));
    this.bossBrick.setFillStyle(c.color);
    this.drawBossHpBar();
    this.fireBossBullet();
  }
  ```
  Replace with:
  ```js
  } else {
    const pct = 1 - this.bossHp / this.bossMaxHp;
    const r = 0xff;
    const g = Math.round(0xcc * (1 - pct) + 0x44 * pct);
    const bVal = 0x00;
    this.bossBrick.setFillStyle((r << 16) | (g << 8) | bVal);
    this.drawBossHpBar();
    this.fireBossBullet();
  }
  ```

- [ ] **Step 4.3: Replace `darken()` color with interpolation in `shootBoss()`**

  In `shootBoss()` (~line 1403–1411), same pattern:
  ```js
  } else {
    const pct = 1 - this.bossHp / this.bossMaxHp;
    const c = Phaser.Display.Color.IntegerToColor(0xffcc00).darken(Math.floor(25 * pct));
    this.bossBrick.setFillStyle(c.color);
    this.drawBossHpBar();
    this.fireBossBullet();
  }
  ```
  Replace with:
  ```js
  } else {
    const pct = 1 - this.bossHp / this.bossMaxHp;
    const r = 0xff;
    const g = Math.round(0xcc * (1 - pct) + 0x44 * pct);
    const bVal = 0x00;
    this.bossBrick.setFillStyle((r << 16) | (g << 8) | bVal);
    this.drawBossHpBar();
    this.fireBossBullet();
  }
  ```

- [ ] **Step 4.4: Replace `fireBossBullet()` with spread-or-single logic**

  Replace the entire `fireBossBullet()` method body (~line 1414–1422):
  ```js
  fireBossBullet() {
    const isEnraged = this.bossMaxHp > 0 && (this.bossHp / this.bossMaxHp) < 0.25;
    const angles = isEnraged ? [0, -25, 25] : [0];
    angles.forEach(deg => {
      const shot = this.enemyBullets.find(b => !b.active);
      if (!shot) return;
      shot.setPosition(this.bossX, this.bossY + BOSS_H / 2);
      shot.setActive(true).setVisible(true);
      shot.body.enable = true;
      shot.body.reset(this.bossX, this.bossY + BOSS_H / 2);
      const rad = Phaser.Math.DegToRad(deg);
      const speed = 350;
      shot.body.setVelocity(speed * Math.sin(rad), speed * Math.cos(rad));
    });
  }
  ```

- [ ] **Step 4.5: Verify in browser**

  Start game, advance to level 2 (or use browser console `game.scene.getScene('MainState').level = 2; game.scene.getScene('MainState').resetBricks()` to skip ahead). Confirm:
  - Boss fires faster as HP drops
  - Below 25% HP, boss fires 3-bullet spread
  - Boss color shifts from gold toward orange-red as HP drops
  - Screenshot to confirm

- [ ] **Step 4.6: Commit**
  ```bash
  git add js/app.js
  git commit -m "feat: boss enrage — scaling fire rate, spread shot below 25% HP, gold-to-red color shift"
  ```

---

## Final Verification

- [ ] Load level 1 — confirm "GO" layout, darker corners, bottom-row power-up drops
- [ ] Confirm drop animation plays on level start and level advance
- [ ] Confirm ball trail appears when FAST power-up is active
- [ ] Confirm boss gets angrier (faster + spread + redder) at low HP
- [ ] No console errors across all verifications
