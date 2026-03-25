# Spec: Ball Nudge + Explosive Flash Animation
**Date:** 2026-03-25
**Project:** jamesgentry.github.io breakout game (`js/app.js`)

---

## Overview

Two independent gameplay improvements:

1. **Ball Nudge** — Pinball-style Shift+Left/Right input applies a horizontal impulse to all active balls, letting the player influence ball trajectory.
2. **Explosive Brick Flash** — Explosive bricks play a white-flash animation before disappearing, making them visually distinct and telegraphing chain reactions.

---

## Context

- Single-file Phaser 3.90.0 game: `js/app.js`, class `MainState extends Phaser.Scene`
- Balls are `Phaser.GameObjects.Arc` with Arcade Physics bodies, stored in `this.balls[]`
- Keyboard input managed via `this.cursors` (createCursorKeys) and individual `addKey` calls
- Explosive bricks have `brick.isExplosive = true`, colored `0xff6600`, assigned from level 2+ at 15% chance
- `triggerExplosion(brick)` handles chain detonation; `hitBrick` handles direct ball hits
- `brickCrackGfx[]` graphics objects share indices with `brickObjects[]`
- Constants: `BOX_W=46`, `BOX_H=26`, `BALL_RADIUS=9`, `COLS=10`, `ROWS=6`

---

## Feature 1: Ball Nudge

### Input
- `this.shiftKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT)`
- Add `Phaser.Input.Keyboard.KeyCodes.SHIFT` to the `addCapture` list

### State
- `this.nudgeCooldown = 0` — timestamp of last nudge, initialized in `create()`

### Behavior (in `update(time, delta)`)
- Condition: `this.shiftKey.isDown && (this.cursors.left.isDown || this.cursors.right.isDown)`
- Gate: `time - this.nudgeCooldown >= 500` (500ms cooldown)
- Apply `±160` px/s to `ball.body.velocity.x` for all `ball.active && !ball.startPos` balls
  - Left: subtract 160; Right: add 160
- `this.cameras.main.shake(80, 0.003)`
- Update: `this.nudgeCooldown = time`
- No effect if all balls are on the paddle (`startPos === true`) or no balls active

### Reset
- `this.nudgeCooldown = 0` in `resetPowerUps()` (called on life loss and level reset)

---

## Feature 2: Explosive Brick Flash Animation

### New helper: `flashThenDeactivate(brick, idx)`

Plays the flash sequence, then deactivates the brick. Called in place of the current immediate fallaway for explosive bricks only.

**Steps:**
1. `brick.isFalling = true` — re-entry guard (must be set before any async steps)
2. `brick.body.enable = false` — disable physics immediately so ball passes through
3. `if (this.brickCrackGfx[idx]) this.brickCrackGfx[idx].clear()` — clear marker gfx
4. Run 6-step color-toggle sequence using `this.time.delayedCall`, each step 100ms apart:
   - Steps 1, 3, 5 (odd): `brick.setFillStyle(0xffffff)` — white
   - Steps 2, 4, 6 (even): `brick.setFillStyle(originalColor)` — restore (captured before sequence starts as `brick.fillColor`)
   - After step 6: `brick.setActive(false).setVisible(false)` — deactivate
5. Total duration: ~600ms

**Implementation note:** Use a recursive `delayedCall` pattern:
```js
flashThenDeactivate(brick, idx) {
  brick.isFalling = true;
  brick.body.enable = false;
  if (this.brickCrackGfx[idx]) this.brickCrackGfx[idx].clear();
  const origColor = brick.fillColor;
  let step = 0;
  const doStep = () => {
    step++;
    brick.setFillStyle(step % 2 === 1 ? 0xffffff : origColor);
    if (step < 6) {
      this.time.delayedCall(100, doStep);
    } else {
      brick.setActive(false).setVisible(false);
    }
  };
  doStep();
}
```

### Changes to `triggerExplosion(brick)`

When `neighbor.hp <= 0`:
- **If `neighbor.isExplosive`:**
  - Call `this.triggerExplosion(neighbor)` immediately (chain fires now, parallel to flash)
  - Call `this.flashThenDeactivate(neighbor, nidx)` — flash then deactivate
  - Do NOT set `body.setImmovable(false)` or `body.setAllowGravity(true)` (body is disabled instead)
- **If NOT `neighbor.isExplosive`:**
  - Existing behavior unchanged: `isFalling=true`, `body.setImmovable(false)`, `body.setAllowGravity(true)`, falls off-screen

**Guard:** `flashThenDeactivate` sets `isFalling=true` as its first step — the existing `if (!neighbor.active || neighbor.isFalling) return` guard in the loop prevents double-processing.

### Changes to `hitBrick(ball, brick)`

When `brick.hp <= 0` and `brick.isExplosive`:
- Call `this.triggerExplosion(brick)` (chain — unchanged)
- Replace the current immediate deactivation with `this.flashThenDeactivate(brick, idx)`
- Do NOT call `body.setImmovable(false)` / `body.setAllowGravity(true)` on the hit brick

When `brick.hp <= 0` and NOT explosive: existing fallaway behavior unchanged.

---

## What Does NOT Change

- Non-explosive bricks destroyed by chain (`neighbor.isExplosive === false`, `hp <= 0`): still fall via gravity, no flash
- Normal (non-explosive) brick hits: unchanged
- All other power-ups, boss, time slow, big ball: unaffected
- `resetPowerUps()` does not need to handle in-flight flash timers — `this.time.delayedCall` callbacks check `brick.active` is no longer valid on scene restart, but Phaser clears all pending timers on scene shutdown/restart automatically

---

## Out of Scope

- Nudge sound effect (no new audio assets)
- Nudge affecting bricks or the paddle
- Flash on non-explosive bricks
- Variable nudge strength
