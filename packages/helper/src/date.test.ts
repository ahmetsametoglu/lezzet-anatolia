import { describe, expect, it } from 'vitest';
import { parisDateOf, parisDayRange, parisMinutesOf, previousDay } from './date';

describe('Paris takvimi', () => {
  it('kış günü UTC+1, yaz günü UTC+2 sınırlıdır; yaz saatine geçilen gün 23 saat, ay sonu ertesi aya taşar', () => {
    expect(parisDayRange('2026-01-15')).toEqual({ from: '2026-01-14T23:00:00.000Z', to: '2026-01-15T23:00:00.000Z' });
    expect(parisDayRange('2026-07-15')).toEqual({ from: '2026-07-14T22:00:00.000Z', to: '2026-07-15T22:00:00.000Z' });
    expect(parisDayRange('2026-03-29')).toEqual({ from: '2026-03-28T23:00:00.000Z', to: '2026-03-29T22:00:00.000Z' });
    expect(parisDayRange('2026-01-31').to).toBe('2026-01-31T23:00:00.000Z');
  });

  it('sunucu UTC iken de Paris duvar saatini verir — yazın UTC+2, kışın UTC+1', () => {
    expect(parisDateOf(new Date('2026-10-03T23:35:00.000Z'))).toBe('2026-10-04');
    expect(parisMinutesOf(new Date('2026-10-03T23:35:00.000Z'))).toBe(95);
    expect(parisMinutesOf(new Date('2026-01-15T12:00:00.000Z'))).toBe(13 * 60);
  });

  it('UTC gece yarısından önce Paris gün değiştirir', () => {
    expect(parisDateOf(new Date('2026-07-15T21:59:00.000Z'))).toBe('2026-07-15');
    expect(parisDateOf(new Date('2026-07-15T22:00:00.000Z'))).toBe('2026-07-16');
  });

  it('ay ve yıl başında önceki gün bir önceki aya ve yıla düşer, artık yılda 29 Şubattır', () => {
    expect(previousDay('2027-01-01')).toBe('2026-12-31');
    expect(previousDay('2028-03-01')).toBe('2028-02-29');
  });
});
