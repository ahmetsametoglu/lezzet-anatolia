import { describe, expect, it } from 'vitest';
import { parisDateOf, parisDayRange } from './date';

describe('Paris takvimi', () => {
  it('kış günü UTC+1, yaz günü UTC+2 sınırlıdır; yaz saatine geçilen gün 23 saat, ay sonu ertesi aya taşar', () => {
    expect(parisDayRange('2026-01-15')).toEqual({ from: '2026-01-14T23:00:00.000Z', to: '2026-01-15T23:00:00.000Z' });
    expect(parisDayRange('2026-07-15')).toEqual({ from: '2026-07-14T22:00:00.000Z', to: '2026-07-15T22:00:00.000Z' });
    expect(parisDayRange('2026-03-29')).toEqual({ from: '2026-03-28T23:00:00.000Z', to: '2026-03-29T22:00:00.000Z' });
    expect(parisDayRange('2026-01-31').to).toBe('2026-01-31T23:00:00.000Z');
  });

  it('UTC gece yarısından önce Paris gün değiştirir', () => {
    expect(parisDateOf(new Date('2026-07-15T21:59:00.000Z'))).toBe('2026-07-15');
    expect(parisDateOf(new Date('2026-07-15T22:00:00.000Z'))).toBe('2026-07-16');
  });
});
