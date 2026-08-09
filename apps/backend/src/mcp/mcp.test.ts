import { afterEach, describe, expect, it } from 'vitest';
import { mcpGuard } from './guard';
import { morningBriefing, salesSummary, systemErrors } from './tools';

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
