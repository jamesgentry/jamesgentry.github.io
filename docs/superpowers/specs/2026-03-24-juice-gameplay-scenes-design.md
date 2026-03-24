# Juice, Gameplay Depth 2 & Scene Progression — Design Spec

**Date:** 2026-03-24
**Status:** Approved
**Specs:** C (Juice + Feel), D (Gameplay Depth 2), E (Scene Progression)

---

## Overview

Three sequential specs adding visual polish, new gameplay mechanics, and proper title/game-over screens to the Breakout game. All changes are in `js/app.js`. Spec E adds two new Phaser scenes (`TitleScene`, `GameOverScene`) to the same file.

**Implementation order:** C → D → E (each builds on the previous)

---

## Spec C: Juice + Feel

### Screen Shake Enhancement
- `hit(ball, brick)` currently has no camera effect — add `this.cameras.main.shake(150, 0.006)` on every ball-brick collision
- `explodeBrick()` already shakes at (200ms, 0.005) — increase to (300ms, 0.012) for more drama

### Color-Matched Particles
- Shrapnel pool uses white rectangles today
- In `explodeBrick()`, set each spawned particle's fill color to `brick.fillColor` (Phaser stores this on the Rectangle object)
- No pool size changes needed

### Paddle Pulse on Power-Up Collect
- In `collectPowerUp()`, after applying the effect, add a chained scale tween on `this.paddle`:
  - Scale to 1.15 over 80ms, then back to 1.0 over 120ms (two separate tweens chained via `onComplete`):
  ```js
  this.tweens.add({
    targets: this.paddle, scaleX: 1.15, scaleY: 1.15, duration: 80, ease: 'Quad.easeOut',
    onComplete: () => {
      this.tweens.add({ targets: this.paddle, scaleX: 1.0, scaleY: 1.0, duration: 120, ease: 'Quad.easeIn' });
    }
  });
  ```

### Rounded Paddle Visual
- Replace the paddle `Rectangle` visual with a `Phaser.GameObjects.Graphics` object (`this.paddleGfx`)
- The existing physics `Rectangle` (`this.paddle`) remains as the invisible hitbox — same dimensions, same position
- Each frame in `update()`, redraw `this.paddleGfx`:
  ```js
  this.paddleGfx.clear();
  this.paddleGfx.fillStyle(0xffffff);
  this.paddleGfx.fillRoundedRect(
    this.paddle.x - this.paddle.width / 2,
    this.paddle.y - 7.5,
    this.paddle.width, 15, 8
  );
  ```
- The physics Rectangle stays invisible (`setAlpha(0)` or `setVisible(false)` after creation)
- `shrinkPaddle()` and `resetPowerUps()` continue to resize the physics Rectangle; `paddleGfx` redraws automatically on the next frame

### Synthesized Sound Effects
- A `playTone(name)` helper accepts a sound name string and dispatches to an internal table of oscillator parameters. `this.sound.context` (Phaser's underlying `AudioContext`) is used to generate sounds via Web Audio API oscillator + gain nodes
- All sounds check `this.sound.mute` before playing — if muted, return immediately
- Internal dispatch table maps each name to `{ freq, type, duration, volume, freqEnd }` — callers always use the name form (e.g. `playTone('shield-hit')`)
- Eight sounds:

| Event | Freq | Type | Duration | Notes |
|---|---|---|---|---|
| `hit-brick` | 220Hz | square | 60ms | Short blip on ball-brick contact |
| `hit-paddle` | 180Hz | sine | 80ms | Softer thud on paddle bounce |
| `explode` | 80Hz→30Hz | sawtooth | 100ms | Falling pitch burst on brick death |
| `powerup` | 400→600Hz | sine | 150ms | Rising chime on power-up collect |
| `life-lost` | 440→110Hz | square | 400ms | Descending wail |
| `level-up` | 3-note fanfare | sine | 300ms | C5→E5→G5, 100ms each |
| `enemy-die` | 300Hz | square | 50ms | Short zap |
| `shield-hit` | 600→200Hz | triangle | 100ms | Metallic clang; called in `shieldHitByBall` and `shieldHitByBullet` |

- Call sites: `hit()` → hit-brick, `paddleHit()` → hit-paddle, `explodeBrick()` → explode, `collectPowerUp()` → powerup, `loseLife()` → life-lost, `resetBricks()` → level-up, `shootEnemy()` → enemy-die, `shieldHitByBall()` / `shieldHitByBullet()` → shield-hit. Note: the existing `enemyBulletHit()` and `enemyHitsPaddle()` do NOT play shield-hit — those handlers deal with the paddle, not the shield.

---

## Spec D: Gameplay Depth 2

### Combo Multiplier
- New scene state: `this.combo = 0`, `this.comboMultiplier = 1`
- `hit(ball, brick)`: `this.combo += 1`, recalculate `this.comboMultiplier = Math.min(Math.floor(this.combo / 2) + 1, 5)`
- `paddleHit(paddle, ball)`: if `this.combo > 0`, reset `this.combo = 0`, `this.comboMultiplier = 1`
- `loseLife()`: reset `this.combo = 0` and `this.comboMultiplier = 1` — combo does not carry across lives
- Score is **only awarded in `explodeBrick()` and `shootEnemy()`** — ball hits do not award points directly, only build combo. A ball-hit brick that falls off screen without being shot yields no score. This is intentional.
- Score in `explodeBrick()`: `this.score += 100 * this.comboMultiplier`
- Score in `shootEnemy()`: `this.score += enemy.pointValue * this.comboMultiplier`
- When multiplier increases above 1, show a floating text label ("x2", "x3"…) that appears center-screen for 800ms then fades — implemented as a single reusable text object (`this.comboText`) that is repositioned and alpha-tweened each time

### Magnet Power-Up
- New entry in `POWERUP_COLORS`: `magnet: 0x9933ff` (purple)
- New scene state: `this.magnetActive = false`
- `paddleHit(paddle, ball)`: if `this.magnetActive`, zero ball velocity and set `ball.startPos = true` instead of applying angle calculation — ball sticks to paddle
- Player releases with UP arrow (existing `releaseBall()` handles this)
- If multi-ball is active, all balls that hit the paddle while magnet is active stick
- When multiple balls are stuck and UP is pressed, `releaseBall()` launches them with spread angles to avoid identical trajectories. Y velocity is always `-this.ballSpeed`. X velocities for the three balls are `[-75, 75, -150]` — `releaseBall()` is fully rewritten as:
  ```js
  releaseBall() {
    const xOffsets = [-75, 75, -150];
    let i = 0;
    this.balls.forEach(ball => {
      if (ball.active && ball.startPos) {
        ball.startPos = false;
        ball.body.setVelocity(xOffsets[i] !== undefined ? xOffsets[i] : -75, -this.ballSpeed);
        i++;
      }
    });
  }
  ```
  Note: the existing `releaseBall()` calls `this.startText.setVisible(false)` and hides `this.legend`. These UI elements move to `TitleScene` in Spec E and must be removed from `releaseBall()` when implementing Spec E.
- `resetPowerUps()`: `this.magnetActive = false`
- `collectPowerUp()`: case `'magnet'` → `this.magnetActive = true`
- **`spawnPowerUp()` types array** must include `'magnet'` and `'shield'` alongside the existing five: `const types = ['wide', 'fast', 'multi', 'laser', 'life', 'magnet', 'shield']`
- The UP key release trigger in `update()` must use `Phaser.Input.Keyboard.JustDown(this.cursors.up)` instead of `this.cursors.up.isDown` to prevent `releaseBall()` firing on every frame while the key is held. With magnet active, a ball that re-sticks to the paddle while the player is still holding UP from a previous release would otherwise be launched involuntarily on the next frame.

### Shield Power-Up
- New entry in `POWERUP_COLORS`: `shield: 0x44ffff` (light cyan, distinct from wide's `0x00ffff`)
- New scene state: `this.shieldActive = false`, `this.shieldGfx` (Graphics), `this.shieldRect` (physics Rectangle, hidden)
- Shield positioned: full screen width, 6px tall, at `y = H - 8` (below the paddle's bottom edge, acting as a barrier between paddle and screen bottom). Note: the paddle center is at `y = H - 20` with height 15, so its bottom edge is at `H - 12.5`; the shield at `H - 8` sits clearly below it
- Visual: `this.shieldGfx.fillStyle(0x44ffff)` + `fillRoundedRect` with glow effect via a second semi-transparent wider rect behind it
- Two overlap colliders registered in `create()`. Phaser passes `(object1, object2)` in registration order:
  - `this.balls` vs `this.shieldRect` → `shieldHitByBall(ball, shieldRect)`: negate ball Y velocity if moving downward, deactivate shield
  - `this.enemyBullets` vs `this.shieldRect` → `shieldHitByBullet(enemyBullet, shieldRect)`: deactivate bullet, deactivate shield
- `collectPowerUp()`: case `'shield'` → activate `shieldRect` body, show `shieldGfx`, set `shieldActive = true`
- `resetPowerUps()`: deactivate shield
- `playTone('shield-hit')` called in both shield collision callbacks

### Brick HP System
- Each brick gets `brick.hp` and `brick.maxHp` properties, set in `applyPattern()` / `resetBricks()`
- **Level 1**: all bricks `hp = 1`
- **Level 2+**: HP assigned deterministically per level using `mulberry32(this.level)` seeded RNG (tiny 4-line implementation). Distribution:
  - Level 2: 80% 1HP, 20% 2HP
  - Level 3: 60% 1HP, 30% 2HP, 10% 3HP
  - Level 4+: 40% 1HP, 40% 2HP, 20% 3HP
- `hit(ball, brick)`:
  - Decrement `brick.hp`
  - If `brick.hp <= 0`: set `isFalling = true`, enable gravity (existing behavior). **The `if (!brick.isFalling) return` guard in `explodeBrick()` is intentional and must remain — it ensures only falling bricks are destroyed by bullets, not wall-mounted ones.**
  - If `brick.hp > 0`: apply damage visual — darken fill color, add crack Graphics overlay
- **Damage visual**:
  - Fill color darkened by 25% per hit using `Phaser.Display.Color.IntegerToColor(brick.fillColor).darken(25).color` — Phaser's `darken()` takes a percentage (0–100), so 25 gives a visible but gradual darkening per hit
  - Crack lines drawn on a **per-brick** `Phaser.GameObjects.Graphics` object — one Graphics instance per brick slot in the pool (60 total, created in `create()` alongside the brick pool). Each brick's Graphics is cleared/redrawn only when that brick takes a hit, and hidden when the brick is inactive
  - 1 hit taken: one diagonal line across the brick
  - 2 hits taken: two crossing diagonal lines
- `resetBricks()` / `applyPattern()`: clear each brick's Graphics, reassign HP, reset fill colors

### Updated Brick Patterns
Level 1 uses a T-shape. Levels 2–6 scale up in brick count with distinct layouts:

```js
// Level 1 — T-shape (28 bricks, all 1HP)
['1111111111',
 '1111111111',
 '0000110000',
 '0000110000',
 '0000110000',
 '0000110000']

// Level 2 — Diamond cluster (~38 bricks)
['0011111100',
 '0111111110',
 '1111111111',
 '0111111110',
 '0011111100',
 '0000000000']

// Level 3 — Chevron (~38 bricks)
['1000000001',
 '1100000011',
 '1110000111',
 '1111001111',
 '1111111111',
 '0111111110']

// Level 4 — Cross + border (~44 bricks)
['1111111111',
 '1000110001',
 '1011111101',
 '1011111101',
 '1000110001',
 '1111111111']

// Level 5 — Frame + fill (~48 bricks)
['1111111111',
 '1111111111',
 '1100000011',
 '1100000011',
 '1111111111',
 '1111111111']

// Level 6 — Full grid (60 bricks)
['1111111111',
 '1111111111',
 '1111111111',
 '1111111111',
 '1111111111',
 '1111111111']
```

Patterns cycle: level 7+ repeats from level 2 (level 1 T-shape is only used once).

---

## Spec E: Scene Progression

### Scene Architecture
- `js/app.js` game config `scene` array: `[TitleScene, MainState, GameOverScene]`
- `TitleScene` is the entry point (first in array)
- `MainState` → on game over, calls `this.scene.start('GameOverScene', { score, level, highScore })` instead of `scene.restart()`
- `GameOverScene` → on play again, calls `this.scene.start('TitleScene')`

### TitleScene
- Transparent canvas over existing CSS gradient body (same as gameplay)
- **"PRESS DOWN TO START"** — large Bungee Shade font, `setOrigin(0.5, 0)`, positioned at `(W/2, H * 0.35)`
- **"BEST: X"** — smaller Bungee Shade, `setOrigin(0.5, 0)`, positioned at `(W/2, H * 0.35 + 60)`, reads `localStorage.getItem('breakout_highscore') || 0`
- Input: `this.input.keyboard.once('keydown-DOWN', ...)` and `this.input.on('pointerdown', ...)` both call `this.scene.start('MainState')`
- Add `this.input.keyboard.addCapture(Phaser.Input.Keyboard.KeyCodes.DOWN)` in `TitleScene.create()` to prevent browser page scroll on DOWN keypress
- No background drawn — CSS gradient shows through transparent Phaser canvas

### GameOverScene
- Receives `{ score, level, highScore }` via `this.scene.settings.data`
- Displays centered:
  - **"GAME OVER"** — large Bungee Shade, `(W/2, H * 0.3)`
  - **"Score: X · Level Y reached"** — medium text, `(W/2, H * 0.3 + 60)`
  - **"NEW BEST!"** — gold text, only shown if `score > highScore` where `highScore` is the **pre-update** value passed in `scene.settings.data` (i.e. the high score before this game's `checkHighScore()` ran), `(W/2, H * 0.3 + 100)`. Note: update `restartGame()` to capture `highScore` before calling `checkHighScore()`: `const prevBest = parseInt(localStorage.getItem('breakout_highscore') || 0); this.checkHighScore(); this.scene.start('GameOverScene', { score: this.score, level: this.level, highScore: prevBest })`
  - **"PRESS DOWN TO PLAY AGAIN"** — smaller prompt, `(W/2, H * 0.3 + 150)`
- Input: DOWN arrow or pointer → `this.scene.start('TitleScene')`. Add `this.input.keyboard.addCapture(Phaser.Input.Keyboard.KeyCodes.DOWN)` to prevent browser scroll.
- `MainState.restartGame()` updated: capture `prevBest` before `checkHighScore()`, then transition. **Also remove the existing `this.checkHighScore()` call from `loseLife()` — `restartGame()` now owns this call.** Without removing it, `prevBest` would capture the already-updated high score and "NEW BEST!" would never show.
  ```js
  const prevBest = parseInt(localStorage.getItem('breakout_highscore') || 0);
  this.checkHighScore();
  this.scene.start('GameOverScene', { score: this.score, level: this.level, highScore: prevBest });
  ```

---

## New State Summary (all in MainState)

| Property | Type | Initial | Purpose |
|---|---|---|---|
| `this.combo` | number | 0 | Consecutive brick hits without paddle touch |
| `this.comboMultiplier` | number | 1 | Current score multiplier (1–5) |
| `this.comboText` | Text | hidden | Floating "x2" display |
| `this.magnetActive` | boolean | false | Magnet power-up active |
| `this.shieldActive` | boolean | false | Shield power-up active |
| `this.shieldGfx` | Graphics | — | Shield visual |
| `this.shieldRect` | Rectangle | — | Shield physics hitbox |
| `this.paddleGfx` | Graphics | — | Rounded paddle visual |
| `this.brickCrackGfx[]` | Graphics[60] | — | Per-brick crack overlays (one per brick slot) |

## New Power-Up Types

| Type | Color | Effect |
|---|---|---|
| `magnet` | `0x9933ff` purple | Ball sticks to paddle on contact; release with UP |
| `shield` | `0x44ffff` light cyan | One-hit barrier line at `y = H - 8` (8px above screen bottom, below paddle) |

---

## Files Changed
- `js/app.js` — all changes (new scenes appended, `MainState` extended)
- `.gitignore` — add `.superpowers/` if not already present
