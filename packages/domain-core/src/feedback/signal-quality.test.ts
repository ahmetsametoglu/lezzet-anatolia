import { describe, expect, it } from 'vitest';
import {
  FULL_DWELL_MS,
  MIN_DWELL_MS,
  MIN_SWIPES_FOR_PATTERN,
  candidateSignalOf,
  dwellWeight,
  patternWeight,
  swipeWeight,
} from './signal-quality';

describe('kart süresi ağırlığı', () => {
  it('eşiğin altında kart görülmemiştir — sıfır ağırlık', () => {
    expect(dwellWeight(MIN_DWELL_MS - 1)).toBe(0);
    expect(dwellWeight(50)).toBe(0);
  });

  it('yeterince bakılan kart tam ağırlıklıdır', () => {
    expect(dwellWeight(FULL_DWELL_MS)).toBe(1);
    expect(dwellWeight(5000)).toBe(1);
  });

  it('arası doğrusal', () => {
    expect(dwellWeight((MIN_DWELL_MS + FULL_DWELL_MS) / 2)).toBeCloseTo(0.5, 5);
  });

  it('ÖLÇÜLEMEYEN süre tam sayılır — ölçüm hatası manipülasyonla aynı kefeye konmaz', () => {
    expect(dwellWeight(null)).toBe(1);
    expect(dwellWeight(undefined)).toBe(1);
  });
});

describe('kişinin deseni', () => {
  it('hep aynı yöne savuran bilgi taşımaz', () => {
    expect(patternWeight({ likeCount: 20, dislikeCount: 0 })).toBe(0);
    expect(patternWeight({ likeCount: 0, dislikeCount: 15 })).toBe(0);
  });

  it('ayırt eden kişi tam güven verir', () => {
    expect(patternWeight({ likeCount: 10, dislikeCount: 10 })).toBe(1);
  });

  it('dengeye yaklaştıkça ağırlık artar', () => {
    const az = patternWeight({ likeCount: 18, dislikeCount: 2 });
    const cok = patternWeight({ likeCount: 12, dislikeCount: 8 });
    expect(cok).toBeGreaterThan(az);
  });

  it('az kaydırmada desen aranmaz — üç kaydırma şüphe sebebi değil', () => {
    expect(patternWeight({ likeCount: MIN_SWIPES_FOR_PATTERN - 1, dislikeCount: 0 })).toBe(1);
    expect(patternWeight({ likeCount: MIN_SWIPES_FOR_PATTERN, dislikeCount: 0 })).toBe(0);
  });
});

describe('kaydırmanın analiz ağırlığı', () => {
  it('süre ve desen birlikte gerekir', () => {
    // Uzun uzun baktı ama hep aynı yöne savuruyor.
    expect(swipeWeight({ dwellMs: 3000, swiperLikeCount: 20, swiperDislikeCount: 0 })).toBe(0);
    // Ayırt ediyor ama milisaniyelerle geçmiş.
    expect(swipeWeight({ dwellMs: 100, swiperLikeCount: 10, swiperDislikeCount: 10 })).toBe(0);
    // İkisi de iyi.
    expect(swipeWeight({ dwellMs: 3000, swiperLikeCount: 10, swiperDislikeCount: 10 })).toBe(1);
  });
});

describe('aday ürün sinyali', () => {
  it('ağırlıklı beğeni ham sayıdan ayrılır', () => {
    const signal = candidateSignalOf([
      { vote: 'like', weight: 1 },
      { vote: 'like', weight: 0.5 },
      { vote: 'like', weight: 0 },
      { vote: 'dislike', weight: 1 },
    ]);
    expect(signal.rawLikes).toBe(3);
    expect(signal.weightedLikes).toBe(1.5);
    expect(signal.trust).toBe(0.5);
  });

  it('savurma beğenileri panoyu şişirmez', () => {
    // 10 savurma (sıfır ağırlık) ile 3 gerçek beğeniyi karşılaştır.
    const savurma = candidateSignalOf(Array.from({ length: 10 }, () => ({ vote: 'like' as const, weight: 0 })));
    const gercek = candidateSignalOf(Array.from({ length: 3 }, () => ({ vote: 'like' as const, weight: 1 })));

    expect(savurma.rawLikes).toBeGreaterThan(gercek.rawLikes);
    // Ama sıralamayı belirleyen ağırlıklı sayıdır.
    expect(savurma.weightedLikes).toBeLessThan(gercek.weightedLikes);
    expect(savurma.trust).toBe(0);
    expect(gercek.trust).toBe(1);
  });

  it('hiç beğeni yoksa güven sıfırdır', () => {
    expect(candidateSignalOf([{ vote: 'dislike', weight: 1 }])).toMatchObject({ rawLikes: 0, weightedLikes: 0, trust: 0 });
  });
});
