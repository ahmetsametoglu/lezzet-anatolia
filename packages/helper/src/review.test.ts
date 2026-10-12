import { describe, expect, it } from 'vitest';
import { headRatingLabel } from './review';

const copy = { ratingCountOne: '1 évaluation', ratingCount: '{count} évaluations' };

describe('ürün başlığının puan parçası', () => {
  // Puansız üründe "0,0" yazılsaydı henüz değerlendirilmemiş ürün kötü ürün gibi okunurdu.
  it('puan yoksa hiçbir şey yazılmaz', () => {
    expect(headRatingLabel({ average: null, totalCount: 0 }, copy, 'fr')).toBeNull();
  });

  it('ortalama dilin ayracıyla tek ondalık, sayı tekil ya da çoğul cümleyle yazılır', () => {
    expect(headRatingLabel({ average: 4.4, totalCount: 5 }, copy, 'fr')).toBe('4,4 (5 évaluations)');
    expect(headRatingLabel({ average: 5, totalCount: 1 }, copy, 'fr')).toBe('5,0 (1 évaluation)');
  });
});
