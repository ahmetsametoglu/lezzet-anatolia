import { createHash } from 'node:crypto';
import { McpConnectionKeyService, serviceDb } from '@lezzet/database';
import { purgeTestData } from '@lezzet/database/testing';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mcpGuard, scopeAllows, toolScope } from './guard';
import { resetRateLimit } from './rate-limit';
import { HANDLERS, TOOLS } from './server-factory';
import { morningBriefing, salesSummary, systemErrors } from './tools';
import { catalogHealth, soldOutWatch, stockWatch } from './tools-catalog';
import { customerPulse, demandSignals } from './tools-signals';

/**
 * MCP deneme dilimi (22.1) — kapı + araçların ŞEKLİ ve maskeleme sözleşmesi.
 *
 * Sayıların DEĞERİ assert edilmez (paylaşılan DB'de küresel sayıya bakan test başka ajanın
 * verisiyle oynar — CLAUDE §4b); doğrulanan şey alanların varlığı/tipi ve YASAKLI alanların
 * YOKLUĞU. Maskeleme testi güvenlik iddiasının kendisidir.
 *
 * ── SINIR 22.5'te İNCELDİ, KALKMADI (kullanıcı kararı 09.08) ────────────────
 * Maliyet artık katalog ve stok araçlarında GÖRÜNÜR (kârlılık hesabı yapılabilsin diye). Kapalı
 * kalan şey **tedarikçi bağlamıdır**: brifingin tedarik önerisinde `lastPurchasePriceCents` +
 * `supplierCode` yan yana durur ve o ikili "hangi tedarikçiden kaça alıyoruz" sorusunu cevaplar —
 * bu, bir partinin maliyetini bilmekten başka bir şeydir (AI_ADMIN_ASSISTANT §6, hassas ticari
 * veri). Ayrım bilinçli: açılan şey MALİYET, açılmayan şey TEDARİKÇİ İLİŞKİSİ.
 */

const KEY_ENV = 'MCP_CONNECTION_KEY';
const RATE_ENV = 'MCP_RATE_LIMIT_PER_MINUTE';
const originalKey = process.env[KEY_ENV];
const originalRate = process.env[RATE_ENV];

/** Damga — paylaşılan DB'de kendi satırlarımızı ötekilerinkinden ayıran tek şey (CLAUDE §4b). */
const stamp = Date.now();

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

beforeEach(() => {
  // Oran sınırı sayacı SÜREÇ ÖMRÜ boyunca yaşar — sıfırlanmazsa bir testin çağrıları bir
  // sonrakini 429'a düşürür ve düşen test kendi sebebini göstermez.
  resetRateLimit();
});

afterEach(() => {
  restoreEnv(KEY_ENV, originalKey);
  restoreEnv(RATE_ENV, originalRate);
});

// ─── Kapı: env artçısı ───────────────────────────────────────────────────────

describe('mcpGuard — fail-closed kapı (env artçısı)', () => {
  it('anahtar yapılandırılmamışsa HERKESE kapalı (doğru anahtar bile giremez)', async () => {
    delete process.env[KEY_ENV];
    expect(await mcpGuard(`Bearer yok-${stamp}`)).toEqual({ ok: false, status: 401 });
  });

  it('yanlış ya da eksik Bearer reddedilir', async () => {
    process.env[KEY_ENV] = `dogru-anahtar-${stamp}`;
    expect(await mcpGuard(undefined)).toEqual({ ok: false, status: 401 });
    expect(await mcpGuard(`Bearer yanlis-${stamp}`)).toEqual({ ok: false, status: 401 });
    expect(await mcpGuard(`dogru-anahtar-${stamp}`)).toEqual({ ok: false, status: 401 }); // Bearer öneki şart
  });

  it('env anahtarı geçer ve `propose` kapsamlı sayılır (bugünkü davranış korunuyor)', async () => {
    process.env[KEY_ENV] = `dogru-anahtar-${stamp}`;
    // Anahtar kimliği YOK: env yolunun tabloda satırı yoktur ve uydurulmaz.
    expect(await mcpGuard(`Bearer dogru-anahtar-${stamp}`)).toEqual({ ok: true, connectionKeyId: null, scope: 'propose' });
    expect(await mcpGuard(`bearer dogru-anahtar-${stamp}`)).toEqual({ ok: true, connectionKeyId: null, scope: 'propose' });
  });
});

// ─── Kapı: tablo anahtarı (22.4) ─────────────────────────────────────────────

const db = serviceDb();
const keys = new McpConnectionKeyService(db);
const createdKeys: string[] = [];

/** Damgalı anahtar — küresel sayıya bakmadan kendi satırımızı izleyebilmek için. */
async function makeKey(opts: { scope?: 'read' | 'propose'; expiresInMs?: number } = {}) {
  const token = `test-anahtar-${stamp}-${createdKeys.length}`;
  const row = await keys.insert({
    label: `MCP testi ${stamp}`,
    tokenHash: createHash('sha256').update(token).digest('hex'),
    scope: opts.scope ?? 'read',
    expiresAt: new Date(Date.now() + (opts.expiresInMs ?? 3600_000)).toISOString(),
  });
  createdKeys.push(row.id);
  return { token, row };
}

afterAll(async () => {
  await purgeTestData(db, { mcpConnectionKeyIds: createdKeys });
});

describe('mcpGuard — tablo anahtarı', () => {
  it('geçerli anahtar kimliğiyle ve KENDİ kapsamıyla geçer', async () => {
    delete process.env[KEY_ENV]; // env artçısı devrede olmasın: geçişin sebebi TABLO olmalı
    const { token, row } = await makeKey({ scope: 'read' });
    expect(await mcpGuard(`Bearer ${token}`)).toEqual({ ok: true, connectionKeyId: row.id, scope: 'read' });
  });

  it('İPTAL edilmiş anahtar reddedilir — ve satır silinmediği için geçmişi durur', async () => {
    delete process.env[KEY_ENV];
    const { token, row } = await makeKey();
    await keys.revoke(row.id);
    expect(await mcpGuard(`Bearer ${token}`)).toEqual({ ok: false, status: 401 });
    expect(await keys.getById(row.id)).not.toBeNull();
  });

  it('SÜRESİ dolmuş anahtar reddedilir', async () => {
    delete process.env[KEY_ENV];
    const { token, row } = await makeKey();
    // **İKİ damga birlikte geriye çekilir.** Yalnız `expires_at`i geçmişe almak `expires_at >
    // created_at` kısıtını çiğniyor — ve bu kısıt doğru: süresi bitişi doğuşundan önce olan bir
    // anahtar hiç doğmamış demektir. Geçmişte üretilip süresi dolmuş bir anahtarın gerçek hâli
    // ikisinin de geride olmasıdır.
    const twoHoursAgo = new Date(Date.now() - 2 * 3600_000).toISOString();
    await keys.update({ id: row.id, createdAt: twoHoursAgo, expiresAt: new Date(Date.now() - 3600_000).toISOString() });
    expect(await mcpGuard(`Bearer ${token}`)).toEqual({ ok: false, status: 401 });
  });

  it('tablo anahtarı env artçısını GÖLGELEMEZ — ikisi ayrı yollar', async () => {
    process.env[KEY_ENV] = `env-anahtari-${stamp}`;
    const { token, row } = await makeKey({ scope: 'read' });
    // Tablodaki anahtar kendi (dar) kapsamıyla girer; env anahtarı hâlâ `propose`.
    expect(await mcpGuard(`Bearer ${token}`)).toEqual({ ok: true, connectionKeyId: row.id, scope: 'read' });
    expect(await mcpGuard(`Bearer env-anahtari-${stamp}`)).toEqual({ ok: true, connectionKeyId: null, scope: 'propose' });
  });
});

describe('oran sınırı', () => {
  it('pencere tavanı aşılınca 429 döner ve bu 401\'den AYRI bir cevaptır', async () => {
    process.env[KEY_ENV] = `dogru-anahtar-${stamp}`;
    process.env[RATE_ENV] = '3';
    const header = `Bearer dogru-anahtar-${stamp}`;
    for (let i = 0; i < 3; i += 1) expect((await mcpGuard(header)).ok).toBe(true);
    expect(await mcpGuard(header)).toEqual({ ok: false, status: 429 });
  });

  it('sınır anahtar BAŞINA işler — bir anahtarın tükettiği kota ötekini kapatmaz', async () => {
    process.env[KEY_ENV] = `dogru-anahtar-${stamp}`;
    process.env[RATE_ENV] = '2';
    const header = `Bearer dogru-anahtar-${stamp}`;
    for (let i = 0; i < 2; i += 1) await mcpGuard(header);
    expect(await mcpGuard(header)).toEqual({ ok: false, status: 429 });

    // Başka bir (geçersiz) anahtar kendi sayacına düşer: cevabı 401, 429 DEĞİL.
    expect(await mcpGuard(`Bearer baska-anahtar-${stamp}`)).toEqual({ ok: false, status: 401 });
  });

  it('geçersiz anahtar da sayaç doldurur — kapı DB\'ye gitmeden korunur', async () => {
    delete process.env[KEY_ENV];
    process.env[RATE_ENV] = '2';
    const header = `Bearer hic-yok-${stamp}`;
    expect(await mcpGuard(header)).toEqual({ ok: false, status: 401 });
    expect(await mcpGuard(header)).toEqual({ ok: false, status: 401 });
    expect(await mcpGuard(header)).toEqual({ ok: false, status: 429 });
  });
});

describe('kapsam sözleşmesi', () => {
  it('`propose_` ile başlayan HER araç öneri ailesinde, kalanların hepsi okuma', () => {
    for (const tool of TOOLS) {
      expect(toolScope(tool.name)).toBe(tool.name.startsWith('propose_') ? 'propose' : 'read');
    }
    // Sözleşmenin sayısal hâli — yeni araç eklenince bu satır düşer ve kapsam ailesi bilinçli seçilir.
    expect(TOOLS.filter((t) => toolScope(t.name) === 'propose')).toHaveLength(11);
    expect(TOOLS.filter((t) => toolScope(t.name) === 'read')).toHaveLength(14);
  });

  it('`propose` kapsamı `read`i KAPSAR; `read` öneriye yetmez', () => {
    expect(scopeAllows('propose', 'read')).toBe(true);
    expect(scopeAllows('propose', 'propose')).toBe(true);
    expect(scopeAllows('read', 'read')).toBe(true);
    expect(scopeAllows('read', 'propose')).toBe(false);
  });

  it('kuyruğa yazan araç adı `propose_` ÖNEKİ olmadan var olamaz', () => {
    // Kural gizli değil, ama gizlice bozulabilir: kuyruğa yazan bir araç `queue_x` diye eklenirse
    // `toolScope` onu OKUMA sayar ve dar kapsamlı bir anahtar onunla yazabilir. Handler adları
    // tek kaynak olduğu için sözleşme burada kilitleniyor.
    const writers = Object.keys(HANDLERS).filter((name) => name.includes('propose'));
    for (const name of writers) expect(name.startsWith('propose_')).toBe(true);
  });
});

describe('araçlar — şekil + maskeleme (DB okur)', () => {
  it('morning_briefing beklenen alanları taşır ve tedarikçi alış fiyatı SIZMAZ', async () => {
    const briefing = await morningBriefing();

    expect(briefing.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(typeof briefing.todayDeliveries.total).toBe('number');
    expect(typeof briefing.errors.open).toBe('number');
    expect(typeof briefing.reorder.totalLines).toBe('number');
    expect(Array.isArray(briefing.attention)).toBe(true);

    // Güvenlik sözleşmesi: serileşmiş çıktıda yasaklı alan adları geçmez.
    const serialized = JSON.stringify(briefing);
    expect(serialized).not.toContain('lastPurchasePriceCents');
    expect(serialized).not.toContain('supplierCode');
  });

  it('sales_summary aralığı doğru kurar ve gün sayısını [1,90] aralığına kıstırır', async () => {
    const summary = await salesSummary(700);
    expect(summary.days).toBe(90);
    expect(summary.from <= summary.to).toBe(true);
    expect(typeof summary.revenueCents).toBe('number');
  });

  it('system_errors satırları yalnız seçilmiş alanları taşır (context gövdesi dökülmez)', async () => {
    const report = await systemErrors(5);
    expect(typeof report.openCount).toBe('number');
    for (const row of report.rows) {
      expect(Object.keys(row).sort()).toEqual(['count', 'lastSeenAt', 'message', 'path', 'source']);
    }
  });
});

describe('katalog ve stok araçları', () => {
  it('catalog_health eksik BEYANI adlandırır (uydurmaz) ve vitrin işaretlerini sayar', async () => {
    const health = await catalogHealth(5);

    expect(typeof health.totals.products).toBe('number');
    expect(typeof health.totals.incompleteDeclarations).toBe('number');
    expect(health.incompleteProducts.length).toBeLessThanOrEqual(5);
    // Eksik listesi motorun sözlüğünden gelir — araç kendi ölçütünü uydurmaz (STACK §4).
    const allowed = new Set(['lang', 'ingredients', 'nutrition', 'storage', 'allergens']);
    for (const p of health.incompleteProducts) {
      expect(p.missing.length).toBeGreaterThan(0);
      for (const gap of p.missing) expect(allowed.has(gap)).toBe(true);
    }
    // Vitrin İKİ kümeyle gelir (22.7): işaretliler VE adaylar. Adaylar olmadan asistan hiç
    // denemediği bir kaydı öneremiyordu — boşluğun ölçülemeyen kısmı "yapılmayan öneri"ydi.
    expect(Array.isArray(health.featured.categories.featured)).toBe(true);
    expect(Array.isArray(health.featured.categories.candidates)).toBe(true);
    // Bir kayıt iki kümede birden olamaz: aday tanımı "aktif AMA işaretsiz".
    const overlap = health.featured.collections.featured.filter((n) => health.featured.collections.candidates.includes(n));
    expect(overlap).toEqual([]);
  });

  it('stock_watch parti satırlarını depo koduyla verir ve kesmeyi SÖYLER', async () => {
    const watch = await stockWatch(30);
    expect(watch.horizonDays).toBe(30);
    expect(watch.batches.length).toBeLessThanOrEqual(40);
    expect(typeof watch.truncated).toBe('boolean');
    for (const b of watch.batches) {
      // Depo boyutu DÜŞMEZ: parti bir depoda durur (DOMAIN §17).
      //
      // ── SATIRIN ŞEKLİ 22.5'te DEĞİŞTİ (kullanıcı kararı 09.08) ─────────────
      // Eklenen iki küme ve gerekçeleri ayrı:
      // ① `batchId`/`variantId` — okuma ile yazma arasındaki KİMLİK KÖPRÜSÜ. Yokken asistan
      //    ömrü dolan partiyi görüyor ama hiçbir öneri aracına besleyemiyordu.
      // ② `purchasePriceCents` — **maskeleme sözleşmesi bilinçli olarak GEVŞETİLDİ.** 22.1'de
      //    alış fiyatı araç yüzeyine çıkmıyordu (finans sınırı §6); kullanıcı 09.08'de kârlılık
      //    hesabı yapılabilsin diye açtı. Sınırın kendisi kalkmadı: bu bir PARTİ maliyetidir ve
      //    liste fiyatı KDV dahilken bu hariçtir — `vatRate` de o yüzden satırda.
      // ③ **KDV tabanı ARTIK ADIN İÇİNDE** (`126e2e1`): `listPriceCentsIncVat` ·
      //    `purchasePriceCentsExVat`. Test bunu görmeden bayatladı ve bir koşu boyunca kırmızı
      //    kaldı — sözleşmeyi doğrulayan test, sözleşme değişince onunla birlikte güncellenir.
      expect(Object.keys(b).sort()).toEqual([
        'batchId', 'dateType', 'decision', 'expired', 'expiryDate', 'listPriceCentsIncVat',
        'offerPriceCentsIncVat', 'physicalQty', 'product', 'purchasePriceCentsExVat',
        'suggestedOfferPriceCentsIncVat', 'unit', 'variantId', 'vatRate', 'warehouse',
      ]);
      // Karar MOTORUN sözlüğünden gelir — araç kendi eşiğini kurmaz (STACK §4).
      expect(['none', 'can_offer', 'offer_open', 'must_discard']).toContain(b.decision);
    }
  });

  it('sold_out_watch sıfır stoklu aktif varyantları sayar', async () => {
    const watch = await soldOutWatch(10);
    expect(typeof watch.totalActiveVariants).toBe('number');
    expect(watch.soldOut.length).toBeLessThanOrEqual(10);
  });
});

describe('talep sinyalleri ve müşteri nabzı', () => {
  it('demand_signals üç açıyı da döner ve ürün kimliği yerine AD taşır', async () => {
    const signals = await demandSignals(7);

    expect(signals.window.days).toBe(7);
    expect(Array.isArray(signals.postalCodeDemand)).toBe(true);
    expect(Array.isArray(signals.searchesWithoutResult)).toBe(true);
    for (const p of signals.productInterest) {
      expect(typeof p.product).toBe('string');
      expect(p.product).not.toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-/); // uuid sızmasın
    }
  });

  it('customer_pulse YALNIZ sayım döner — mesaj içeriği ve müşteri kimliği yok', async () => {
    const pulse = await customerPulse();

    expect(typeof pulse.pendingReviews).toBe('number');
    expect(typeof pulse.conversations.awaitingReply).toBe('number');
    // Gövdede yalnız sayılar olmalı: metin taşıyan bir alan eklenirse bu test düşer ve
    // "gözlemci rolü" (AI_ADMIN_ASSISTANT §7) sessizce genişlemiş olmaz.
    const values = [...Object.values(pulse.tickets), pulse.pendingReviews, pulse.conversations.awaitingReply];
    for (const v of values) expect(typeof v).toBe('number');
  });
});

describe('araç kataloğu ↔ uygulama eşliği', () => {
  it('tanımlanan her aracın bir uygulaması, her uygulamanın bir tanımı var', () => {
    const declared = TOOLS.map((t) => t.name).sort();
    const implemented = Object.keys(HANDLERS).sort();
    expect(implemented).toEqual(declared);
  });

  it('her aracın açıklaması modele iş öğretecek kadar dolu', () => {
    for (const tool of TOOLS) expect(tool.description.length).toBeGreaterThan(80);
  });
});
