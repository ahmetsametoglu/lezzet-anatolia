import { describe, expect, it } from 'vitest';
import type { AnalyticsProductSignal } from '@lezzet/types';
import { orderByRank, rankSignals, topUp } from './home';

/**
 * Vitrin seçkisinin SIRALAMASI (08.9) — müşterinin anasayfada gördüğü dörtlü.
 *
 * Üçü de saf ve üçü de sessizce yanlış olabilecek türden: sıralama bozulursa hiçbir şey patlamaz,
 * yalnız "bu hafta çok sevilenler" başlığı altında yanlış dört ürün durur. Testin işi o sessizliği
 * bozmak.
 */
function signal(over: Partial<AnalyticsProductSignal> & { productId: string }): AnalyticsProductSignal {
  return { viewCount: 0, cartCount: 0, shareCount: 0, sellableViewCount: 0, sessionCount: 0, cartRate: null, ...over };
}

describe('rankSignals', () => {
  it('ölçüt görüntüleme + sepete ekleme TOPLAMI — yalnız görüntüleme değil', () => {
    const ranked = rankSignals([
      signal({ productId: 'cok-bakilan', viewCount: 100, cartCount: 0 }),
      signal({ productId: 'dengeli', viewCount: 60, cartCount: 50 }),
    ]);
    // Sepete ekleme sayılmasaydı "çok bakılan" başa geçerdi; seçkinin sorusu bakılmak değil istenmek.
    expect(ranked).toEqual(['dengeli', 'cok-bakilan']);
  });

  it('sinyal yoksa sıralama da boştur (çağıran yedeğe düşer)', () => {
    expect(rankSignals([])).toEqual([]);
  });
});

describe('orderByRank', () => {
  it('satırları ölçüt sırasına dizer — servisin döndürdüğü sıraya değil', () => {
    const rows = [{ id: 'b' }, { id: 'a' }, { id: 'c' }];
    expect(orderByRank(rows, ['c', 'a', 'b']).map((r) => r.id)).toEqual(['c', 'a', 'b']);
  });

  it('sıralamada olmayan satır SONA düşer, araya karışmaz', () => {
    const rows = [{ id: 'yabanci' }, { id: 'a' }];
    expect(orderByRank(rows, ['a']).map((r) => r.id)).toEqual(['a', 'yabanci']);
  });
});

describe('topUp', () => {
  it('eksik bandı katalogla tamamlar', () => {
    expect(topUp([{ id: 'a' }], [{ id: 'x' }, { id: 'y' }], 3).map((r) => r.id)).toEqual(['a', 'x', 'y']);
  });

  it('zaten seçilmiş ürünü İKİNCİ kez koymaz', () => {
    // Aynı ürünü iki kart olarak çizmek, dörtlü ızgarayı üçe indirmekten daha kötü görünür.
    expect(topUp([{ id: 'a' }], [{ id: 'a' }, { id: 'x' }], 2).map((r) => r.id)).toEqual(['a', 'x']);
  });

  it('sınırı aşmaz', () => {
    expect(topUp([{ id: 'a' }], [{ id: 'x' }, { id: 'y' }], 2)).toHaveLength(2);
  });
});
