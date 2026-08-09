import { afterEach, describe, expect, it } from 'vitest';
import { mcpGuard } from './guard';
import { HANDLERS, TOOLS } from './server-factory';
import { morningBriefing, salesSummary, systemErrors } from './tools';
import { catalogHealth, soldOutWatch, stockWatch } from './tools-catalog';
import { customerPulse, demandSignals } from './tools-signals';

/**
 * MCP deneme dilimi (22.1) — kapı + araçların ŞEKLİ ve maskeleme sözleşmesi.
 *
 * Sayıların DEĞERİ assert edilmez (paylaşılan DB'de küresel sayıya bakan test başka ajanın
 * verisiyle oynar — CLAUDE §4b); doğrulanan şey alanların varlığı/tipi ve YASAKLI alanların
 * YOKLUĞU. Maskeleme testi güvenlik iddiasının kendisidir: `lastPurchasePriceCents` (tedarikçi
 * alışı) araç çıktısının serileşmiş hâlinde hiçbir yerde geçemez (AI_ADMIN_ASSISTANT §6).
 */

const KEY_ENV = 'MCP_CONNECTION_KEY';
const original = process.env[KEY_ENV];

afterEach(() => {
  if (original === undefined) delete process.env[KEY_ENV];
  else process.env[KEY_ENV] = original;
});

describe('mcpGuard — fail-closed kapı', () => {
  it('anahtar yapılandırılmamışsa HERKESE kapalı (doğru anahtar bile giremez)', () => {
    delete process.env[KEY_ENV];
    expect(mcpGuard('Bearer herhangi')).toBe(false);
  });

  it('yanlış ya da eksik Bearer reddedilir', () => {
    process.env[KEY_ENV] = 'dogru-anahtar';
    expect(mcpGuard(undefined)).toBe(false);
    expect(mcpGuard('Bearer yanlis')).toBe(false);
    expect(mcpGuard('dogru-anahtar')).toBe(false); // Bearer öneki şart
  });

  it('doğru anahtar geçer (büyük/küçük Bearer toleransıyla)', () => {
    process.env[KEY_ENV] = 'dogru-anahtar';
    expect(mcpGuard('Bearer dogru-anahtar')).toBe(true);
    expect(mcpGuard('bearer dogru-anahtar')).toBe(true);
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
    expect(Array.isArray(health.featured.categories)).toBe(true);
  });

  it('stock_watch parti satırlarını depo koduyla verir ve kesmeyi SÖYLER', async () => {
    const watch = await stockWatch(30);
    expect(watch.horizonDays).toBe(30);
    expect(watch.batches.length).toBeLessThanOrEqual(40);
    expect(typeof watch.truncated).toBe('boolean');
    for (const b of watch.batches) {
      // Depo boyutu DÜŞMEZ: parti bir depoda durur (DOMAIN §17).
      expect(Object.keys(b).sort()).toEqual([
        'dateType', 'expired', 'expiryDate', 'physicalQty', 'product', 'unit', 'warehouse',
      ]);
    }
    // Alış fiyatı parti satırında VARDIR ama araç yüzeyine çıkmaz (finans sınırı).
    expect(JSON.stringify(watch)).not.toContain('purchasePrice');
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
