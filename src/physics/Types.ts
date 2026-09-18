export interface Vector2D {
  x: number;
  y: number;
}

export type SpecialBallType = 'black' | 'white' | null;

/**
 * One throw's scoring tally. Every ball carrying credit from the same throw
 * shares this object, so each further event that throw causes pays less.
 */
export interface Shot {
  events: number;
}

export interface Ball {
  id: number;
  x: number;
  y: number;
  kind: number;
  special: SpecialBallType;
  color: string;
  credit: number;
  /** The throw `credit` came from. Copied wherever `credit` is copied. */
  shot?: Shot;
  bonds: Set<number>;
  group: Group;
  exempt?: number;
  rainTime?: number;
  ghost?: boolean;
  age?: number;
  pure?: boolean;
  _vx?: number;
  _vy?: number;
  _av?: number;
  _pg?: Group;
}

export interface Offset {
  x: number;
  y: number;
}

export interface Group {
  members: Ball[];
  offsets: Offset[];
  com: Vector2D;
  ang: number;
  av: number;
  vx: number;
  vy: number;
  mass: number;
  inertia: number;
  color: string | null;
  _x0?: number;
  _x1?: number;
  _y0?: number;
  _y1?: number;
}

export interface Flash {
  x: number;
  y: number;
  t: number;
  kind: 'bond' | 'break' | 'spawn' | 'blocked';
}

export interface Pop {
  x: number;
  y: number;
  t: number;
  text: string;
  who: number;
}

export interface BallOnDeck {
  kind: number;
  color: string;
  special: SpecialBallType;
}

export interface LauncherPlayer {
  side: number; // 1 = bottom (P1), -1 = top (P2)
  aimDeg: number;
  strength: number;
  loaded: BallOnDeck | null;
  nextUp: BallOnDeck | null;
  then: BallOnDeck | null;
  reload: number;
  destroyed: number;
  bursts: number;
  locks: number;
  peels: number;
  score: number;
  best: number;
  lockPts: number;
  burstPts: number;
  peelPts: number;
  _idleDeg?: number;
}
