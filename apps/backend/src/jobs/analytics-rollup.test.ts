import { afterAll, describe, expect, it } from 'vitest';
import { addDays, parisDateOf, parisDayRange } from '@lezzet/helper';
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
 * İşin dört özeti de yazdığı sınanır, çünkü işe bağlanmayı unutulan özet hiçbir yerde hata vermez, yalnız ekranda hiç dolmazdı.
 * Ölçüt yalnız bu testin damgalı kovalarıdır, çünkü iş tüm günü özetler (`CLAUDE §4b`).
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

/** İş Paris'te dünü özetliyor; test de o günü, Paris duvar saatiyle kuruyor. */
const day = addDays(parisDateOf(new Date()), -1);
const at = (hour: number) => new Date(Date.parse(parisDayRange(day).from) + (hour * 60 + 15) * 60_000).toISOString();

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
    // `surface` ve `business` zorunludur ve varsayılanı yoktur; ham `insert`te unutulursa Supabase hatayı döndürür, satır doğmaz ve test
    // sebebi görünmeden düşerdi.
    await db.from('analytics_event').insert([
      { created_at: at(8), type: 'page_view', session_key: sessionKey, path: '/', business: 'lezzet', surface: 'web' },
      {
        created_at: at(9),
        type: 'product_view',
        session_key: sessionKey,
        product_id: productId,
        availability: 'sellable',
        business: 'lezzet',
        surface: 'web',
      },
      { created_at: at(9), type: 'add_to_cart', session_key: sessionKey, product_id: productId, business: 'lezzet', surface: 'web' },
      {
        created_at: at(10),
        type: 'search',
        session_key: sessionKey,
        meta: { query: searchQuery, resultCount: 0, zeroResultKind: 'search' },
        business: 'lezzet',
        surface: 'web',
      },
      {
        created_at: at(11),
        type: 'checkout_blocked',
        session_key: sessionKey,
        path: '/checkout',
        blocked_reason: 'min_basket',
        business: 'lezzet',
        surface: 'web',
      },
    ]);

    const sonuc = await analyticsRollupJob();
    expect(sonuc.summaryRows).toBeTypeOf('number');

    // 1) Gün özeti: terk sebebi bir boyuttur.
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
