import { describe, expect, it } from 'vitest';
import type { AiUsageRecord } from '@lezzet/ai';
import { aiUsageRow, modelRateOf } from './usage-row';

/**
 * AI KULLANIM SATIRI (15.27) — kayıttan satıra, tarifeden maliyete. Saf: kaydedicinin yazımı entegrasyonda
 * (`packages/database/src/services/ai-usage.test.ts`), burada yalnız "hangi sayı yazılır" kararı.
 */
const KAYIT: AiUsageRecord = {
  task: 'support.autonomous-reply',
  modelId: 'gemini-3.5-flash',
  ok: true,
  failureReason: null,
  usage: { inputTokens: 2_000_000, outputTokens: 100_000, totalTokens: 2_100_000, cachedInputTokens: null },
  context: { conversationId: '11111111-1111-4111-8111-111111111111' },
};
const TARIFE = { 'gemini-3.5-flash': { inputPerMillion: 1.5, outputPerMillion: 9 } };

describe('AI kullanım satırı (15.27)', () => {
  it('maliyet tarifeden: 2 M girdi × 1,50 $ + 0,1 M çıktı × 9 $ = 3,90 $; bağlam kolonlara iner', () => {
    const satir = aiUsageRow(KAYIT, modelRateOf(TARIFE, KAYIT.modelId).rate);
    expect(satir.costUsd).toBeCloseTo(3.9, 10);
    expect(satir).toMatchObject({ task: 'support.autonomous-reply', inputTokens: 2_000_000, conversationId: KAYIT.context.conversationId, ticketId: null });
  });

  it('tarifesi olmayan model: maliyet NULL — sıfır değil', () => {
    const { rate, invalidTable } = modelRateOf(TARIFE, 'gemini-yeni');
    expect(invalidTable).toBe(false);
    expect(aiUsageRow({ ...KAYIT, modelId: 'gemini-yeni' }, rate).costUsd).toBeNull();
  });

  it('ölçümsüz koşu (sağlayıcı hatası): jetonlar da maliyet de NULL', () => {
    const olcumsuz = { inputTokens: null, outputTokens: null, totalTokens: null, cachedInputTokens: null };
    const satir = aiUsageRow({ ...KAYIT, ok: false, failureReason: 'provider_error', usage: olcumsuz }, TARIFE['gemini-3.5-flash']);
    expect(satir).toMatchObject({ ok: false, failureReason: 'provider_error', inputTokens: null, costUsd: null });
  });

  it('bozuk tarife tablosu AYRICA bildirilir; ayar satırı hiç yoksa bozuk sayılmaz', () => {
    expect(modelRateOf({ 'gemini-3.5-flash': { inputPerMillion: 'bir buçuk' } }, 'gemini-3.5-flash')).toEqual({ rate: null, invalidTable: true });
    expect(modelRateOf(null, 'gemini-3.5-flash')).toEqual({ rate: null, invalidTable: false });
  });
});
