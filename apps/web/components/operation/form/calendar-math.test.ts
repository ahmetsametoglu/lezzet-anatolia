import { describe, expect, it } from 'vitest';
import {
  RANGE_PRESETS,
  formatDay,
  matchingPreset,
  monthGrid,
  monthLabel,
  parseDay,
  shiftMonth,
  toDay,
} from './calendar-math';

/**
 * Takvimin saf matematiği. Buradaki hatalar ekranda "bir gün kaymış tarih" olarak görünür ve
 * gözle yakalanması en zor hatadır — bu yüzden ızgara, sınırlar ve dilim davranışı testli.
 */

describe('gün ayrıştırma ve biçimleme', () => {
  it('YEREL gün üretir — UTC ayrıştırması bir gün geri kaydırırdı', () => {
    const date = parseDay('2026-07-31')!;
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(6);
    expect(date.getDate()).toBe(31);
  });

  it('gidiş-dönüş kapalı devre', () => {
    expect(toDay(parseDay('2026-01-01')!)).toBe('2026-01-01');
    expect(toDay(parseDay('2026-12-31')!)).toBe('2026-12-31');
  });

  it('bozuk metin tarih UYDURMAZ', () => {
    expect(parseDay('')).toBeNull();
    expect(parseDay('31/07/2026')).toBeNull();
    expect(parseDay(null)).toBeNull();
    expect(formatDay('bozuk')).toBe('');
  });

  it('ISO damgadan gün kısmını alır (saat taşımaz)', () => {
    expect(toDay(parseDay('2026-07-31T23:59:59.000Z')!)).toBe('2026-07-31');
  });
});

describe('ay ızgarası', () => {
  it('HER ay 42 hücre — kutu ay değişince zıplamasın', () => {
    for (let m = 0; m < 12; m += 1) expect(monthGrid(2026, m)).toHaveLength(42);
    // Şubat 2027: 28 gün, pazartesi başlıyor — en kısa hâl de 42 kalır.
    expect(monthGrid(2027, 1)).toHaveLength(42);
  });

  it('hafta PAZARTESİ başlar', () => {
    // 1 Temmuz 2026 çarşamba → ızgara 29 Haziran pazartesiyle açılır.
    const grid = monthGrid(2026, 6);
    expect(grid[0]!.day).toBe('2026-06-29');
    expect(grid[0]!.outside).toBe(true);
  });

  it('ayın günleri "outside" değil, komşu ayınkiler öyle', () => {
    const grid = monthGrid(2026, 6);
    const inside = grid.filter((c) => !c.outside);
    expect(inside).toHaveLength(31);
    expect(inside[0]!.day).toBe('2026-07-01');
    expect(inside.at(-1)!.day).toBe('2026-07-31');
  });

  it('yıl sınırında da doğru: Aralık ızgarası ocakla kapanır', () => {
    const grid = monthGrid(2026, 11);
    expect(grid.some((c) => c.day.startsWith('2027-01'))).toBe(true);
  });
});

describe('ay kaydırma', () => {
  it('yıl sınırını aşar', () => {
    expect(shiftMonth(2026, 11, 1)).toEqual({ year: 2027, month: 0 });
    expect(shiftMonth(2026, 0, -1)).toEqual({ year: 2025, month: 11 });
  });

  it('çok aylık sıçrama', () => {
    expect(shiftMonth(2026, 6, 12)).toEqual({ year: 2027, month: 6 });
    expect(monthLabel(2026, 6)).toBe('Temmuz 2026');
  });
});

describe('önayarlı aralıklar', () => {
  // Sabit bir "bugün": testin takvim gününe göre kaymaması için.
  const today = new Date(2026, 6, 24); // 24 Temmuz 2026, cuma

  it('son 7 gün BUGÜNÜ içerir — 7 gün, 8 değil', () => {
    const r = RANGE_PRESETS.find((p) => p.key === 'days7')!.range(today);
    expect(r).toEqual({ from: '2026-07-18', to: '2026-07-24' });
  });

  it('bu ay: ayın ilk gününden SON gününe', () => {
    const r = RANGE_PRESETS.find((p) => p.key === 'thisMonth')!.range(today);
    expect(r).toEqual({ from: '2026-07-01', to: '2026-07-31' });
  });

  it('geçen ay: 30/31 gün farkını kendi bulur', () => {
    const r = RANGE_PRESETS.find((p) => p.key === 'lastMonth')!.range(today);
    expect(r).toEqual({ from: '2026-06-01', to: '2026-06-30' });
  });

  it('seçim bir önayara denk düşüyorsa o işaretlenir', () => {
    expect(matchingPreset('2026-07-01', '2026-07-31', today)).toBe('thisMonth');
  });

  it('hiçbirine uymayan seçim "Özel" demektir — uydurma bir önayar işaretlenmez', () => {
    expect(matchingPreset('2026-07-03', '2026-07-19', today)).toBeNull();
    expect(matchingPreset('2026-07-03', '', today)).toBeNull();
  });
});
