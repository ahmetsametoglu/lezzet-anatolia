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

/** Kimliksiz kaydırma kısayolu — tekilleştirme dışında kalanlar. */
const anon = (vote: 'like' | 'dislike', weight: number, at = '2026-08-03T10:00:00.000Z') => ({ vote, weight, swiperId: null, at });

describe('aday ürün sinyali', () => {
  it('ağırlıklı beğeni ham sayıdan ayrılır', () => {
    const signal = candidateSignalOf([anon('like', 1), anon('like', 0.5), anon('like', 0), anon('dislike', 1)]);
    expect(signal.rawLikes).toBe(3);
    expect(signal.weightedLikes).toBe(1.5);
    expect(signal.trust).toBe(0.5);
  });

  it('savurma beğenileri panoyu şişirmez', () => {
    // 10 savurma (sıfır ağırlık) ile 3 gerçek beğeniyi karşılaştır.
    const savurma = candidateSignalOf(Array.from({ length: 10 }, () => anon('like', 0)));
    const gercek = candidateSignalOf(Array.from({ length: 3 }, () => anon('like', 1)));

    expect(savurma.rawLikes).toBeGreaterThan(gercek.rawLikes);
    // Ama sıralamayı belirleyen ağırlıklı sayıdır.
    expect(savurma.weightedLikes).toBeLessThan(gercek.weightedLikes);
    expect(savurma.trust).toBe(0);
    expect(gercek.trust).toBe(1);
  });

  it('hiç beğeni yoksa güven sıfırdır', () => {
    expect(candidateSignalOf([anon('dislike', 1)])).toMatchObject({ rawLikes: 0, weightedLikes: 0, trust: 0 });
  });
});

/**
 * Pano "kaç kaydırma oldu"yu değil **"kaç kişi istiyor"u** sorar. Kimlikli kaydırmada tekillik
 * zaten veritabanındadır (`product_feedback_customer_key`); buradaki tekilleştirme, tur hesaba
 * bağlanırken birden çok kaydırmanın aynı kişiye düştüğü hâller için EMNİYET AĞIDIR.
 */
describe('kişi başına tekilleştirme', () => {
  const kisi = (id: string, vote: 'like' | 'dislike', weight: number, at: string) => ({ vote, weight, swiperId: id, at });

  it('aynı kişinin aynı ürüne beş kaydırması BİR kişilik talep sayılır', () => {
    const bes = Array.from({ length: 5 }, (_, i) =>
      kisi('m1', 'like', 1, `2026-08-0${i + 1}T10:00:00.000Z`),
    );
    expect(candidateSignalOf(bes)).toMatchObject({ rawLikes: 1, weightedLikes: 1 });
  });

  it('EN YENİ görüş geçerlidir — kişi fikrini değiştirebilir', () => {
    // Önce beğendi, sonra geçti: pano onu isteyen olarak saymamalı.
    const signal = candidateSignalOf([
      kisi('m1', 'like', 1, '2026-08-01T10:00:00.000Z'),
      kisi('m1', 'dislike', 1, '2026-08-02T10:00:00.000Z'),
    ]);
    expect(signal.rawLikes).toBe(0);
  });

  it('en yenisi kazanır, en YÜKSEK ağırlıklı değil', () => {
    // Eski kaydırma tam ağırlıklı, yenisi savurma. Kişinin son sözü savurma.
    const signal = candidateSignalOf([
      kisi('m1', 'like', 1, '2026-08-01T10:00:00.000Z'),
      kisi('m1', 'like', 0, '2026-08-02T10:00:00.000Z'),
    ]);
    expect(signal.weightedLikes).toBe(0);
  });

  it('farklı kişiler ayrı sayılır', () => {
    const signal = candidateSignalOf([
      kisi('m1', 'like', 1, '2026-08-01T10:00:00.000Z'),
      kisi('m2', 'like', 1, '2026-08-01T10:00:00.000Z'),
    ]);
    expect(signal.rawLikes).toBe(2);
  });

  it('kimliksiz kaydırma tekilleştirilMEZ — hangisinin aynı ziyaretçi olduğu bilinmiyor', () => {
    expect(candidateSignalOf([anon('like', 1), anon('like', 1), anon('like', 1)]).rawLikes).toBe(3);
  });

  it('damga karşılaştırması OFSETE dayanıklıdır', () => {
    // Aynı anı gösteren iki farklı yazım: metin olarak ters sıralanır, tarih olarak doğru.
    const signal = candidateSignalOf([
      kisi('m1', 'dislike', 1, '2026-08-03T12:00:00.000+02:00'), // = 10:00Z, DAHA YENİ
      kisi('m1', 'like', 1, '2026-08-03T09:00:00.000Z'),
    ]);
    expect(signal.rawLikes).toBe(0);
  });
});
