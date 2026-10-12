import { describe, expect, it } from 'vitest';
import { locative } from './suffix';

// Ek ünlü uyumuna ve son harfin sertliğine uyar; bozulursa ekran "Kehl'da", "Paris'de" ya da "14 Ocak'da" yazar.
describe('locative', () => {
  it('son ünlüye ve sert ünsüze uyar', () => {
    expect(['Strasbourg', 'Kehl', 'Paris', 'Köln', 'Offenburg', '14 Kasım', '3 Ocak'].map(locative)).toEqual([
      "'da",
      "'de",
      "'te",
      "'de",
      "'da",
      "'da",
      "'ta",
    ]);
  });
});
