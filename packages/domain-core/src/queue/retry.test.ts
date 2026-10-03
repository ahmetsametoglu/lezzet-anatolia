import { describe, expect, it } from 'vitest';
import { queueBackoffMs } from './retry';

describe('kuyruğun yeniden deneme aralığı', () => {
  it('düşen deneme bir dakikadan başlayıp ikiye katlanır ve bir saatte durur; dış sistem art arda dövülmez', () => {
    expect([1, 2, 3, 4, 5].map(queueBackoffMs)).toEqual([60_000, 120_000, 240_000, 480_000, 960_000]);
    expect(queueBackoffMs(7)).toBe(3_600_000);
    expect(queueBackoffMs(30)).toBe(3_600_000);
  });
});
