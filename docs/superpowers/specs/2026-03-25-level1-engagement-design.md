# Level 1 Engagement & Polish — Design Spec
**Date:** 2026-03-25
**Status:** Approved

## Overview

Six improvements to make level 1 more engaging and add polish across the game:

1. "GO" brick layout for level 1
2. Guaranteed power-up from bottom-row bricks
3. Fixed 2-HP armored bricks in level 1
4. Drop-from-above intro animation for all levels
5. Ghost ball trail at high speed
6. Boss enrage — fire rate scales + spread shot at low HP

---

## Codebase Context

- **`js/app.js`** — single-file Phaser 3.90.0 game, ~1450 lines
- **Grid:** `COLS=10`, `ROWS=6`, `BOX_W=46`, `BOX_H=26`, horizontal gap=4, vertical gap=10
- **Grid origin:** `_gridStartX`, `_gridStartY=130`, column-major indexing `idx = col*ROWS + row`
- **`PATTERNS[]`** — array of 6-string rows per level, `'1'`=active, `'0'`=gap. `applyPattern(level)` resolves to `PATTERNS[0]` for level 1 (via `level <= 1 ? 0 : ((level-2) % (PATTERNS.length-1)) + 1`). Only `PATTERNS[0]` needs to change.
- **`PATTERN_COLORS[]`** — fill color per level index
- **Brick objects:** `Phaser.GameObjects.Rectangle` with `.hp`, `.isExplosive`, `.isFalling`, `.initX`, `.initY`, `.forcePowerUp`
- **Power-up drop:** `spawnPowerUp(x, y)` called in `hitBrick()` after the brick is killed (deactivated), currently 33% random chance. For 2-HP armored bricks, the drop only occurs on the killing blow (second hit), which is the correct behavior for `forcePowerUp`.
- **Boss fire timer:** `this.bossFireTimer` in `update()`, currently reset to `Phaser.Math.Between(3000, 4000)` after each shot
- **`fireBossBullet()`** — fires a single bullet with `body.setVelocity(Phaser.Math.Between(-60, 60), 350)`. Enemy bullet pool has 20 bullets — sufficient for spread shots.
- **`activateBoss(level)`** — sets `bossMaxHp = (level-2)+5`, `bossHp`, `bossFireTimer=3500`
- **`hitBoss()`** — debounced 300ms, decrements `bossHp`, calls `fireBossBullet()` on each hit. Uses `darken()` for color currently — will be replaced.
- **Balls:** `Phaser.GameObjects.Arc`, `BALL_RADIUS=9`, launched from `startPos` on Up key
- **`update(delta)`** — main game loop receives delta in ms
- **`Math.hypot()`** — use native JS; `Phaser.Math.hypot` does not exist

---

## Section 1 — "GO" Layout for Level 1

Replace `PATTERNS[0]` (T-shape) with a "GO" shape on the 10×6 grid.

Grid layout (10 cols × 6 rows, columns 0–9, rows 0–5):

```
Row 0: 1 1 1 1 0 0 1 1 1 1   G-top + O-top
Row 1: 1 0 0 0 0 0 1 0 0 1   G-left + O-sides
Row 2: 1 0 1 1 0 0 1 0 0 1   G-left + G-crossbar + O-sides
Row 3: 1 0 0 1 0 0 1 0 0 1   G-left + G-crossbar-right + O-sides
Row 4: 1 1 0 1 0 0 1 0 0 1   G-bottom + G-crossbar-right + O-sides
Row 5: 1 1 1 1 0 0 1 1 1 1   G-base + O-base
```

Columns 4–5 are the gap between letters. G occupies cols 0–3; O occupies cols 6–9.

String representation for `PATTERNS[0]`:
```js
['1111001111',
 '1000001001',
 '1011001001',
 '1001001001',
 '1101001001',
 '1111001111']
```

---

## Section 2 — Fixed 2-HP Armored Bricks in Level 1

After the main brick loop in `applyPattern()`, a `level === 1` post-pass sets 8 corner bricks to HP=2. These are the corner positions of each letter — hardest to reach, add texture without punishing the player.

**Armored brick positions (col, row) → column-major index (`col * ROWS + row`, ROWS=6):**
- G corners: (0,0)→0, (3,0)→18, (0,5)→5, (3,5)→23
- O corners: (6,0)→36, (9,0)→54, (6,5)→41, (9,5)→59

**Implementation:** In `applyPattern()`, after the main brick loop, `if (level === 1)` iterate over these 8 indices, look up `this.brickObjects[idx]`, and set `.hp = 2`. Set fill color one shade darker using `Phaser.Display.Color.IntegerToColor(baseColor).darken(20).color` to visually distinguish them — consistent with the existing crack-darkening pattern.

---

## Section 3 — Guaranteed Power-up from Bottom-Row Bricks

Bottom-row bricks (row 5) that are active in the GO layout get `forcePowerUp = true` during the `level === 1` post-pass in `applyPattern()`.

**Active bottom-row columns** (row 5 in GO layout): cols 0,1,2,3,6,7,8,9 → 8 bricks flagged.

**Implementation:**
- In `applyPattern()`, in the `level === 1` post-pass, for each active brick in row 5, set `brick.forcePowerUp = true`.
- In the default brick initialization loop, always set `brick.forcePowerUp = false` so level 2+ bricks don't inherit a stale flag.
- In `hitBrick()`, replace:
  ```js
  if (Math.random() < 0.33) {
    this.spawnPowerUp(brick.x, brick.y);
  }
  ```
  with:
  ```js
  if (brick.forcePowerUp || Math.random() < 0.33) {
    this.spawnPowerUp(brick.x, brick.y);
  }
  ```

---

## Section 4 — Drop-from-Above Intro Animation

When any level starts, bricks drop from off-screen into position, staggered by column, giving the player a moment to read the layout before play begins.

**Implementation:**

1. At the top of `applyPattern()`, call `this.tweens.add`-tracked references to cancel any in-flight tweens from a previous level. Store drop tweens in `this._dropTweens = []` (initialize to `[]` in `create()`). At the start of `applyPattern()`, call `this._dropTweens.forEach(t => t.remove())` then `this._dropTweens = []`. This avoids the too-broad `tweens.killAll()` which would cancel unrelated tweens (e.g. flash animations).

2. After placing each brick at its target position (`initX`, `initY`), immediately set `brick.y = -50` and `brick.body.enable = false` (overriding the `body.enable = true` set in the main activation loop — must happen after it).

3. Set `this.introAnimating = true` before launching tweens.

4. Track tween completion with a counter: `let tweensRemaining = activeBrickCount`. In each tween's `onComplete`:
   ```js
   onComplete: () => {
     brick.body.enable = true;
     tweensRemaining--;
     if (tweensRemaining === 0) {
       this.introAnimating = false;
       if (level >= 2) this.activateBoss(level); // deferred for levels with boss
     }
   }
   ```

5. Tween config per brick:
   ```js
   const tween = this.tweens.add({
     targets: brick,
     y: brick.initY,
     duration: 400,
     ease: 'Bounce.Out',
     delay: col * 40,
     onComplete: /* see above */
   });
   this._dropTweens.push(tween);
   ```

6. In `update()`, guard only the `releaseBall()` call — do NOT early-return the entire loop (paddle movement, boss timer, life-loss detection must still run during animation):
   ```js
   if (!this.introAnimating && Phaser.Input.Keyboard.JustDown(this.upKey)) {
     this.releaseBall();
   }
   ```

7. In `resetPowerUps()`, add:
   ```js
   this._dropTweens.forEach(t => t.remove());
   this._dropTweens = [];
   this.introAnimating = false;
   ```

8. **Boss deferral (levels ≥ 2):** Remove the `activateBoss(level)` call from `applyPattern()` and move it into the `tweensRemaining === 0` callback. The boss footprint brick-clearing block remains synchronous (so footprint bricks don't collide during the animation), only the `activateBoss()` call is deferred.

**Tween timing:** Column 0 starts at t=0ms, column 9 at t=360ms, last brick lands ~760ms after level start.

---

## Section 5 — Ghost Ball Trail

When any ball's speed exceeds 420 px/s, render 4 fading ghost circles trailing behind it.

**Implementation:**
- Add in `create()`: `this.trailGfx = this.add.graphics().setDepth(1)`. Depth 1 renders above bricks (depth 0) and below the boss HP bar `bossBrickGfx` (depth 2). Note: `brickCrackGfx` is also at depth 1 — trail and crack graphics share the same depth layer and will interleave by draw order, which is visually acceptable.
- Each ball gets a `trail = []` array (max 4 entries), initialized in `activateBall()` and `activateMultiBall()`.
- In `update()`, call `this.trailGfx.clear()` once, then for each active ball:
  1. Push `{ x: ball.x, y: ball.y }` to `ball.trail`; if length > 4, shift oldest.
  2. Compute speed: `Math.hypot(ball.body.velocity.x, ball.body.velocity.y)`
  3. If speed > 420, draw ghost circles using `ball.trail`:
     - Index 0 (oldest): alpha 0.15
     - Index 1: alpha 0.25
     - Index 2: alpha 0.40
     - Index 3 (most recent): alpha 0.55
     - Radius: `ball.radius - 1`, color: `ball.fillColor`
     ```js
     ball.trail.forEach((pos, i) => {
       this.trailGfx.fillStyle(ball.fillColor, [0.15, 0.25, 0.40, 0.55][i]);
       this.trailGfx.fillCircle(pos.x, pos.y, ball.radius - 1);
     });
     ```
- In `resetPowerUps()`: `this.trailGfx.clear()` and for each ball `ball.trail = []`.
- When a ball is deactivated (falls off bottom), set `ball.trail = []`.

---

## Section 6 — Boss Enrage

### 6a — Fire Rate Scales With HP

Replace the fixed `Phaser.Math.Between(3000, 4000)` reset with a formula:

```js
const hpRatio = this.bossHp / this.bossMaxHp; // 1.0 = full, approaches 0 near death
const fireInterval = 1000 + Math.round(hpRatio * 2500);
// 3500ms at full HP → ~1500ms at 1 HP (level 2) → floor of 1000ms as hpRatio→0
this.bossFireTimer = fireInterval;
```

Apply in both places `bossFireTimer` is reset: in `update()` after each `fireBossBullet()` call, and keep `activateBoss()` initial value as `3500` (full HP).

### 6b — Spread Shot Below 25% HP

In `fireBossBullet()`, check `this.bossHp / this.bossMaxHp < 0.25`. If so, fire 3 bullets:

```js
const angles = [0, -25, 25]; // degrees from straight down
angles.forEach(deg => {
  const rad = Phaser.Math.DegToRad(deg);
  const shot = this.enemyBullets.find(b => !b.active);
  if (!shot) return;
  shot.setPosition(this.bossX, this.bossY + BOSS_H / 2);
  shot.setActive(true).setVisible(true);
  shot.body.enable = true;
  shot.body.reset(this.bossX, this.bossY + BOSS_H / 2);
  const speed = 350;
  shot.body.setVelocity(speed * Math.sin(rad), speed * Math.cos(rad));
});
```

If below 25% threshold, replace the current single-bullet logic entirely with this loop. The pool has 20 bullets — ample for spread shots.

### 6c — Visual Enrage Cue

In `hitBoss()` and `shootBoss()`, replace the existing `darken()` color call with an interpolation from gold → orange-red:

```js
const pct = 1 - this.bossHp / this.bossMaxHp; // 0.0 full → 1.0 dead
const r = 0xff;
const g = Math.round(0xcc * (1 - pct) + 0x44 * pct);
const b = 0x00;
this.bossBrick.setFillStyle((r << 16) | (g << 8) | b);
```

Ensure `drawBossHpBar()` is still called after this update (it already is in the existing flow).

---

## Edge Cases & Guards

- **Intro + boss footprint:** Boss footprint brick-clearing remains synchronous in `applyPattern()`. Only `activateBoss()` is deferred to `tweensRemaining === 0`. This ensures footprint bricks are invisible/inactive during the drop animation.
- **Mid-animation life loss:** `resetPowerUps()` cancels `_dropTweens` and sets `introAnimating = false`, preventing the flag from getting stuck.
- **`forcePowerUp` on armored bricks:** Power-up only spawns on the killing blow (second hit). First hit reduces HP, brick stays active — `spawnPowerUp` is not reached. Correct behavior.
- **Trail on deactivated balls:** Guard `ball.active` before pushing to `ball.trail` and drawing. Clear `ball.trail = []` on deactivation.
- **`b` variable naming in spread-shot loop:** Use `shot` (not `b`) as the local variable to avoid shadowing the outer `b` component variable in the color formula above.
