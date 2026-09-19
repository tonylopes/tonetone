import { describe, it, expect } from 'vitest';
import { KIND_DEGREES, pitchOf } from '../../src/audio/SoundEvents';
import { scaleDegree } from '../../src/audio/Voices';

describe('pitchOf', () => {
  it('plays each kind on its declared scale step', () => {
    KIND_DEGREES.forEach((d, k) => expect(scaleDegree(pitchOf(k))).toBe(d));
  });

  it('gives every ball colour its own note', () => {
    const degrees = KIND_DEGREES.map((_, k) => scaleDegree(pitchOf(k)));
    expect(new Set(degrees).size).toBe(KIND_DEGREES.length);
  });

  it('puts special balls in the middle of the scale', () => {
    expect(pitchOf(-1)).toBe(0.5);
  });
});
