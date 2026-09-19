import { describe, it, expect } from 'vitest';
import { KIND_DEGREES, pitchOf } from '../../src/audio/SoundEvents';
import { scaleDegree } from '../../src/audio/Voices';
import { SCALES, buildScale } from '../../src/audio/SynthEngine';

/** The notes the first `colours` ball kinds play in a scale, in Hz. */
function notesOf(scale: string, colours: number): number[] {
  const table = buildScale(scale);
  return Array.from({ length: colours }, (_, k) => table[scaleDegree(pitchOf(k))]);
}

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

  // Colours used to land on steps every pentatonic in the picker shares, so
  // Hirajoshi, Major pentatonic and Kumoi played the same notes and picking a
  // scale did nothing audible.
  it('makes every scale in the picker sound different with the default three colours', () => {
    const names = Object.keys(SCALES);
    for (let i = 0; i < names.length; i++) {
      for (let j = i + 1; j < names.length; j++) {
        expect(notesOf(names[i], 3), `${names[i]} vs ${names[j]}`).not.toEqual(notesOf(names[j], 3));
      }
    }
  });
});
