# User Interface & Tuning Panel

Source: [`src/ui/ControlStrips.ts`](../src/ui/ControlStrips.ts), [`src/ui/TouchControls.ts`](../src/ui/TouchControls.ts), [`src/ui/HUD.ts`](../src/ui/HUD.ts), [`src/ui/SettingsModal.ts`](../src/ui/SettingsModal.ts), [`index.html`](../index.html), [`index.css`](../index.css)

## Control Strips (`ControlStrips.ts`)

`createStrip(player, ids, flip, getGame)` wires one player's control strip (`#cue` for P1, `#cue2` for P2, flipped/rotated for the top seat) to their `LauncherPlayer` state:
- Angle (`-90..90`) and strength (`0..1`) `<input type="range">` sliders, kept in sync both ways (`sync()` pushes model → DOM, the `input` listener pushes DOM → model).
- `dragArea` binds pointer events over a wrapping area (`aimarea`/`powerarea`) so dragging anywhere in that strip region — not just on the thin native slider track — adjusts the corresponding value; `flip` inverts the drag direction for the rotated top strip.
- Two small canvas "chips" (`chipNow`/`chipNext`) preview the next two balls in the launcher's 3-ball deck, repainted only when the deck contents or `showLabels` actually change (`chipKey` memoization) rather than every frame.
- `refresh()` also toggles an `.idle` class on the strip when it isn't that player's turn (two-player mode), which `index.css` uses to dim the inactive player's controls.

## Touch/Pointer Aiming (`TouchControls.ts`)

`setupTouchControls` lets a player aim by dragging anywhere on the game canvas itself, as an alternative/addition to the slider strips:
- `playerForTouch` routes a touch to the bottom or top player by which half of the canvas it started in (two-player mode only; solo mode always targets player 1).
- Each active pointer is tracked in an `owners` map so multiple simultaneous touches (two-player, two hands) each drive their own launcher without interfering, using native Pointer Capture (`setPointerCapture`) to keep receiving move/up events even if the finger leaves the canvas bounds.
- On release, one final `aimAt` call locks in the last-dragged angle/strength as the launcher's throw parameters for when its turn timer fires.

## HUD (`HUD.ts`)

- `updateHUD` refreshes the live ball/group counters (`#counts`) and, if the "damage panel" knob is on, the `#hud` stat block (biggest single burst, clusters burst, balls destroyed this match).
- `endMatchUI` builds the end-of-match scorecard(s): a score headline (for solo mode) or win/lose/draw headline (for two-player mode) and a per-player point breakdown table (connections/bursts/knocked-loose), rendered into `#overcard1`/`#overcard2` (the second only shown in two-player/AI modes) and revealed via the `#over` overlay. Its "Play again" buttons re-invoke the `newMatch` callback passed in from `main.ts`.

## Tuning Panel (`SettingsModal.ts`, `#panel` in `index.html`)

Accessible via the **Adjust** button. `setupSettingsKnobs` wires every `<input>`/`<select>` in the panel to a live setter via a shared `knob(id, apply, show, wakesAudio?)` helper — each knob applies immediately to `PhysicsConfig`, `AudioStore`, or `Game` and updates its own `<output>` readout, so changes take effect on the very next frame/physics step without needing to restart a match.

| Section | Knob id | Applies to | Notes |
| :--- | :--- | :--- | :--- |
| Rules | `specials` | `Rules.SPECIALS` | Enables black/white special balls |
| | `colours` | `Rules.COLORS` | 3–6 colors; re-colors every existing ball/group/deck slot in place |
| | `labels` | `Game.showLabels` | Numeric ball labels (color-blind accessibility) |
| | `stats` | `Game.showStats` | Shows/hides the damage HUD block |
| | `match` | `Game.matchLen` | Match duration, 1:00–20:00; 0 (harness only) = endless |
| | `size` | `PhysicsConfig.R` | Ball radius; recomputes every group's inertia |
| | `rain` | `Game.rainInterval` | Manual "ball rain" interval; 0 = automatic low-density mode |
| | `shotdecay` | `Rules.SHOT_DECAY` | "repeat hits pay": each further scoring event from one throw pays this fraction of the last; 1 = no decay. See [scoring.md](./scoring.md) |
| Motion | `roll` | `PhysicsConfig.DRAG` | Per-second velocity retention (friction) |
| | `bounce` | `PhysicsConfig.REST`/`REST_WALL` | Ball and wall restitution (wall = 0.8× ball) |
| | `spin` | `PhysicsConfig.SPIN` | Angular velocity coefficient |
| | `kick` | `PhysicsConfig.KICK` | Launch speed multiplier |
| | `reload` | `Game.reloadTime` | Turn/reload cooldown |
| Breaking | `burst` | `PhysicsConfig.BURST_AT` | Shatter threshold as a fraction of the throw-speed range |
| | `maxpower` | `PhysicsConfig.THROW_MAX` | Max launch speed |
| | `kickout` | `PhysicsConfig.KICKOUT_FRAC` | Ejection speed fraction for peeled/burst balls |
| | `spread` | `PhysicsConfig.GHOST_SPREAD_HI` | Ghost ball ejection spread multiplier |
| | `speedcap` | `PhysicsConfig.SPEED_CAP` | Absolute group speed ceiling |
| | `minburst` | `PhysicsConfig.MIN_BURST` | Minimum cluster size eligible to burst (vs. always peel) |
| Sound | `scale` | `AudioStore.scale` | Musical scale for note synthesis |
| | `vol` | `AudioStore.volume` | Master volume |
| | `lock` / `brk` / `burstvol` | `AudioStore.lockVol`/`breakVol`/`burstVol` | Per-event-type volume |
| | `clicks` | `AudioStore.clickVol` | Wall/launch thud volume |
| | `drone` | `AudioStore.drone` | Ambient binaural drone volume |

`burst` and `kickout` also call `recalcThresholds`/update the "breakout / chain" readout (`chainPercent`) since they affect the derived `SHATTER_SPEED`/`KICKOUT_MAX` thresholds described in [physics-engine.md](./physics-engine.md#config-configts).

## Settings Export

The panel's **Copy these settings** button (wired in `main.ts`) calls `Settings.settingsLine()` and writes the result into a read-only textarea plus the clipboard (`navigator.clipboard.writeText`) — see [game-mechanics.md](./game-mechanics.md#settings-export-settingsts).
