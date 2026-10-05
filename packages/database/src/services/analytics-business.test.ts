import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addDays, parisDateOf, parisDayRange } from '@lezzet/helper';
import type { Business } from '@lezzet/types';
import { serviceDb } from '../client';
import { createTestWarehouse } from '../testing/warehouse';
import { purgeTestData } from '../testing/cleanup';
import {
  AnalyticsDailyService,
  AnalyticsProductDailyService,
  AnalyticsReportService,
  AnalyticsSearchDailyService,
  AnalyticsSessionService,
  AnalyticsSourceDailyService,
} from './analytics.service';
import { CategoryService } from './category.service';
import { OrderService } from './order.service';
import { ProductService } from './product.service';
import { UserProfileService } from './user-profile.service';
import { WarehouseService } from './warehouse.service';

/**
 * Analitik iki işi ayrı sayar: olayın işi özetlerde bir boyuttur, sipariş okumalarının işi deposundan gelir ve süzgeçsiz okuma iki işi
 * birlikte toplar (`ANALYTICS.md` §3, §5).
 */
const db = serviceDb();
const daily = new AnalyticsDailyService(db);
const products = new AnalyticsProductDailyService(db);
const searches = new AnalyticsSearchDailyService(db);
const sources = new AnalyticsSourceDailyService(db);
const sessions = new AnalyticsSessionService(db);
const reports = new AnalyticsReportService(db);
const profiles = new UserProfileService(db);

const stamp = Date.now();
const lezzetKey = `test-${stamp}-is-l`;
const lezzetKey2 = `test-${stamp}-is-l2`;
const qualiteKey = `test-${stamp}-is-q`;
const path = `/is-${stamp}`;
const query = `pide-${stamp}`;
const campaign = `is-kampanya-${stamp}`;
const productId = `00000000-0000-4000-8002-${String(stamp).slice(-12).padStart(12, '0')}`;

/** Paris'te dün: özet bugünü üretmez; `at` o günün Paris duvar saatindeki anıdır. */
const day = addDays(parisDateOf(new Date()), -1);
const at = (hour: number) => new Date(Date.parse(parisDayRange(day).from) + (hour * 60 + 30) * 60_000).toISOString();

/** Siparişler kimsenin yazmadığı geçmiş bir güne taşınır ki paylaşılan veritabanında okuma yalnız bu testin siparişlerini görsün. */
const orderDay = addDays('1990-01-01', stamp % 9000);

let lezzetDepo: string;
let qualiteDepo: string;
let lezzetMusteri: string;
let qualiteMusteri: string;
let categoryId: string;
let orderProductId: string;

beforeAll(async () => {
  await sessions.remember({ sessionKey: qualiteKey, utm: { source: 'test', campaign } });
  // Kanal ve öteki boyutlar iki işte aynıdır; iş boyut olmasaydı iki işin olayları tek satırda toplanırdı.
  const { error } = await db.from('analytics_event').insert([
    { created_at: at(9), type: 'page_view', session_key: lezzetKey, path, channel: 'b2b', business: 'lezzet', surface: 'web' },
    { created_at: at(10), type: 'page_view', session_key: lezzetKey2, path, channel: 'b2b', business: 'lezzet', surface: 'web' },
    { created_at: at(10), type: 'page_view', session_key: qualiteKey, path, channel: 'b2b', business: 'qualite', surface: 'web' },
    { created_at: at(11), type: 'product_view', session_key: lezzetKey, product_id: productId, business: 'lezzet', surface: 'web' },
    { created_at: at(11), type: 'product_view', session_key: lezzetKey2, product_id: productId, business: 'lezzet', surface: 'web' },
    { created_at: at(11), type: 'product_view', session_key: qualiteKey, product_id: productId, business: 'qualite', surface: 'web' },
    {
      created_at: at(12),
      type: 'search',
      session_key: lezzetKey,
      meta: { query, zeroResultKind: 'search' },
      business: 'lezzet',
      surface: 'web',
    },
    {
      created_at: at(12),
      type: 'search',
      session_key: qualiteKey,
      meta: { query, zeroResultKind: 'search' },
      business: 'qualite',
      surface: 'web',
    },
    {
      created_at: at(13),
      type: 'search',
      session_key: qualiteKey,
      meta: { query, zeroResultKind: 'search' },
      business: 'qualite',
      surface: 'web',
    },
    { created_at: at(14), type: 'order_placed', session_key: qualiteKey, business: 'qualite', surface: 'web' },
  ]);
  if (error) throw error;
  await daily.buildAll(day);

  lezzetDepo = (await createTestWarehouse(db, { label: 'ANL' })).id;
  qualiteDepo = (await createTestWarehouse(db, { label: 'ANQ' })).id;
  await new WarehouseService(db).update({ id: qualiteDepo, business: 'qualite' });
  categoryId = (await new CategoryService(db).create({ name: { tr: `Analitikte iş ${stamp}` } })).id;
  const { product, variants } = await new ProductService(db).create({
    name: { tr: `Pide ${stamp}` },
    categoryId,
    variants: [{ label: { tr: '1 adet' } }],
  });
  orderProductId = product.id;
  lezzetMusteri = (await profiles.insert({ name: `Analitik Lezzet ${stamp}` })).id;
  qualiteMusteri = (
    await profiles.insert({ name: `Analitik QUALITE ${stamp}`, type: 'company', companyInfo: { legalName: `SARL Analitik ${stamp}` } })
  ).id;
  await profiles.approveB2b(qualiteMusteri);
  await profiles.update({ id: qualiteMusteri, business: 'qualite' });

  const orders = new OrderService(db);
  const satis = async (customerId: string, warehouseId: string, channel: 'b2b' | 'b2c', cents: number) =>
    (
      await orders.create({ customerId, warehouseId, channel, orderedTotalCents: cents, status: 'confirmed' }, [
        { variantId: variants[0]!.id, qty: 1, unitPriceCents: cents, vatRate: 5.5 },
      ])
    ).order.id;
  const ids = [await satis(lezzetMusteri, lezzetDepo, 'b2c', 1000), await satis(qualiteMusteri, qualiteDepo, 'b2b', 2500)];
  const tasima = await db
    .from('order')
    .update({ created_at: `${orderDay}T10:00:00Z` })
    .in('id', ids);
  if (tasima.error) throw tasima.error;
});

afterAll(async () => {
  // Müşterilerin siparişleri profillerle birlikte gider; damgalı yolun gün özeti satırı başka koşuların günüyle paylaşıldığı için kalır.
  await purgeTestData(db, {
    analyticsSessionKeys: [lezzetKey, lezzetKey2, qualiteKey],
    analyticsSearchQueries: [query],
    productIds: [productId, orderProductId],
    categoryIds: [categoryId],
    profileIds: [lezzetMusteri, qualiteMusteri],
    warehouseIds: [lezzetDepo, qualiteDepo],
  });
});

describe('olayın işi özetlerde boyuttur', () => {
  it('aynı boyutlu olaylar iki işte ayrı satırdır, saat kırılımı da işe göre ayrılır', async () => {
    const satirlar = (await daily.list({ from: day, to: day, types: ['page_view'] })).filter((r) => r.path === path);
    const lezzet = satirlar.find((r) => r.business === 'lezzet');
    const qualite = satirlar.find((r) => r.business === 'qualite');
    expect(satirlar).toHaveLength(2);
    expect([lezzet?.eventCount, qualite?.eventCount]).toEqual([2, 1]);
    // Saat 10'da iki işin birer olayı var; birleşim işi görmeseydi iki kova birbirine karışırdı.
    expect([lezzet?.hourly[9], lezzet?.hourly[10], qualite?.hourly[10]]).toEqual([1, 1, 1]);

    const yalnizQualite = (await daily.list({ from: day, to: day, types: ['page_view'], business: 'qualite' })).filter(
      (r) => r.path === path,
    );
    expect(yalnizQualite.map((r) => r.eventCount)).toEqual([1]);
  });

  it('ürün, arama ve kaynak okumaları işe göre süzülür; süzgeçsiz okuma iki işi toplar', async () => {
    const goruntuleme = async (business?: Business) =>
      (await products.signals(day, day, 500, business)).find((r) => r.productId === productId)?.viewCount;
    expect([await goruntuleme(), await goruntuleme('lezzet'), await goruntuleme('qualite')]).toEqual([3, 2, 1]);

    const arama = async (business?: Business) =>
      (await searches.signals(day, day, 500, true, business)).find((r) => r.query === query)?.searchCount;
    expect([await arama(), await arama('lezzet'), await arama('qualite')]).toEqual([3, 1, 2]);

    const kaynak = async (business?: Business) => (await sources.list(day, day, business)).filter((r) => r.campaign === campaign);
    expect((await kaynak('qualite')).map((r) => [r.business, r.sessionCount, r.orderSessionCount])).toEqual([['qualite', 1, 1]]);
    expect(await kaynak('lezzet')).toEqual([]);
  });
});

describe('siparişin işi deposundandır', () => {
  it('dönem cirosu ve kampanya cirosu işe göre süzülür', async () => {
    const ciro = async (business?: Business) =>
      (await reports.orderRevenue(orderDay, orderDay, business)).map((r) => [r.channel, r.revenueCents, r.orderCount]);
    expect(await ciro('lezzet')).toEqual([['b2c', 1000, 1]]);
    expect(await ciro('qualite')).toEqual([['b2b', 2500, 1]]);
    expect((await ciro()).sort()).toEqual([
      ['b2b', 2500, 1],
      ['b2c', 1000, 1],
    ]);

    const kampanya = async (business?: Business) =>
      (await reports.campaignRevenue(orderDay, orderDay, business)).reduce((toplam, r) => toplam + r.revenueCents, 0);
    expect([await kampanya(), await kampanya('lezzet'), await kampanya('qualite')]).toEqual([3500, 1000, 2500]);
  });

  it('segment sayısı ve üyeleri aynı işten okunur', async () => {
    // Bu eşiklerle `lost` yalnız son siparişi `orderDay`de ya da öncesinde kalan müşterilerdir.
    const esik = { reference: addDays(orderDay, 1), dormantDays: 0, newDays: 0 };
    for (const [business, bizim, oteki] of [
      ['qualite', qualiteMusteri, lezzetMusteri],
      ['lezzet', lezzetMusteri, qualiteMusteri],
    ] as const) {
      const uyeler = (await reports.segmentMembers('lost', 50, 0, { ...esik, business })).map((m) => m.customerId);
      expect(uyeler).toContain(bizim);
      expect(uyeler).not.toContain(oteki);
      const sayi = (await reports.customerSegments({ ...esik, business })).find((s) => s.segment === 'lost')?.customerCount;
      expect(sayi).toBe(uyeler.length);
    }
  });
});
