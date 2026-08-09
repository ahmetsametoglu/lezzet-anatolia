import { describe, expect, it } from 'vitest';
import { ageMinutesOf } from './format';

// Yaş hesabı üç ekranın (talepler · sistem · asistan kuyruğu) ortak girdisi; sınaması burada, tek
// yerde. Önceden iki ayrı tanım vardı ve BOZUK damgada ayrışıyorlardı — bu dosyanın asıl işi o
// ayrımı bir daha açılmayacak şekilde kapatmak.

const NOW = Date.parse('2026-08-03T12:00:00.000Z');

describe('ageMinutesOf', () => {
  it('damganın yaşını dakika olarak verir', () => {
    expect(ageMinutesOf('2026-08-03T11:30:00.000Z', NOW)).toBe(30);
  });

  it('İLERİ tarihli damga negatife düşmez — "-3 dk önce" diye bir şey yok', () => {
    expect(ageMinutesOf('2026-08-03T12:05:00.000Z', NOW)).toBe(0);
  });

  it('okunamayan damga SIFIR değil `null` — ölçülemeyen yaş "az önce" diye okunmaz', () => {
    expect(ageMinutesOf('bozuk-tarih', NOW)).toBeNull();
  });
});
