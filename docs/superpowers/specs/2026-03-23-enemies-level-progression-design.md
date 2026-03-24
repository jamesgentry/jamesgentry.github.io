# Spec B: Enemies + Level Progression

**Date:** 2026-03-23
**Depends on:** Spec A (power-ups + multi-ball) must be implemented first — this spec reuses `brickVsPaddle()` for paddle shrink logic.

---

## Context

The Breakout game (Phaser 3.90.0, single file `js/app.js`) currently loops infinitely when bricks are cleared. This spec introduces level progression (ball speed scaling, level counter) and three enemy types that spawn from Level 3 onward, plus an enemy bullet system. All changes are in `js/app.js`.

---

## 1. Architecture Overview

**New state on the scene:**
- `this.level` — integer starting at 1, increments when all bricks cleared
- `this.ballSpeed` — replaces hardcoded `300`; scaled per level (base 300, +20/level, cap 500)
- `this.levelText` — "Level: N" displayed in UI
- `this.enemies[]` — pool of 30 enemy rectangles, type-driven behavior
- `this.enemyBullets[]` — pool of 20 enemy projectile rectangles
- `this.formationDir` — `1` or `-1`, shared direction for all formation movers

**File modified:** `js/app.js` only.

---

## 2. Level Progression

**Level advancement:** `resetBricks()` is extended to also:
1. Increment `this.level`
2. Update `this.levelText`
3. Increase `this.ballSpeed = Math.min(this.ballSpeed + 20, 500)`
4. Call `this.spawnEnemies()` if `this.level >= 3`

**Ball speed:** `this.ballSpeed` (base 300) replaces the hardcoded `-300` Y velocity in `releaseBall()` (the ball launch force). The pre-launch X drift in `activateBall(startPos=true)` stays fixed at `300` and is not scaled. Spec A adds `activateBall()` and `releaseBall()` — this spec updates their velocity values to use `this.ballSpeed`.

Specifically, in `releaseBall()`:
```js
// Old (Spec A): ball.body.setVelocity(-75, -300);
// New (Spec B): ball.body.setVelocity(-75, -this.ballSpeed);
```

**Level display:** `this.levelText` positioned center-top (e.g. `W/2, 10`), `setOrigin(0.5, 0)`.

**Level-to-enemy mapping:**

| Level | Enemies spawned |
|---|---|
| 1–2 | None |
| 3 | 4 dive-bombers |
| 4 | 3 dive-bombers + 3 wanderers |
| 5+ | 2 dive-bombers + 2 wanderers + 5 formation movers |

---

## 3. Enemy Pool

**Pool:** 30 rectangles, `18×18px` each, pre-created in `create()`, all inactive.

**Per-enemy properties:**
- `type`: `'diver'` | `'wander'` | `'formation'`
- `angle`: initial random value; accumulated per frame for sine oscillation (wanderers)
- `fireTimer`: ms until next shot; randomized on spawn
- `pointValue`: 50 (diver) | 75 (wander) | 100 (formation)

**Colors:**
| Type | Color |
|---|---|
| Dive-bomber | `0xff6600` orange |
| Wanderer | `0xaa00ff` purple |
| Formation mover | `0xff0044` red |

**`spawnEnemies(level)`:** Reset `this.formationDir = 1` at the start of every call. Activates enemies from the pool per the level table above:

- **Dive-bombers:** evenly spaced across `x = 80` to `W-80`, `y = -30`
- **Wanderers:** same X range, `y = -60` (staggered above divers)
- **Formation movers:** 5 evenly spaced across center 60% of screen width, `y = 40`

Each enemy on spawn:
- `setFillStyle(color)`
- `body.reset(x, y)`
- `body.setAllowGravity(false)`
- `fireTimer = Phaser.Math.Between(2000, 5000)` (ms)
- `angle = Math.random() * Math.PI * 2` (wanderers only)

---

## 4. Enemy Movement (called from `update()` as `updateEnemies(delta)`)

### Dive-bombers (`'diver'`)
Set `body.setVelocityY(120)` once on activation. No per-frame update needed — physics handles constant descent.

### Wanderers (`'wander'`)
Per-frame sine-wave oscillation:
```js
enemy.angle += delta * 0.003;
enemy.body.setVelocity(
  Math.sin(enemy.angle) * 150, // oscillate left/right
  80                            // constant descent
);
```

### Formation movers (`'formation'`)
All formation enemies share `this.formationDir`. Per-frame:
```js
const speed = 60 + this.level * 5;
enemy.body.setVelocityX(this.formationDir * speed);
```

Edge check (once per frame, not per enemy). Use `body.reset()` to teleport enemies away from the edge on flip — this prevents the condition from being true on the next frame and avoids repeated flipping:
```js
const W = this.scale.width;
const anyAtEdge = this.enemies.some(e =>
  e.active && e.type === 'formation' && (e.x < 50 || e.x > W - 50)
);
if (anyAtEdge) {
  this.formationDir *= -1;
  this.enemies.forEach(e => {
    if (e.active && e.type === 'formation') {
      // Teleport inward + descend to clear the edge condition immediately
      const clampedX = Phaser.Math.Clamp(e.x, 60, W - 60);
      e.body.reset(clampedX, e.y + 15);
    }
  });
}
```

### Out-of-bounds cleanup
In `update()`, deactivate enemies that exit the screen at the bottom (no paddle hit):
```js
if (enemy.active && enemy.y > H + 30) {
  enemy.setActive(false).setVisible(false);
  enemy.body.enable = false;
}
```

---

## 5. Enemy Firing

In `updateEnemies(delta)`, per active enemy:
```js
enemy.fireTimer -= delta;
if (enemy.fireTimer <= 0) {
  this.fireEnemyBullet(enemy.x, enemy.y);
  enemy.fireTimer = Phaser.Math.Between(3000, 6000);
}
```

**`fireEnemyBullet(x, y)`:**
```js
fireEnemyBullet(x, y) {
  const b = this.enemyBullets.find(b => !b.active);
  if (!b) return;
  b.setActive(true).setVisible(true);
  b.body.enable = true;
  b.body.reset(x, y);
  b.body.setVelocityY(400);
}
```

**Enemy bullet pool:** 20 rectangles `4×12px`, `0xffff00` yellow, `setAllowGravity(false)`.

**Enemy bullet cleanup in `update()`:** deactivate if `y > H + 20`.

---

## 6. Interactions & Colliders (registered once in `create()`)

**Use the same plain-array pattern as existing pools** (`bulletObjects`, `brickObjects`). Phaser 3's `physics.add.overlap` accepts arrays of physics-enabled game objects; inactive bodies (`body.enable = false`) are automatically skipped.

```js
// Player bullets kill enemies
this.physics.add.overlap(this.bulletObjects, this.enemies, this.shootEnemy, null, this);

// Enemy bullets shrink paddle
this.physics.add.overlap(this.enemyBullets, this.paddle, this.enemyBulletHit, null, this);

// Enemy body hitting paddle: destroy enemy + shrink paddle
this.physics.add.overlap(this.enemies, this.paddle, this.enemyHitsPaddle, null, this);
```

**Callbacks:**

```js
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
  // ⚠️ Requires Spec A: brickVsPaddle() must be implemented before this runs.
  // Passing null for brick is safe — brickVsPaddle() only uses the paddle parameter.
  this.brickVsPaddle(null, paddle);
}

enemyHitsPaddle(enemy, paddle) {
  enemy.setActive(false).setVisible(false);
  enemy.body.enable = false;
  // ⚠️ Requires Spec A: same dependency as above.
  this.brickVsPaddle(null, paddle);
}
```

---

## 7. Scene Restart + Level Reset

`restartGame()` calls `this.scene.restart()`. In `create()`, `this.level = 1` and `this.ballSpeed = 300`. No extra reset needed — scene restart re-initializes all state.

**`resetBricks()` call order** — the extended method must follow this sequence to avoid spawning enemies that are immediately cleared:
1. Reset/reactivate all bricks
2. Increment level, update `levelText`
3. Scale `ballSpeed`
4. **Deactivate all enemies and enemy bullets** (clear the old wave)
5. Call `spawnEnemies(this.level)` if `this.level >= 3`

Deactivation code for step 4:
```js
this.enemies.forEach(e => {
  if (e.active) { e.setActive(false).setVisible(false); e.body.enable = false; }
});
this.enemyBullets.forEach(b => {
  if (b.active) { b.setActive(false).setVisible(false); b.body.enable = false; }
});
```

---

## 8. Verification

1. Levels 1–2: no enemies, pure Breakout. Level counter shows in UI.
2. Clear bricks → level increments, ball launch speed (Y velocity) increases slightly
3. Level 3: 4 orange dive-bombers appear, fly straight down
4. Level 4: orange divers + purple wanderers (zigzag motion)
5. Level 5: divers + wanderers + red formation row (side-to-side, descending on edge)
6. Shoot an enemy with SPACE → it disappears, score increments (+50/75/100 by type)
7. Enemy fires yellow projectile downward → hits paddle → paddle shrinks
8. Enemy reaches paddle → enemy disappears + paddle shrinks
9. Enemy misses paddle, exits bottom → just disappears (no life penalty)
10. Clear bricks mid-level → enemies/enemy bullets cleared, next level starts
11. Lose all lives → game restarts at level 1, ball speed resets to 300
