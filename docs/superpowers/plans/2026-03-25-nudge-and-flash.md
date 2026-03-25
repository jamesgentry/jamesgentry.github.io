# Ball Nudge + Explosive Flash Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add pinball-style Shift+Arrow ball nudge and a white-flash animation for explosive bricks before they detonate.

**Architecture:** Both features are self-contained changes to `js/app.js`. Nudge adds input handling in `create()` and `update()`. Flash adds a new helper method `flashThenDeactivate()` and modifies two existing methods (`hit` and `triggerExplosion`).

**Tech Stack:** Phaser 3.90.0, single-file game (`js/app.js`), no build step — edit and reload.

---

## File Map

- **Modify:** `js/app.js` — all changes are in this single file
  - `TitleScene.create()` — update controls hint text (line ~138)
  - `MainState.create()` — add `shiftKey`, `nudgeCooldown`, SHIFT capture (lines ~341–352)
  - `MainState.update()` — add nudge logic after paddle movement (lines ~545–552)
  - `MainState.resetPowerUps()` — reset nudge cooldown (line ~1397)
  - `MainState.hit()` — replace immediate deactivation with `flashThenDeactivate` for explosive bricks (lines ~768–777)
  - `MainState.triggerExplosion()` — replace gravity fallaway with `flashThenDeactivate` for explosive neighbors (lines ~1061–1067)
  - Add new method: `MainState.flashThenDeactivate(brick, idx)`

---

## Task 1: Ball Nudge — Input Setup

**Files:**
- Modify: `js/app.js` (TitleScene ~line 138, MainState keyboard setup ~lines 341–352)

- [ ] **Step 1.1: Update controls hint in TitleScene**

In `TitleScene.create()`, find the controls text line (~line 138):
```js
this.add.text(W / 2, belowLegendY + 24, '← → move  ·  ↑ launch  ·  SPACE laser  ·  R restart', {
```
Replace with:
```js
this.add.text(W / 2, belowLegendY + 24, '← → move  ·  ↑ launch  ·  SPACE laser  ·  SHIFT+← → nudge  ·  R restart', {
```

- [ ] **Step 1.2: Add shiftKey and nudgeCooldown in MainState.create()**

In `MainState.create()`, after the line `this.musicKey = this.input.keyboard.addKey(...)` (~line 343), add:
```js
this.shiftKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);
this.nudgeCooldown = 0;
```

- [ ] **Step 1.3: Add SHIFT to keyboard capture list**

In `MainState.create()`, in the `addCapture` array (~lines 346–352), add `SHIFT`:
```js
this.input.keyboard.addCapture([
  Phaser.Input.Keyboard.KeyCodes.SPACE,
  Phaser.Input.Keyboard.KeyCodes.UP,
  Phaser.Input.Keyboard.KeyCodes.DOWN,
  Phaser.Input.Keyboard.KeyCodes.LEFT,
  Phaser.Input.Keyboard.KeyCodes.RIGHT,
  Phaser.Input.Keyboard.KeyCodes.SHIFT,
]);
```

- [ ] **Step 1.4: Verify in browser — no errors on load**

Open preview. Check console for errors. Title screen should still display correctly with the updated controls hint showing `SHIFT+← → nudge`.

- [ ] **Step 1.5: Commit**
```bash
git add js/app.js
git commit -m "feat: add nudge input setup — shiftKey, nudgeCooldown, SHIFT capture, controls hint"
```

---

## Task 2: Ball Nudge — update() Logic + Reset

**Files:**
- Modify: `js/app.js` (`update()` ~line 552, `resetPowerUps()` ~line 1414)

- [ ] **Step 2.1: Add nudge logic in update()**

In `MainState.update()`, after the paddle movement block (after `this.paddle.body.setVelocityX(0)`, ~line 552), add:
```js
// Nudge (Shift+Left/Right): apply horizontal impulse to active balls
if (this.shiftKey.isDown && (this.cursors.left.isDown || this.cursors.right.isDown)) {
  if (time - this.nudgeCooldown >= 500) {
    const dir = this.cursors.left.isDown ? -1 : 1;
    this.balls.forEach(ball => {
      if (ball.active && !ball.startPos) {
        ball.body.velocity.x += dir * 160;
      }
    });
    this.cameras.main.shake(80, 0.003);
    this.nudgeCooldown = time;
  }
}
```

- [ ] **Step 2.2: Reset nudgeCooldown in resetPowerUps()**

In `MainState.resetPowerUps()` (~line 1397), add after the first line:
```js
this.nudgeCooldown = 0;
```

- [ ] **Step 2.3: Verify nudge in browser**

Load the game. Start a round. Hold Shift+Left — ball should kick left. Hold Shift+Right — ball should kick right. Should not fire more than once per 500ms. Balls on the paddle (not yet launched) should not be affected.

- [ ] **Step 2.4: Commit**
```bash
git add js/app.js
git commit -m "feat: implement ball nudge — Shift+Arrow applies 160px/s impulse with 500ms cooldown"
```

---

## Task 3: Explosive Flash — flashThenDeactivate() helper

**Files:**
- Modify: `js/app.js` (add new method near `drawExplosiveMarker`, ~line 1027)

- [ ] **Step 3.1: Add flashThenDeactivate() method**

In `MainState`, add the following method after `drawExplosiveMarker()` (~line 1047):
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
  doStep(); // step 1 fires immediately (brick turns white at t=0)
}
```

- [ ] **Step 3.2: Verify no syntax errors**

Reload in browser. Game should load without console errors. No gameplay change yet.

- [ ] **Step 3.3: Commit**
```bash
git add js/app.js
git commit -m "feat: add flashThenDeactivate() helper — 3-flash white animation then deactivate"
```

---

## Task 4: Explosive Flash — Wire into hit()

**Files:**
- Modify: `js/app.js` (`hit()` ~lines 768–777)

- [ ] **Step 4.1: Update hit() for explosive brick direct hits**

In `MainState.hit()`, find the `if (brick.hp <= 0)` block (~lines 768–777):
```js
// CURRENT:
const idx = this.brickObjects.indexOf(brick);
if (this.brickCrackGfx && this.brickCrackGfx[idx]) {
  this.brickCrackGfx[idx].clear();
}
brick.isFalling = true;
brick.body.setImmovable(false);
brick.body.setAllowGravity(true);
if (brick.isExplosive) this.triggerExplosion(brick);
```

Replace with:
```js
// NEW:
const idx = this.brickObjects.indexOf(brick);
if (brick.isExplosive) {
  this.triggerExplosion(brick);
  this.flashThenDeactivate(brick, idx);
} else {
  if (this.brickCrackGfx && this.brickCrackGfx[idx]) {
    this.brickCrackGfx[idx].clear();
  }
  brick.isFalling = true;
  brick.body.setImmovable(false);
  brick.body.setAllowGravity(true);
}
```

**Important:** `flashThenDeactivate` sets `isFalling=true` and `body.enable=false` internally, so do NOT set those before calling it on explosive bricks. Non-explosive bricks keep the original fallaway path.

- [ ] **Step 4.2: Verify in browser**

Start a game. Reach level 2 (explosive bricks appear). Hit an explosive brick — it should flash white 3 times then disappear (~500ms), while chain reactions fire immediately on neighbors. Non-explosive brick hits should still fall as before.

- [ ] **Step 4.3: Commit**
```bash
git add js/app.js
git commit -m "feat: flash explosive bricks on direct hit before deactivating"
```

---

## Task 5: Explosive Flash — Wire into triggerExplosion()

**Files:**
- Modify: `js/app.js` (`triggerExplosion()` ~lines 1061–1067)

- [ ] **Step 5.1: Update triggerExplosion() for explosive chain neighbors**

In `MainState.triggerExplosion()`, find the `if (neighbor.hp <= 0)` block (~lines 1061–1067):
```js
// CURRENT:
if (neighbor.hp <= 0) {
  const nidx = this.brickObjects.indexOf(neighbor);
  if (this.brickCrackGfx[nidx]) this.brickCrackGfx[nidx].clear();
  neighbor.isFalling = true; // set BEFORE recursive call — prevents re-entry on same brick
  neighbor.body.setImmovable(false);
  neighbor.body.setAllowGravity(true);
  if (neighbor.isExplosive) this.triggerExplosion(neighbor); // chain
}
```

Replace with:
```js
// NEW:
if (neighbor.hp <= 0) {
  const nidx = this.brickObjects.indexOf(neighbor);
  if (neighbor.isExplosive) {
    if (this.brickCrackGfx[nidx]) this.brickCrackGfx[nidx].clear();
    this.triggerExplosion(neighbor); // chain fires immediately
    this.flashThenDeactivate(neighbor, nidx); // flash then deactivate (sets isFalling + disables body)
  } else {
    if (this.brickCrackGfx[nidx]) this.brickCrackGfx[nidx].clear();
    neighbor.isFalling = true;
    neighbor.body.setImmovable(false);
    neighbor.body.setAllowGravity(true);
  }
}
```

**Note:** `flashThenDeactivate` sets `isFalling=true` as its first step, which is what prevents re-entry on recursive calls — same guard as before, just moved inside the helper.

- [ ] **Step 5.2: Verify chain flash in browser**

Reach level 2. Hit an explosive brick adjacent to another explosive brick. Both should flash simultaneously (cascading parallel flashes). Non-explosive bricks destroyed by chain should still fall as before. Level should not advance until all flashing bricks finish their animation.

- [ ] **Step 5.3: Commit**
```bash
git add js/app.js
git commit -m "feat: flash explosive chain neighbors before deactivating"
```

---

## Verification Checklist

After all tasks, confirm:

- [ ] Nudge: Shift+Left kicks ball left; Shift+Right kicks ball right
- [ ] Nudge: No effect on ball sitting on paddle before launch
- [ ] Nudge: 500ms cooldown prevents rapid-fire (hold Shift+Left — should only nudge every ~0.5s)
- [ ] Nudge: Title screen shows updated controls hint with `SHIFT+← → nudge`
- [ ] Flash: Explosive bricks flash white 3× before disappearing (~500ms)
- [ ] Flash: Chain explosions fire immediately (parallel flashes on neighboring explosives)
- [ ] Flash: Non-explosive bricks destroyed by chain still fall via gravity (no flash)
- [ ] Flash: Normal (non-explosive) brick direct hits still fall via gravity (no flash)
- [ ] Flash: Level does not advance mid-flash sequence
