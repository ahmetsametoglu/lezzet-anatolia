import { z } from 'zod';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runTask } from './run';
import { setAiUsageRecorder, type AiUsageRecord } from './usage-recorder';
import { translateTask } from './tasks/translate';
import { failingAiModel, fakeAiModel } from './testing';
import type { AiTask } from './types';

/**
 * `packages/ai` birim testleri — **ağa çıkmadan.** AI SDK'nın sahte modeli (`ai/test`) gerçek
 * çağrı yolunu koşturur: şema dayatması, doğrulama ve hata sınıflandırması gerçek koddur; yalnız
 * sağlayıcının HTTP katmanı yerine sabit bir yanıt durur.
 *
 * Bir sahte olmasaydı bu davranışların hiçbiri sınanamazdı — API anahtarı olmayan bir CI'da
 * paket "derleniyor ama çalışıyor mu bilinmiyor" durumunda kalırdı.
 */

const CEVIRI = JSON.stringify({ sourceLanguage: 'tr', tr: 'Merhaba', fr: 'Bonjour', de: 'Hallo' });

describe('runTask', () => {
  beforeEach(() => {
    delete process.env.AI_PROVIDER;
    delete process.env.ANTHROPIC_API_KEY;
  });

  it('şemaya uyan çıktıyı tipli döndürür', async () => {
    const res = await runTask(translateTask, { text: 'Merhaba', kind: 'urun_yorumu' }, { model: fakeAiModel(CEVIRI) });
    if (!res.ok) throw new Error(`${res.reason}: ${res.message}`);
    expect(res.data).toEqual({ sourceLanguage: 'tr', tr: 'Merhaba', fr: 'Bonjour', de: 'Hallo' });
  });

  it('şemayı ihlal eden çıktıyı invalid_output olarak sınıflandırır — fırlatmaz', async () => {
    // `sourceLanguage` yok: model uydurmuş. Bu prompt sorunudur, tekrar denemenin faydası sınırlı.
    const bozuk = JSON.stringify({ tr: 'Merhaba', fr: 'Bonjour', de: 'Hallo' });
    const res = await runTask(translateTask, { text: 'Merhaba', kind: 'urun_yorumu' }, { model: fakeAiModel(bozuk) });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.reason).toBe('invalid_output');
  });

  it('sağlayıcı hatasını provider_error olarak sınıflandırır — yine fırlatmaz', async () => {
    const res = await runTask(translateTask, { text: 'Merhaba', kind: 'urun_yorumu' }, { model: failingAiModel('429 rate limit') });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.reason).toBe('provider_error');
  });

  it('yapılandırma yoksa not_configured döner ve model HİÇ çağrılmaz', async () => {
    const res = await runTask(translateTask, { text: 'Merhaba', kind: 'urun_yorumu' });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.reason).toBe('not_configured');
    expect(res.message).toContain('ANTHROPIC_API_KEY');
  });

  it('hata mesajı ÇEVRİLEN METNİ taşımaz — log gizliliği (CLAUDE §1)', async () => {
    const gizli = 'Siparişim gelmedi, telefonum 0612345678';
    const res = await runTask(translateTask, { text: gizli, kind: 'talep_mesaji' }, { model: failingAiModel('500 upstream') });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.message).not.toContain('0612345678');
    expect(res.message).toContain('translate.user-text');
  });

  it('token ölçümünü aktarır; sağlayıcı bildirmediyse null bırakır (0 DEĞİL)', async () => {
    const olculu = await runTask(translateTask, { text: 'x', kind: 'urun_yorumu' }, { model: fakeAiModel(CEVIRI, { inputTokens: 120, outputTokens: 40 }) });
    expect(olculu.ok && olculu.usage).toEqual({ inputTokens: 120, outputTokens: 40, totalTokens: 160, cachedInputTokens: null });

    const olcumsuz = await runTask(translateTask, { text: 'x', kind: 'urun_yorumu' }, { model: fakeAiModel(CEVIRI) });
    expect(olcumsuz.ok && olcumsuz.usage.inputTokens).toBeNull();
  });

  it('görevin sistem talimatını ve prompt`unu modele GERÇEKTEN geçirir', async () => {
    const model = fakeAiModel(CEVIRI);
    await runTask(translateTask, { text: 'Ürün bozuk geldi', kind: 'urun_yorumu' }, { model });
    const cagri = model.doGenerateCalls[0];
    expect(cagri?.temperature).toBe(0);
    const gonderilen = JSON.stringify(cagri?.prompt);
    expect(gonderilen).toContain('Ürün bozuk geldi');
    expect(gonderilen).toContain('çeviri motorusun');
  });

  it('enjekte model verilmezse env`den çözer — sağlayıcı seçimi kodda değil', async () => {
    process.env.AI_PROVIDER = 'sihirli-model';
    const res = await runTask(translateTask, { text: 'x', kind: 'urun_yorumu' });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.reason).toBe('not_configured');
    expect(res.message).toContain('AI_PROVIDER');
  });
});

describe('AiTask sözleşmesi', () => {
  it('görev kaydı prompt`u TAŞIR — çağıran kendi prompt`unu yazmaz', async () => {
    // Aynı işin iki yerde iki prompt'u olsaydı çıktının neden değiştiği bulunamazdı (CLAUDE §1).
    const gorev: AiTask<{ n: number }, { kare: number }> = {
      id: 'test.kare',
      tier: 'cheap',
      output: z.object({ kare: z.number() }),
      system: 'Sayının karesini döndür.',
      buildPrompt: ({ n }) => `Sayı: ${n}`,
      temperature: 0,
    };
    const model = fakeAiModel(JSON.stringify({ kare: 49 }));
    const res = await runTask(gorev, { n: 7 }, { model });
    expect(res.ok && res.data.kare).toBe(49);
    expect(JSON.stringify(model.doGenerateCalls[0]?.prompt)).toContain('Sayı: 7');
  });
});

describe('kullanım kancası (15.27)', () => {
  /* Kaydedici süreç başında takılır (web/backend); burada taklidi takılıyor ve her testten sonra
     sökülüyor — kanca `globalThis`te, sökülmezse öteki dosyaların koşuları buraya yazardı. */
  const kayitlar: AiUsageRecord[] = [];
  beforeEach(() => {
    kayitlar.length = 0;
    delete process.env.AI_PROVIDER;
    delete process.env.ANTHROPIC_API_KEY;
    setAiUsageRecorder(async (kayit) => void kayitlar.push(kayit));
  });
  afterEach(() => setAiUsageRecorder(null));

  it('başarılı koşu ölçümüyle ve iş bağlamıyla kaydedilir — görev ve GERÇEK model adıyla', async () => {
    await runTask(
      translateTask,
      { text: 'x', kind: 'urun_yorumu' },
      { model: fakeAiModel(CEVIRI, { inputTokens: 120, outputTokens: 40 }), modelId: 'gemini-test', usageContext: { conversationId: 'c1' } },
    );
    expect(kayitlar).toEqual([
      {
        task: 'translate.user-text',
        modelId: 'gemini-test',
        ok: true,
        failureReason: null,
        usage: { inputTokens: 120, outputTokens: 40, totalTokens: 160, cachedInputTokens: null },
        context: { conversationId: 'c1' },
      },
    ]);
  });

  it('düşen koşu da kaydedilir, sebebiyle — ölçüm yoksa null (0 DEĞİL)', async () => {
    await runTask(translateTask, { text: 'x', kind: 'urun_yorumu' }, { model: failingAiModel('500 upstream') });
    expect(kayitlar).toHaveLength(1);
    expect(kayitlar[0]).toMatchObject({ ok: false, failureReason: 'provider_error', context: {} });
    expect(kayitlar[0]!.usage.inputTokens).toBeNull();
  });

  it('şemaya uymayan çıktı jeton YAKTI — ölçümü kayda geçer', async () => {
    // Model yazdı, çıktı reddedildi: fatura yine kesilir. Ölçümsüz yazmak harcamayı gizlerdi.
    const bozuk = JSON.stringify({ tr: 'Merhaba' });
    await runTask(translateTask, { text: 'x', kind: 'urun_yorumu' }, { model: fakeAiModel(bozuk, { inputTokens: 50, outputTokens: 10 }) });
    expect(kayitlar[0]).toMatchObject({ ok: false, failureReason: 'invalid_output' });
    expect(kayitlar[0]!.usage).toMatchObject({ inputTokens: 50, outputTokens: 10 });
  });

  it('yapılandırma yoksa kayıt YOK — modele hiç gidilmedi', async () => {
    await runTask(translateTask, { text: 'x', kind: 'urun_yorumu' });
    expect(kayitlar).toHaveLength(0);
  });

  it('kaydedici düşse de koşu DÜŞMEZ — kayıt bir yan iş', async () => {
    setAiUsageRecorder(async () => {
      throw new Error('db kapalı');
    });
    const res = await runTask(translateTask, { text: 'x', kind: 'urun_yorumu' }, { model: fakeAiModel(CEVIRI) });
    expect(res.ok).toBe(true);
  });
});
