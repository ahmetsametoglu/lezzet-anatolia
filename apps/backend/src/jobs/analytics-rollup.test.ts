import { afterAll, describe, expect, it } from 'vitest';
import {
  AnalyticsDailyService,
  AnalyticsProductDailyService,
  AnalyticsSearchDailyService,
  AnalyticsSourceDailyService,
  serviceDb,
} from '@lezzet/database';
import { purgeTestData } from '@lezzet/database/testing';
import { analyticsRollupJob } from './analytics-rollup';

/**
 * Analitik özet + bakım turu (13.1).
 *
 * **Bu testin asıl koruduğu şey bir sayı değil, bir SESSİZ ARIZA sınıfıdır:** yeni bir özet
 * eklenip işe bağlanmayı unutmak. Unutulduğunda hiçbir yer hata vermez — yalnız o blok ekranda
 * hiç dolmaz ve kimse tek bir günü işaret edemez. `buildAll` dördünü birlikte üretiyor; burada
 * sınanan, işin gerçekten dördünü de yazdığı.
 *
 * **Küresel sayıya bakılmıyor** (`CLAUDE §4b`): iş tüm günü özetliyor ve başka ajanların satırları
 * da aynı güne düşüyor. Ölçüt yalnız bu testin damgalı kovaları.
 */
const db = serviceDb();
const daily = new AnalyticsDailyService(db);
const products = new AnalyticsProductDailyService(db);
const searches = new AnalyticsSearchDailyService(db);
const sources = new AnalyticsSourceDailyService(db);

const stamp = Date.now();
const sessionKey = `rollup-${stamp}`;
const productId = `00000000-0000-4000-9000-${String(stamp).slice(-12).padStart(12, '0')}`;
const searchQuery = `rollup-terim-${stamp}`;
const campaign = `rollup-kampanya-${stamp}`;

/** İş DÜNÜ özetliyor (gün kapanmadan üretilen özet eksiktir) — test de dünü kuruyor. */
const day = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
const at = (hour: number) => `${day}T${String(hour).padStart(2, '0')}:15:00.000Z`;

afterAll(async () => {
  await purgeTestData(db, {
    analyticsSessionKeys: [sessionKey],
    productIds: [productId],
    analyticsSearchQueries: [searchQuery],
  });
});

describe('analytics_rollup', () => {
  it('DÖRT özeti birden üretir — biri unutulsa hata vermez, yalnız o blok hiç dolmazdı', async () => {
    await db.from('analytics_session').insert({
      session_key: sessionKey,
      utm: { source: 'instagram', campaign, medium: 'cpc' },
      source: 'instagram.com',
    });
    // `surface` ZORUNLU (24.08, MB-63) ve varsayılanı yok — ham `insert` yazmayı unutursa Supabase
    // hatayı FIRLATMAZ, DÖNDÜRÜR: satırlar hiç doğmaz, iş boş günü özetler ve test "0 satır" diye
    // düşer. Fikstür web olayı kurduğu için (`path` taşıyor) yüzey de `web`.
    await db.from('analytics_event').insert([
      { created_at: at(8), type: 'page_view', session_key: sessionKey, path: '/', surface: 'web' },
      { created_at: at(9), type: 'product_view', session_key: sessionKey, product_id: productId, availability: 'sellable', surface: 'web' },
      { created_at: at(9), type: 'add_to_cart', session_key: sessionKey, product_id: productId, surface: 'web' },
      { created_at: at(10), type: 'search', session_key: sessionKey, meta: { query: searchQuery, resultCount: 0, zeroResultKind: 'search' }, surface: 'web' },
      { created_at: at(11), type: 'checkout_blocked', session_key: sessionKey, path: '/checkout', blocked_reason: 'min_basket', surface: 'web' },
    ]);

    const sonuc = await analyticsRollupJob();
    expect(sonuc.summaryRows).toBeTypeOf('number');

    // 1) Gün özeti — terk sebebi BOYUT olarak geldi (13.3).
    const bloklar = await daily.list({ from: day, to: day, types: ['checkout_blocked'] });
    expect(bloklar.some((r) => r.blockedReason === 'min_basket')).toBe(true);

    // 2) Ürün kırılımı.
    const urun = (await products.signals(day, day, 200)).find((p) => p.productId === productId);
    expect(urun?.viewCount).toBe(1);
    expect(urun?.cartCount).toBe(1);

    // 3) Arama — sıfır-sonuç kovasında.
    const arama = (await searches.signals(day, day, 200, true)).find((s) => s.query === searchQuery);
    expect(arama?.searchCount).toBe(1);

    // 4) Kaynak — künye UTM'den okunur, yönlendiren alan adından DEĞİL (o kampanyayı gölgelerdi).
    const kaynak = (await sources.list(day, day)).find((s) => s.campaign === campaign);
    expect(kaynak?.source).toBe('instagram');
    expect(kaynak?.sessionCount).toBe(1);
  });

  it('İDEMPOTENT — ikinci tur satırı çoğaltmaz, üzerine yazar', async () => {
    const once = (await products.signals(day, day, 200)).find((p) => p.productId === productId);
    await analyticsRollupJob();
    const sonra = (await products.signals(day, day, 200)).filter((p) => p.productId === productId);

    expect(sonra).toHaveLength(1);
    expect(sonra[0]?.viewCount).toBe(once?.viewCount);
  });

  it('süpürme sayı DÖNER — "saklama süresi" bir cümle değil, ölçülen bir iş', async () => {
    // Sayının kaç olduğu değil, işin bu adımı GERÇEKTEN koşturduğu sınanıyor: süpüren adım yoksa
    // saklama süresi yalnız künyede yazan bir vaattir.
    const sonuc = await analyticsRollupJob();
    expect(sonuc.sessions).toBeTypeOf('number');
    expect(sonuc.searches).toBeTypeOf('number');
    expect(Array.isArray(sonuc.droppedPartitions)).toBe(true);
  });
});
