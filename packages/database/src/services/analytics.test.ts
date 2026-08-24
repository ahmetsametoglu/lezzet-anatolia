import { afterAll, describe, expect, it } from 'vitest';
import { serviceDb } from '../client';
import { purgeTestData } from '../testing/cleanup';
import {
  AnalyticsDailyService,
  AnalyticsEventService,
  AnalyticsProductDailyService,
  AnalyticsReportService,
  AnalyticsSearchDailyService,
  AnalyticsSourceDailyService,
  AnalyticsSessionService,
} from './analytics.service';

/**
 * Analitik I/O (13.1) — kurallar `docs/architecture/ANALYTICS.md`'de.
 *
 * **Sınanan şey sayı değil DAVRANIŞ:** özet idempotent mi, `null` boyutlu satır çoğalıyor mu, saat
 * kırılımı doğru kovaya düşüyor mu, oturum künyesi ikinci kez yazılınca eziliyor mu.
 *
 * **Küresel sayıya bakılmıyor** (`CLAUDE §4b`): üç ajan aynı veritabanını paylaşıyor ve özet tablosu
 * gün bazlı — başka bir koşunun yazdığı satır toplamı oynatır. Her sınama kendi damgalı oturum
 * anahtarına ve kendi ürettiği güne kilitli.
 */
const db = serviceDb();
const events = new AnalyticsEventService(db);
const sessions = new AnalyticsSessionService(db);
const daily = new AnalyticsDailyService(db);

const products = new AnalyticsProductDailyService(db);
const searches = new AnalyticsSearchDailyService(db);
const sources = new AnalyticsSourceDailyService(db);
const reports = new AnalyticsReportService(db);

const stamp = Date.now();
const sessionKey = `test-${stamp}`;
const otherKey = `test-${stamp}-b`;
/** Damgalı bir ürün kimliği: defterde FK yok, yani var olmayan bir ürün de ölçülebilir (bilinçli). */
const productId = `00000000-0000-4000-8000-${String(stamp).slice(-12).padStart(12, '0')}`;
/**
 * İkinci damgalı ürün — "hiç satılabilir görünmemiş" hâli için. Temizliği `afterAll`'da, sınamanın
 * içinde DEĞİL: FK'siz olduğu için hiçbir cascade onu toplamıyor, o yüzden düşen ya da kesilen bir
 * koşuda satır kalıcı oluyordu (ölçüldü 09.08: 3 öksüz satır, `demand_signals` çıktısını
 * "(silinmiş ürün)" ile dolduruyordu). Teardown, testin geçmesine bağlı olmamalı.
 */
const soldOutOnlyProductId = `00000000-0000-4000-8001-${String(stamp).slice(-12).padStart(12, '0')}`;
/**
 * **GERÇEK** bir ürün — sentetik olamaz (08.56): özet, ürün kimliği yazılmamış satırlarda kırılımı
 * `product_variant` tablosundan çözüyor ve o tablonun `product`a FK'si var. Kimlik testin içinde
 * doğuyor, temizliği `afterAll`'da: teardown testin geçmesine bağlı olmamalı (üstteki künye).
 */
let gercekUrunId: string | null = null;
const searchQuery = `lahmacun-${stamp}`;
const campaign = `kampanya-${stamp}`;
/**
 * Yol da DAMGALI — oturum anahtarı damgalıyken süzgeç sabit `/catalog`taydı ve günlük özet
 * o boyutta BÜTÜN oturumları topluyor: yerelde dolaşan gerçek bir gezinme (ya da başka şeridin
 * fikstürü) aynı gün+yol+kanal satırına karışıp sayıyı 3'ten 14'e taşıdı (mobil şeridin ölçümü,
 * 17.08). CLAUDE §4b: kendi kurduğun satırları say — teardown da kurtaramaz, kirleten satırlar
 * testin değil.
 */
const searchPath = `/catalog-${stamp}`;

/** Dünün tarihi: özet BUGÜNÜ üretmiyor (gün kapanmadan üretilen özet eksiktir) — iş de öyle davranıyor. */
const day = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
const at = (hour: number) => `${day}T${String(hour).padStart(2, '0')}:30:00.000Z`;

afterAll(async () => {
  await purgeTestData(db, {
    analyticsSessionKeys: [sessionKey, otherKey],
    // Gerçek ürün de purge'e giriyor: varyantı ve özet satırı onunla düşer (sıra `cleanup.ts`'te).
    productIds: [productId, soldOutOnlyProductId, ...(gercekUrunId ? [gercekUrunId] : [])],
    analyticsSearchQueries: [searchQuery],
  });
  // GÜN özeti satırları testin ürettiği güne ait; başka koşular da aynı güne yazabildiği için
  // silinmiyorlar (küresel satır). Sınamalar zaten kendi boyutlarına bakıyor. Ürün ve arama
  // özetleri damgalı anahtar taşıdığı için purge'ün hedefinde.
});

describe('olay defteri — YAZMA-YALNIZ', () => {
  it('olay yazılır ve satır geri istenmez', async () => {
    await expect(
      events.record({
        type: 'product_view',
        sessionKey,
        path: '/product/[slug]',
        channel: 'b2c',
        availability: 'sellable',
        surface: 'web',
      }),
    ).resolves.toBeUndefined();
  });

  it('AYNI oturumda aynı tip İKİ KEZ yazılabilir — tekilleştirme YOK ve bu bir karar', async () => {
    // Sepeti bölünen müşteri iki sipariş verir, kartı reddedilen tekrar dener: ikisi de gerçek
    // birer NİYETTİR (kullanıcı kararı 04.08). Bir tur "oturum başına bir kez" kuralı yazılmıştı;
    // olay dönüş SAYFASINDAN atılacak sanılıyordu. Artık sunucu eyleminden atılıyor, yani
    // yenileme sorunu yok — kural kalsaydı ikinci niyeti sessizce yutardı.
    const taze = `test-${stamp}-niyet`;
    await events.record({ type: 'order_placed', sessionKey: taze, surface: 'web' });
    // İkinci niyet NATIVE'den gelmiş olabilir — yüzey ayrı, sayım aynı deftere düşer (24.08).
    await events.record({ type: 'order_placed', sessionKey: taze, surface: 'native' });

    const { count } = await db
      .from('analytics_event')
      .select('type', { count: 'exact', head: true })
      .eq('session_key', taze)
      .eq('type', 'order_placed');
    expect(count).toBe(2);

    await purgeTestData(db, { analyticsSessionKeys: [taze] });
  });

  it('KİMLİK kolonu yok — tipte de yok, şemada da yok', async () => {
    // Derleme zaten engelliyor; burada sınanan şey satırın yazılabilmesi, yani şemanın kolonu
    // gerçekten istemediği. `customer_id` zorunlu olsaydı bu yazım düşerdi.
    await expect(events.record({ type: 'page_view', sessionKey, path: '/', surface: 'web' })).resolves.toBeUndefined();
  });
});

describe('oturum künyesi BİR KEZ yazılır', () => {
  it('ikinci yazım öncekini EZMEZ — UTM yalnız ilk istekte vardır', async () => {
    await sessions.remember({ sessionKey: otherKey, utm: { source: 'ilk' }, source: 'google' });
    await sessions.remember({ sessionKey: otherKey, utm: { source: 'ikinci' }, source: 'facebook' });

    const { data } = await db.from('analytics_session').select('utm,source').eq('session_key', otherKey).single();
    expect((data as { utm: { source: string } }).utm.source).toBe('ilk');
  });
});

describe('günlük özet', () => {
  it('boyutlara göre gruplar, saat kırılımını doğru kovaya yazar', async () => {
    await events.record({ type: 'search', sessionKey, path: searchPath, channel: 'b2c', availability: null, surface: 'web' });
    // Aynı boyut, farklı saat → aynı satır, farklı kova.
    await db.from('analytics_event').insert([
      { created_at: at(9), type: 'search', session_key: sessionKey, path: searchPath, channel: 'b2c', surface: 'web' },
      { created_at: at(9), type: 'search', session_key: otherKey, path: searchPath, channel: 'b2c', surface: 'web' },
      { created_at: at(14), type: 'search', session_key: sessionKey, path: searchPath, channel: 'b2c', surface: 'web' },
    ]);

    await daily.build(day);
    const rows = await daily.list({ from: day, to: day, types: ['search'] });
    const satir = rows.find((r) => r.path === searchPath && r.channel === 'b2c');

    expect(satir?.eventCount).toBe(3);
    // İKİ oturum: `count(distinct session_key)`.
    expect(satir?.sessionCount).toBe(2);
    expect(satir?.hourly).toHaveLength(24);
    expect(satir?.hourly[9]).toBe(2);
    expect(satir?.hourly[14]).toBe(1);
    // Olay düşmeyen saat 0 — eksik değil, o saatte gerçekten kimse yoktu.
    expect(satir?.hourly[3]).toBe(0);
  });

  it('İDEMPOTENT — ikinci koşu satırı çoğaltmaz, üzerine yazar', async () => {
    const once = (await daily.list({ from: day, to: day, types: ['search'] })).length;
    await daily.build(day);
    const sonra = await daily.list({ from: day, to: day, types: ['search'] });
    expect(sonra.length).toBe(once);
  });

  it('`null` BOYUTLU satır da çoğalmaz — `nulls not distinct` olmasaydı sessizce ikilenirdi', async () => {
    // `warehouse_id` ve `availability` null: yer seçmemiş ziyaretçinin engellenen sepeti.
    await db.from('analytics_event').insert([
      { created_at: at(11), type: 'cart_blocked', session_key: sessionKey, path: '/cart', blocked_reason: 'min_basket', surface: 'web' },
    ]);
    await daily.build(day);
    const ilk = (await daily.list({ from: day, to: day, types: ['cart_blocked'] })).filter((r) => r.warehouseId === null);
    await daily.build(day);
    const ikinci = (await daily.list({ from: day, to: day, types: ['cart_blocked'] })).filter((r) => r.warehouseId === null);

    expect(ikinci.length).toBe(ilk.length);
    expect(ilk.length).toBeGreaterThan(0);
  });

  it('TERK SEBEBİ özette bir boyut — huninin en değerli kırılımı ekrana ancak böyle ulaşır', async () => {
    const rows = await daily.list({ from: day, to: day, types: ['cart_blocked'] });
    expect(rows.some((r) => r.blockedReason === 'min_basket')).toBe(true);
  });
});

/**
 * Sinyal özetleri (13.2 · 13.4) — `analytics_daily`'nin taşıyamadığı üç kırılım.
 *
 * Hepsi aynı günü paylaşıyor ve o güne başka ajanlar da yazıyor; bu yüzden her sınama KENDİ damgalı
 * kovasına bakıyor (`CLAUDE §4b`: küresel sayıya bakan test yazma).
 */
describe('sinyal özetleri', () => {
  it('ürün kırılımı: satılabilir görüntüleme AYRI sayılır ve oran ondan çıkar', async () => {
    await db.from('analytics_event').insert([
      { created_at: at(10), type: 'product_view', session_key: sessionKey, product_id: productId, availability: 'sellable', surface: 'web' },
      { created_at: at(10), type: 'product_view', session_key: otherKey, product_id: productId, availability: 'sellable', surface: 'web' },
      // Stoksuzken bakılan görüntüleme: toplam görüntülemeye girer, PAYDAYA girmez.
      { created_at: at(11), type: 'product_view', session_key: sessionKey, product_id: productId, availability: 'sold_out', surface: 'web' },
      { created_at: at(12), type: 'add_to_cart', session_key: sessionKey, product_id: productId, surface: 'web' },
    ]);
    await daily.buildAll(day);

    const [signal] = await products.signals(day, day, 50).then((rows) => rows.filter((r) => r.productId === productId));
    expect(signal?.viewCount).toBe(3);
    expect(signal?.sellableViewCount).toBe(2);
    expect(signal?.cartCount).toBe(1);
    // 1 / 2 — payda TOPLAM görüntüleme (3) olsaydı 0.33 çıkardı ve ürün olduğundan ilgisiz görünürdü.
    expect(signal?.cartRate).toBeCloseTo(0.5);
  });

  /**
   * **ATICI'nın yazdığı şekle bakan tek test** (08.56 · 24.08).
   *
   * Üstteki sınama `product_id`yi ELDEN veriyor ve geçiyordu; oysa sepete ekleme kapısı öyle
   * yazmıyor. `AddToCartIntent` ürünü değil VARYANTI taşıyor (bilinçli — `cart-types.ts` künyesi:
   * istemcinin elindeki `CartEntry` ürünü tanımıyor, sunucuda doldurmak en sıcak yazma yoluna
   * fazladan bir okuma eklerdi), atıcı da `product_id: null` yazıyor. Özet o satırları eliyordu ve
   * `cart_count` **yapısal olarak sıfırdı**.
   *
   * Kırık olan rollup DEĞİLDİ, onu kapsayan test yoktu: mevcut test doğru olanı doğruluyordu.
   * Bu yüzden fikstür ham `insert` ile ve KAPININ yazdığı şekilde kuruluyor — ürün kimliği YOK,
   * özne varyant. Gerçek bir `product_variant` satırı şart: çözüm o tablodan okunuyor.
   */
  it('ürün kimliği YAZILMAMIŞ sepete ekleme de sayılır — özet onu varyanttan çözer', async () => {
    const { data: urun } = await db
      .from('product')
      .insert({ name: { tr: `Atıcı Kanıtı ${stamp}` }, slug: `atici-kaniti-${stamp}`, status: 'active' })
      .select('id')
      .single();
    gercekUrunId = urun!.id as string;
    const { data: boy } = await db
      .from('product_variant')
      .insert({ product_id: gercekUrunId, label: { tr: '1 kg' } })
      .select('id')
      .single();

    await db.from('analytics_event').insert([
      // Kapının yazdığı hâl: ürün kimliği YOK, özne varyant.
      { created_at: at(14), type: 'add_to_cart', session_key: sessionKey, subject_type: 'variant', subject_id: boy!.id, surface: 'web' },
      // PAKET satırı atfedilmemeli: paket bir ürün değil, ürünlerin demeti.
      { created_at: at(14), type: 'add_to_cart', session_key: sessionKey, subject_type: 'bundle', subject_id: gercekUrunId, surface: 'web' },
    ]);
    await daily.buildAll(day);

    const [signal] = await products.signals(day, day, 200).then((rows) => rows.filter((r) => r.productId === gercekUrunId));
    // Düzeltmeden önce bu sayı 0'dı ve hiçbir test bunu görmüyordu.
    expect(signal?.cartCount).toBe(1);
  });

  it('ürün oranı payda SIFIRKEN `null` — sıfır değil (ölçülemeyen değer sıfır değildir)', async () => {
    // Hiç satılabilir hâlde görünmemiş bir ürün: "kimse almıyor" DEĞİL, "hiç satılamamış".
    const stoksuz = soldOutOnlyProductId;
    await db.from('analytics_event').insert([
      { created_at: at(13), type: 'product_view', session_key: sessionKey, product_id: stoksuz, availability: 'sold_out', surface: 'web' },
    ]);
    await daily.buildAll(day);

    const [signal] = await products.signals(day, day, 50).then((rows) => rows.filter((r) => r.productId === stoksuz));
    expect(signal?.viewCount).toBe(1);
    expect(signal?.cartRate).toBeNull();
  });

  it('arama: sıfır-sonuç kovası AYRI satır — süzgeç boşluğu ile çeşit boşluğu karışmaz', async () => {
    await db.from('analytics_event').insert([
      { created_at: at(9), type: 'search', session_key: sessionKey, meta: { query: searchQuery, resultCount: 0, zeroResultKind: 'search' }, surface: 'web' },
      { created_at: at(9), type: 'search', session_key: otherKey, meta: { query: searchQuery, resultCount: 0, zeroResultKind: 'search' }, surface: 'web' },
      { created_at: at(10), type: 'search', session_key: sessionKey, meta: { query: searchQuery, resultCount: 4, zeroResultKind: null }, surface: 'web' },
    ]);
    await daily.buildAll(day);

    const hepsi = (await searches.signals(day, day, 200, false)).filter((r) => r.query === searchQuery);
    expect(hepsi).toHaveLength(2);

    const sifir = (await searches.signals(day, day, 200, true)).filter((r) => r.query === searchQuery);
    expect(sifir).toHaveLength(1);
    expect(sifir[0]?.zeroResultKind).toBe('search');
    expect(sifir[0]?.searchCount).toBe(2);
    expect(sifir[0]?.sessionCount).toBe(2);
  });

  it('kaynak: künyeli oturum kendi kovasında, künyesiz oturum DOĞRUDAN kovasında', async () => {
    await sessions.remember({ sessionKey, utm: { source: 'instagram', campaign, medium: 'cpc' }, source: 'instagram.com' });
    await db.from('analytics_event').insert([{ created_at: at(15), type: 'order_placed', session_key: sessionKey, surface: 'web' }]);
    await daily.buildAll(day);

    const rows = await sources.list(day, day);
    const bizim = rows.find((r) => r.campaign === campaign);
    expect(bizim?.source).toBe('instagram');
    expect(bizim?.sessionCount).toBe(1);
    // Oturum siparişle bitti → kaynağın kendi dönüşümü. Ciro DEĞİL: o `acquisition_source`'tan gelir.
    expect(bizim?.orderSessionCount).toBe(1);

    // `otherKey` künyesiz: sol birleşim onu düşürmemeli, `source: null` kovasına koymalı. İç
    // birleşim yazsaydık doğrudan trafik hiç görünmez ve her kaynağın payı şişerdi.
    expect(rows.some((r) => r.source === null)).toBe(true);
  });
});

/**
 * Defter DIŞI okumalar (13.2 · 13.5) — kaynağı sipariş ve müşteri tablosu.
 *
 * **Sayılara değil DAVRANIŞA bakılıyor:** paylaşılan veritabanında sipariş sayısı her koşuda başka
 * bir şey; sınanan şey sözleşmenin tutması (satır şekli, segment kümesi, sayı-liste tutarlılığı).
 */
describe('rapor okumaları', () => {
  const bugun = new Date().toISOString().slice(0, 10);

  it('kampanya cirosu: etiketsiz kova DÜŞÜRÜLMEZ — toplam dönemin gerçek cirosunu tutmalı', async () => {
    const rows = await reports.campaignRevenue('2020-01-01', bugun);
    expect(Array.isArray(rows)).toBe(true);
    for (const r of rows) {
      expect(r.revenueCents).toBeTypeOf('number');
      // Yeni müşteri sayısı, o kaynaktan sipariş veren müşteri sayısını AŞAMAZ.
      expect(r.newCustomerCount).toBeLessThanOrEqual(r.customerCount);
    }
  });

  it('İKİ CİRO AYNI TANIMDAN ÇIKAR — dönem cirosu ile kampanya cirosunun toplamı eşit', async () => {
    // Bu testin koruduğu şey bir sayı değil, `analytics_order_base` görünümünün VAR OLMA sebebi:
    // "hangi sipariş ciro sayılır" üç yerde ayrı yazılsaydı biri iadeyi düşer öteki düşmezdi ve
    // aynı ekranda iki farklı ciro belirirdi — hiçbiri hata vermeden.
    const donem = await reports.orderRevenue('2020-01-01', bugun);
    const kampanya = await reports.campaignRevenue('2020-01-01', bugun);

    const topla = (rows: Array<{ revenueCents: number; orderCount: number }>) => ({
      ciro: rows.reduce((a, r) => a + r.revenueCents, 0),
      siparis: rows.reduce((a, r) => a + r.orderCount, 0),
    });

    expect(topla(donem)).toEqual(topla(kampanya));
  });

  it('dönem cirosu KANALA göre ayrışır — karışık ölçüm yalan söyler', async () => {
    const rows = await reports.orderRevenue('2020-01-01', bugun);
    for (const r of rows) {
      expect(['b2c', 'b2b']).toContain(r.channel);
      expect(r.orderCount).toBeGreaterThan(0);
    }
    // Aynı gün iki kanal varsa AYRI satırdır (aynı satırda toplanmaz).
    const anahtarlar = rows.map((r) => `${r.day}|${r.channel}`);
    expect(new Set(anahtarlar).size).toBe(anahtarlar.length);
  });

  it('segmentler TÜRETİLİR ve küme kapalı — saklanan bir kolon yok', async () => {
    const rows = await reports.customerSegments();
    for (const r of rows) {
      expect(['champion', 'new', 'active', 'dormant', 'lost']).toContain(r.segment);
    }
  });

  it('sayı ile LİSTE aynı ölçütten çıkar — köprünün iki ucu ayrışırsa köprü çalışmıyor demektir', async () => {
    const counts = await reports.customerSegments();
    const dolu = counts.find((c) => c.customerCount > 0);
    if (!dolu) return; // Yerelde hiç sipariş yoksa sınanacak bir köprü de yok.

    const members = await reports.segmentMembers(dolu.segment, 500);
    expect(members).toHaveLength(Math.min(dolu.customerCount, 500));
  });

  it('eşik PARAMETRİK: uyuyan sınırı düşünce aktifler uyuyana kayar', async () => {
    const genis = await reports.customerSegments({ dormantDays: 3650, newDays: 0 });
    const dar = await reports.customerSegments({ dormantDays: 1, newDays: 0 });

    const say = (rows: Awaited<ReturnType<typeof reports.customerSegments>>, segment: string) =>
      rows.find((r) => r.segment === segment)?.customerCount ?? 0;

    // Aynı müşteri kümesi, iki farklı eşik: dar pencerede "aktif" olan kimse kalmamalı.
    expect(say(dar, 'active')).toBeLessThanOrEqual(say(genis, 'active'));
    expect(say(dar, 'dormant') + say(dar, 'lost')).toBeGreaterThanOrEqual(say(genis, 'dormant') + say(genis, 'lost'));
  });
});
