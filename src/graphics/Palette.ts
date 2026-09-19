/**
 * Every colour the game names, declared once.
 *
 * Before this file there were 101 hex literals in `src` naming 54 distinct
 * colours, plus 85 `rgb()`/`rgba()` literals — `MenuScreen.ts` alone held 75 of
 * the hex ones. A colour with a role was therefore spelled out wherever it was
 * used, and the copies had already drifted: player 1 was `#00e5ff` on their
 * launcher and `#4ff0ff` everywhere else.
 *
 * A colour earns a place here when it has a **role** — a player, the brand, the
 * backdrop, the ink. One-off gradient stops in the menu's artwork (the logo
 * balls, the speaker cone, the rays) stay local to the artwork that draws them:
 * they are shapes, not a palette.
 *
 * This module imports nothing, so anything may import it.
 */

export type Rgb = readonly [number, number, number];

/** `#rrggbb`, lower case. */
export function hex(c: Rgb): string {
  return '#' + c.map(v => v.toString(16).padStart(2, '0')).join('');
}

/** `rgb(r,g,b)`. */
export function rgb(c: Rgb): string {
  return 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')';
}

/**
 * `rgba(r,g,b,a)`.
 *
 * This is what stops an alpha variant from being a separate literal:
 * `rgba(0, 247, 255, 0.45)` is `rgba(MENU_CYAN, 0.45)`, and a reader can see
 * which named colour it is a fade of.
 */
export function rgba(c: Rgb, alpha: number): string {
  return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + alpha + ')';
}

// ── Brand and UI ───────────────────────────────────────────────────────────
// These four are mirrored by custom properties in `index.css`, and
// `tests/graphics/Palette.test.ts` fails if the two copies disagree.

/** `--cyan`. Player 1. */
export const CYAN: Rgb = [0x4f, 0xf0, 0xff];
/** `--pink`. Player 2. */
export const PINK: Rgb = [0xff, 0x1a, 0xd9];
/** `--void`. The page behind everything. */
export const VOID: Rgb = [0x12, 0x07, 0x26];
/** `--ink`. Body text. */
export const INK: Rgb = [0xf3, 0xe7, 0xff];

// ── Canvas ─────────────────────────────────────────────────────────────────

/** The field's backdrop, painted flat once the match is over. */
export const FIELD_BG: Rgb = [0x14, 0x0a, 0x2b];

/**
 * Player 1's launcher cyan, which is **not** `CYAN`.
 *
 * Two cyans for one player: the launcher mouth, its reload arc and its ready
 * pulse use this one, while the same player's score pops, HUD titles and aim
 * arrow use `CYAN`. They are ΔE 4.1 apart — barely visible, but it is one
 * player. Merging them is a player-visible change and is not made here.
 */
export const LAUNCHER_CYAN: Rgb = [0x00, 0xe5, 0xff];

// ── Menu ───────────────────────────────────────────────────────────────────
// The menu screen has its own three brand colours, all close to but not equal
// to `CYAN` and `PINK`. They are named rather than merged, so that whether the
// menu keeps its own shades stays a decision somebody makes on purpose.

/** The menu's cyan, ΔE 3.7 from `CYAN`. */
export const MENU_CYAN: Rgb = [0x00, 0xf7, 0xff];
/** The menu's pink, ΔE 7.5 from `PINK`. */
export const MENU_PINK: Rgb = [0xff, 0x00, 0xaa];
/** The menu's deeper pink, ΔE 15.5 from `PINK` — clearly a different colour. */
export const MENU_PINK_DEEP: Rgb = [0xff, 0x00, 0x7f];

// ── Neutrals ───────────────────────────────────────────────────────────────

export const WHITE: Rgb = [0xff, 0xff, 0xff];
export const BLACK: Rgb = [0x00, 0x00, 0x00];

// ── Ball colours ───────────────────────────────────────────────────────────
/**
 * Which colours the balls are is decided by the "Tune the ball colours for
 * better separation" task, which carries the colour-blindness and CIEDE2000
 * measurements behind them. They moved here from `game/Rules.ts` unchanged;
 * do not retune them from this file.
 */
export const BALL_RGB: Rgb[] = [
  [0xfd, 0xbe, 0x4e], // Gold / Warm Yellow
  [0x97, 0x44, 0xee], // Purple / Violet
  [0x5d, 0xd4, 0x78], // Soft Green
  [0x43, 0x63, 0xd8], // Blue
  [0x91, 0x1e, 0xb4], // Deep Purple
  [0x42, 0xd4, 0xf4], // Cyan
];

/**
 * The same colours as CSS strings.
 *
 * A ball carries its colour as a string — it is handed straight to `fillStyle`
 * and compared against other balls' — so the string form is the one the game
 * uses, and the triples above are what it is built from.
 */
export const BALL_COLORS: string[] = BALL_RGB.map(hex);
/** The black special ball's colour, as a ball carries it. */
export const BLACK_HEX = hex(BLACK);
/** The white special ball's colour, as a ball carries it. */
export const WHITE_HEX = hex(WHITE);
