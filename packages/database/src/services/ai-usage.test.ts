import { afterAll, describe, expect, it } from 'vitest';
import { serviceDb } from '../client';
import { purgeTestData } from '../testing/cleanup';
import { AiUsageDailyService, AiUsageService } from './ai-usage.service';

/**
 * AI kullanım defteri (15.27 · 0056) — satır ve günlük özet.
 *
 * Görev adı damgalı: özet gün × görev × model grupladığı için başka koşuların satırları bu dosyanın
 * grubuna karışamaz (küresel sayıya bakan iddia yok — `CLAUDE §4b`). Satırlar gece yarısında iki güne
 * bölünebilir, o yüzden iddialar grup satırlarının TOPLAMINA yazılı.
 */
const db = serviceDb();
const defter = new AiUsageService(db);
const TASK = `test.ai-usage.${Date.now()}`;
const aiUsageIds: string[] = [];
const BAGLAMSIZ = { conversationId: null, ticketId: null };

/** Paris takviminde DÜN — görünümün günüyle aynı takvim; bugünün satırları kesin içeride kalsın. */
function parisDunu(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date(Date.now() - 86_400_000));
}

afterAll(async () => {
  await purgeTestData(db, { aiUsageIds });
});

describe('ai_usage + ai_usage_daily (15.27)', () => {
  it('özet koşuyu, düşeni ve TARİFESİZİ ayrı sayar; maliyet toplamı yalnız bilinenlerden', async () => {
    const satirlar = await Promise.all([
      defter.insert({ task: TASK, modelId: 'test-model', ok: true, failureReason: null, inputTokens: 1000, outputTokens: 200, cachedInputTokens: null, totalTokens: 1200, costUsd: 0.0021, ...BAGLAMSIZ }),
      defter.insert({ task: TASK, modelId: 'test-model', ok: true, failureReason: null, inputTokens: 500, outputTokens: 100, cachedInputTokens: null, totalTokens: 600, costUsd: null, ...BAGLAMSIZ }),
      defter.insert({ task: TASK, modelId: 'test-model', ok: false, failureReason: 'provider_error', inputTokens: null, outputTokens: null, cachedInputTokens: null, totalTokens: null, costUsd: null, ...BAGLAMSIZ }),
    ]);
    aiUsageIds.push(...satirlar.map((s) => s.id));

    const grup = (await new AiUsageDailyService(db).listSince(parisDunu())).filter((r) => r.task === TASK);
    const topla = (f: (r: (typeof grup)[number]) => number | null) => grup.reduce((n, r) => n + (f(r) ?? 0), 0);
    expect(grup.every((r) => r.modelId === 'test-model')).toBe(true);
    expect({
      calls: topla((r) => r.calls),
      failedCalls: topla((r) => r.failedCalls),
      inputTokens: topla((r) => r.inputTokens),
      outputTokens: topla((r) => r.outputTokens),
      unpricedCalls: topla((r) => r.unpricedCalls),
    }).toEqual({ calls: 3, failedCalls: 1, inputTokens: 1500, outputTokens: 300, unpricedCalls: 2 });
    // Tarifesiz iki koşu toplama SIFIR olarak girmedi: tutar yalnız bilinen koşunun maliyeti.
    expect(topla((r) => r.costUsd)).toBeCloseTo(0.0021, 6);
  });

  it('başarı ile sebep AYRIŞAMAZ — sebepli başarı veride reddedilir', async () => {
    await expect(
      defter.insert({ task: TASK, modelId: 'test-model', ok: true, failureReason: 'invalid_output', inputTokens: null, outputTokens: null, cachedInputTokens: null, totalTokens: null, costUsd: null, ...BAGLAMSIZ }),
    ).rejects.toThrow();
  });
});
