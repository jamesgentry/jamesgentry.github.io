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
- **`PATTERNS[]`** — array of 6-string rows per level, `'1'`=active, `'0'`=gap. Index 0 = level 1.
- **`PATTERN_COLORS[]`** — fill color per level index
- **Brick objects:** `Phaser.GameObjects.Rectangle` with `.hp`, `.isExplosive`, `.isFalling`, `.initX`, `.initY`
- **Power-up drop:** `spawnPowerUp(x, y)` called in `hitBrick()` at line ~908, currently 33% random chance
- **Boss fire timer:** `this.bossFireTimer` in `update()`, reset to `Phaser.Math.Between(3000, 4000)` after each shot
- **`fireBossBullet()`** — fires a single bullet with `body.setVelocity(Phaser.Math.Between(-60, 60), 350)`
- **`activateBoss(level)`** — sets `bossMaxHp = (level-2)+5`, `bossHp`, `bossFireTimer=3500`
- **`hitBoss()`** — debounced 300ms, decrements `bossHp`, calls `fireBossBullet()` on each hit
- **Balls:** `Phaser.GameObjects.Arc`, `BALL_RADIUS=9`, launched from `startPos` on Up key
- **`update(delta)`** — main game loop receives delta in ms

---

## Section 1 — "GO" Layout for Level 1

Replace `PATTERNS[0]` (T-shape) with a "GO" shape on the 10×6 grid.

Grid layout (10 cols × 6 rows, columns 0–9, rows 0–5):

```
Row 0: 1 1 1 1 0 0 1 1 1 1   G-top + O-top
Row 1: 1 0 0 0 0 0 1 0 0 1   G-left + O-sides
Row 2: 1 0 1 1 0 0 1 0 0 1   G-left + G-crossbar + O-sides
Row 3: 1 0 0 1 0 0 1 0 0 1   G-left + G-crossbar + O-sides
Row 4: 1 1 0 1 0 0 1 0 0 1   G-bottom-open + G-crossbar + O-sides
Row 5: 1 1 1 1 0 0 1 1 1 1   G-base + O-base
```

String representation for `PATTERNS[0]`:
```js
['1111001111',
 '1000001001',
 '1011001001',
 '1001001001',
 '1101001001',
 '1111001111']
```

Column 4 is the gap between letters. This gives G in cols 0–3 and O in cols 6–9.

**Note:** The existing `applyPattern()` function reads `PATTERNS[level-1]` and places bricks accordingly. Only `PATTERNS[0]` needs to change.

---

## Section 2 — Fixed 2-HP Armored Bricks in Level 1

After `applyPattern(1)` sets all level-1 bricks to HP=1, a post-pass sets specific bricks to HP=2. These are the corner bricks of each letter — hardest to reach, add texture without blocking progress.

**Armored brick positions (col, row):**
- G corners: (0,0), (3,0), (0,5), (3,5)
- O corners: (6,0), (9,0), (6,5), (9,5)

**Implementation:** In `applyPattern()`, after the main brick loop, check `if (level === 1)` and set those 8 bricks' `.hp = 2`. Use the column-major index formula `idx = col * ROWS + row`. Set their fill color one shade darker using `Phaser.Display.Color.IntegerToColor(baseColor).darken(20).color` to visually distinguish them — consistent with the existing crack-darkening pattern.

---

## Section 3 — Guaranteed Power-up from Bottom-Row Bricks

Bottom-row bricks (row 5) in the GO layout that are active get a `forcePowerUp = true` flag set during `applyPattern()` for level 1 only.

**Implementation:**
- In `applyPattern()`, after the main brick loop, check `if (level === 1)` and for each column where row 5 has an active brick, set `brick.forcePowerUp = true`.
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

**Active bottom-row columns in the GO layout** (row 5): cols 0,1,2,3,6,7,8,9 → 8 guaranteed drops.

---

## Section 4 — Drop-from-Above Intro Animation

When any level starts (in `applyPattern()`), bricks begin off-screen and tween down to their target Y positions.

**Implementation:**
- After placing bricks at their target positions (setting `x`, `y`, `initX`, `initY`), immediately move each brick's Y to `-50` (off-screen above canvas).
- Disable the launch key until animation completes (set a flag `this.introAnimating = true`).
- Use Phaser tweens staggered by column index: `delay = col * 40` ms.
- Tween each brick from `y = -50` to `y = initY` over 400ms using `ease: 'Bounce.Out'`.
- On the last tween's `onComplete` (the highest column index active brick's tween), set `this.introAnimating = false`.
- In `update()`, guard the launch key: if `this.introAnimating` return early before processing Up key.
- Boss brick (levels 2+) does NOT participate in the drop animation — it activates after the tween completes, same as now.

**Tween timing:**
- Column 0 starts at t=0ms, column 9 starts at t=360ms, last brick lands at ~760ms total.
- `introAnimating` must be `false` by default and reset to `false` in `resetBricks()`/`resetPowerUps()` cleanup.

**Physics bodies during tween:** Brick physics bodies must remain disabled during the tween (they are disabled for inactive bricks). Enable the body only after the tween completes for each brick. Add `onComplete` per brick to `brick.body.enable = true`.

---

## Section 5 — Ghost Ball Trail

When any ball's speed exceeds 420 px/s, render a ghost trail of 4 fading circles behind it.

**Implementation:**
- Add a `Graphics` object in `create()`: `this.trailGfx = this.add.graphics().setDepth(1)`.
- Add a position history per ball: each ball object gets a `trail = []` array (max length 4), populated each frame with `{ x, y }`.
- In `update()`, for each active ball:
  1. Compute speed: `Math.hypot(ball.body.velocity.x, ball.body.velocity.y)`
  2. Push `{ x: ball.x, y: ball.y }` to `ball.trail`, trim to last 4.
  3. If speed > 420: draw ghost circles from `ball.trail` with decreasing alpha:
     - Index 0 (oldest): alpha 0.15, radius = ball.radius - 1
     - Index 1: alpha 0.25
     - Index 2: alpha 0.40
     - Index 3 (newest behind ball): alpha 0.55
     - Color: same as ball's `fillColor`
  4. If speed ≤ 420: skip drawing for this ball (clear is done once per frame).
- Call `this.trailGfx.clear()` at the top of the trail drawing section each frame, then redraw.
- In `resetPowerUps()` / life-lost cleanup, call `this.trailGfx.clear()` and clear `ball.trail = []` on all balls.
- `ball.trail` initialized to `[]` in `activateBall()` and when new balls are created in `activateMultiBall()`.

---

## Section 6 — Boss Enrage

### 6a — Fire Rate Scales With HP

Replace the fixed `Phaser.Math.Between(3000, 4000)` interval with a formula based on current HP ratio.

**Formula:**
```js
const hpRatio = this.bossHp / this.bossMaxHp; // 1.0 = full, 0 = dead
const fireInterval = 1000 + Math.round(hpRatio * 2500); // 3500ms full → 1000ms at 1HP
this.bossFireTimer = fireInterval;
```

Apply this in both places where `bossFireTimer` is reset:
1. In `update()` after `fireBossBullet()` call.
2. Initial value in `activateBoss()` — set to `3500` (full HP, same as now).

### 6b — Spread Shot Below 25% HP

In `fireBossBullet()`, check if `this.bossHp / this.bossMaxHp < 0.25`. If so, fire 3 bullets instead of 1.

**Three-bullet spread:**
- Center bullet: velocity `(Phaser.Math.Between(-30, 30), 350)` — same as current but tighter random X
- Left bullet: apply a -25° angle offset to the downward direction → `vx = 350 * sin(-25°) ≈ -148`, `vy = 350 * cos(25°) ≈ 317`
- Right bullet: +25° → `vx ≈ +148`, `vy ≈ 317`

**Bullet pool:** The existing `enemyBullets` pool contains multiple bullets. Acquire 3 with `find(b => !b.active)` in a loop — if fewer than 3 are available, fire however many are free.

### 6c — Visual Enrage Cue

In `hitBoss()` and `shootBoss()`, after updating HP, tint the boss brick from gold toward orange-red:
```js
const pct = 1 - this.bossHp / this.bossMaxHp; // 0.0 full → 1.0 dead
// Interpolate gold (0xffcc00) → red-orange (0xff4400)
const r = 0xff;
const g = Math.round(0xcc * (1 - pct) + 0x44 * pct);
const b = Math.round(0x00);
this.bossBrick.setFillStyle((r << 16) | (g << 8) | b);
```

Replace the existing `darken()` call in `hitBoss()` and `shootBoss()` with this color interpolation.

---

## Edge Cases & Guards

- **Intro animation + boss:** Boss is activated via `activateBoss()` called from `applyPattern()`. Boss should only become visible after intro animation completes — defer `activateBoss()` call to the last tween's `onComplete` for levels ≥ 2.
- **`introAnimating` reset:** Must be set to `false` in the last-column tween's `onComplete`. Also initialize to `false` in `create()` and ensure `resetBricks()` doesn't leave it `true` if a level restart happens mid-animation (cancel pending tweens with `this.tweens.killAll()` at the start of `applyPattern()`).
- **Trail on deactivated balls:** Check `ball.active` before drawing trail. Clear `ball.trail` when a ball is deactivated.
- **`forcePowerUp` flag reset:** `applyPattern()` already recycles brick objects. Ensure `brick.forcePowerUp = false` is set in the default brick initialization loop so level 2+ bricks don't inherit a stale flag.
- **Bullet pool size for spread:** Current pool may have only 1-2 bullets available. Ensure the enemy bullet pool in `create()` has at least 6 bullets (currently check and increase if needed) so spread shots can always fire all 3.
- **Boss enrage color vs HP bar:** Both the fill color and the HP bar are updated on each hit. The new color interpolation replaces the old `darken()` call — ensure `drawBossHpBar()` is still called after the color update.
