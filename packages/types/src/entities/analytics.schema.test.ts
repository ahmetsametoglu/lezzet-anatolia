import { describe, expect, it } from 'vitest';
import { AnalyticsInputSchema, AnalyticsProductSignalSchema, OrderRevenueDailySchema } from './analytics.schema';

/**
 * Analitik şemasının iki ayrı kuralı var ve ikisi de sessizce bozulabilecek cinsten.
 */
describe('AnalyticsInput — olay tipi kendi alanlarını taşır', () => {
  /**
   * Ayrımlı birleşim (`discriminatedUnion`) burada bir şekil tercihi değil, defterin kendisi:
   * her olay tipi YALNIZ kendi alanlarını taşır. Düz bir nesne olsaydı `search` olayı
   * `resultCount`suz da yazılabilirdi ve "sonuçsuz arama" raporu sebebi olmayan bir boşluk verirdi.
   */
  it('tanınmayan olay tipi REDDEDİLİR', () => {
    expect(AnalyticsInputSchema.safeParse({ type: 'sayfa_acildi' }).success).toBe(false);
  });

  it('`search` olayı sorgusuz ya da sayaçsız yazılamaz', () => {
    expect(AnalyticsInputSchema.safeParse({ type: 'search', query: 'reçel' }).success).toBe(false);
    expect(AnalyticsInputSchema.safeParse({ type: 'search', resultCount: 3 }).success).toBe(false);
    expect(AnalyticsInputSchema.safeParse({ type: 'search', query: 'reçel', resultCount: 3 }).success).toBe(true);
  });

  /** Sonuç sayısı eksi olamaz — eksi bir sayaç ölçümün değil, hesabın bozukluğudur. */
  it('eksi sonuç sayısı reddedilir', () => {
    expect(AnalyticsInputSchema.safeParse({ type: 'search', query: 'x', resultCount: -1 }).success).toBe(false);
  });

  /** Sayfa açılışının öznesi İSTEĞE BAĞLI (08.57): öznesi olmayan sayfalar da ölçülür. */
  it('`page_view` öznesiz geçer', () => {
    expect(AnalyticsInputSchema.safeParse({ type: 'page_view' }).success).toBe(true);
  });
});

describe('Analitik toplamları — SQL sayıları metin gelir', () => {
  /**
   * Toplam sorguları `numeric` döndürüyor ve sürücü onu string veriyor. Çevrim olmasaydı ciro
   * grafiği sayıları sıralayamaz, iki günü toplayamazdı — ve hiçbir hata vermezdi.
   */
  it('ciro metin gelse de tamsayıya iner', () => {
    const satir = OrderRevenueDailySchema.parse({ day: '2026-08-26', channel: 'b2c', orderCount: 4, revenueCents: '15990' });
    expect(satir.revenueCents).toBe(15990);
  });

  /** Oran ÖLÇÜLEMEDİĞİNDE `null` kalır — sıfıra düşerse "hiç sepete atılmadı" diye okunurdu. */
  it('sepet oranı ölçülemediğinde `null` KALIR', () => {
    const temel = {
      productId: '88888888-8888-4888-8888-888888888888',
      viewCount: 0, cartCount: 0, shareCount: 0, sellableViewCount: 0, sessionCount: 0,
    };
    expect(AnalyticsProductSignalSchema.parse({ ...temel, cartRate: null }).cartRate).toBeNull();
    expect(AnalyticsProductSignalSchema.parse({ ...temel, cartRate: '0.25' }).cartRate).toBe(0.25);
  });
});
