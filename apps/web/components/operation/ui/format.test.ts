import { describe, expect, it } from 'vitest';
import { ageMinutesOf, dayMonthLong, monthYear, weekdayName } from './format';

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

// Gün başlığı (12.22, Para defteri) — gün bir TARİHTİR: UTC okunur, yerel saatle akşam bir gün kaymaz.
describe('gün başlığı', () => {
  it('uzun ay adı; yıl yalnız istenince', () => {
    expect(dayMonthLong('2026-09-14')).toBe('14 Eylül');
    expect(dayMonthLong('2025-12-31', true)).toBe('31 Aralık 2025');
  });

  it('günün adı', () => {
    expect(weekdayName('2026-09-14')).toBe('Pazartesi');
    expect(weekdayName('2026-09-11')).toBe('Cuma');
  });

  it('ay başlığı yılıyla (12.23)', () => {
    expect(monthYear('2026-09-01')).toBe('Eylül 2026');
    expect(monthYear('2025-12-31')).toBe('Aralık 2025');
  });

  it('okunamayan tarih "—" — boş başlık ya da "Invalid Date" basılmaz', () => {
    expect(dayMonthLong('bozuk-tarih')).toBe('—');
    expect(weekdayName(null)).toBe('—');
    expect(monthYear('bozuk-tarih')).toBe('—');
  });
});
