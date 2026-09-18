# Rendering & Visual Effects

Source: [`src/graphics/Renderer.ts`](../src/graphics/Renderer.ts), [`src/graphics/Sprites.ts`](../src/graphics/Sprites.ts), [`src/graphics/VisualFX.ts`](../src/graphics/VisualFX.ts)

## Dual-Canvas Architecture

Two canvases are composited every frame (`Renderer.createRenderContext`/`drawGame`):

- **Low-res offscreen background (`bg`)** — sized to `W/BG_SCALE × H/BG_SCALE` (`BG_SCALE = 7`), redrawn by `VisualFX.drawLiquid`, then stretched back up over the foreground with the canvas's own bilinear scaling. This is what produces the soft, blurred "liquid" glow without ever running an actual blur filter.
- **High-DPI foreground (`c`)** — sized to the CSS pixel size × `devicePixelRatio` (capped at 3×) and holds every high-frequency draw: ball sprites, bond lines, ripple flashes, launcher indicators, score pop text, and the score/clock HUD text.

`resizeRenderer(rc, stageEl)` recomputes both canvas backing-store sizes from the stage element's bounding rect (bailing out if nothing changed), resets the foreground context transform for the new DPR, and updates `PhysicsConfig.SC` — the screen-size scale factor that keeps throw speed/burst thresholds feeling consistent across window sizes.

## Per-Frame Draw Order (`drawGame`)

1. `VisualFX.drawLiquid` into the offscreen `bg` canvas (currents, ball glows, flash ripples), then blit it to the foreground.
2. A subtle top/bottom tint gradient over the active player's half, in two-player mode.
3. Bond lines between bonded balls: a wide colored wash gradient (each end tinted by its ball's color) plus a thin white core stroke, drawn with `'lighter'` blending so overlapping bonds glow brighter.
4. Ripple rings for recent `flashes` — a wobbly polygon (`sin` perturbation around a circle) that expands and fades over ~0.85s.
5. Ball sprites (cached, see below) — ghosts drawn at reduced, decaying alpha with a soft white outline; grouped (bonded) balls get a thicker white sprite ring baked into the sprite itself; rain balls fade in via `getRainBallAlpha`.
6. Optional numeric labels per ball (`showLabels` knob), using `inkOn(color)` for contrast-safe text color.
7. A center dashed divider line in two-player mode.
8. `drawLaunchers` — the keep-out dome, reload-progress arc, loaded-ball preview sprite, and a dashed aim vector with an arrowhead sized by `strength`.
9. `drawPops` — floating `+N` score text that rises and fades over 1.1s, rotated 180° for player 2's pops so they read correctly from that side of the screen.
10. `drawScores` — per-player score text and the match clock, mirrored/rotated for player 2's seat.

## Sprite Caching (`Sprites.ts`)

Canvas gradient/arc drawing is comparatively expensive to redo per-ball per-frame, so:
- **`ballSprite(color, grouped)`** — pre-renders a 128×128 glossy sphere (radial highlight + radial shadow, plus a thin or thick white ring depending on `grouped`) once per `color|grouped` key and caches the `HTMLCanvasElement`.
- **`glowSprite(color)`** — pre-renders a 64×64 soft radial falloff tinted to `color`, cached per color; used for both ball halos in the liquid background and for flash-ripple glows.
- **`inkOn(color)`** — computes WCAG relative luminance for a hex color and picks readable dark-ink or light-ink text color, cached per color:
  $$L = 0.2126R + 0.7152G + 0.0722B \quad \text{(linearized channels)}$$
  the higher-contrast option (dark ink vs. white) against the ball's color is chosen by comparing contrast ratios both ways.
- `clearSpriteCache()` drops all three caches (available for tests / palette resets that invalidate colors).

## Liquid Background (`VisualFX.ts`)

`drawLiquid` fills the low-res canvas with a dark base, then additively (`'lighter'` blend) layers:
- **`CURRENTS`** — 5 large, slowly drifting colored glow blobs with per-blob amplitude/speed/phase, giving the background a shifting aurora-like current.
- **A glow per ball** — small, scaled to `R*3.6/BG_SCALE`, alpha reduced for ghosts and scaled by rain fade-in.
- **A glow per active flash** (`FLASH_SPECS`, keyed by `bond`/`break`/`spawn`/`blocked`) — same ripple growth curve as the foreground rings but rendered as a soft blob instead of a stroked polygon, since this canvas is later blurred by the upscale.

Because this canvas is drawn at 1/7th resolution and then stretched, all of this is comparatively cheap even with dozens of simultaneous flashes/balls on screen.
