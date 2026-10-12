import { describe, expect, it, vi } from 'vitest';
import { listAiModels, parseAiModelPrice } from './models';

const answering = (status: number, body: unknown) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

// Görsel, robotik, önizleme ya da takma ad bir Google modeli seçilebilir listeye girerse, en yeni model üstte durmazsa, anahtarı olmayan
// sağlayıcıya gidilirse ya da yarım ya da virgüllü fiyat yanlış okunursa kırmızıya döner.
describe('yapay zekâ modelleri', () => {
  it('Google listesinden yalnız sürüm numaralı metin modelleri gelir, en yeni üstte', async () => {
    const google = answering(200, {
      models: [
        { name: 'models/gemini-3.5-flash-lite', displayName: 'Gemini 3.5 Flash-Lite', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/gemini-embedding-001', supportedGenerationMethods: ['embedContent'] },
        { name: 'models/gemini-robotics-er-2-preview', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/gemini-nano-banana-2.1', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/gemini-pro-latest', supportedGenerationMethods: ['generateContent'] },
        {
          name: 'models/gemini-3.8-flash',
          displayName: 'Gemini 3.8 Flash',
          supportedGenerationMethods: ['generateContent', 'countTokens'],
        },
        { name: 'models/gemini-2.5-flash-preview-tts', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/imagen-4.0-generate-001', supportedGenerationMethods: ['predict'] },
      ],
    });
    const [entry] = await listAiModels((name) => (name === 'google_ai_api_key' ? 'g' : null), google);
    expect(entry).toEqual({
      provider: 'google',
      status: 'ok',
      models: [
        { id: 'gemini-3.8-flash', name: 'Gemini 3.8 Flash' },
        { id: 'gemini-3.5-flash-lite', name: 'Gemini 3.5 Flash-Lite' },
      ],
    });
  });

  it('anahtarı olmayan sağlayıcıya gidilmez; yetkisiz cevap ret, ağ hatası ulaşılamazlıktır', async () => {
    const unauthorized = answering(401, { error: { message: 'invalid x-api-key' } });
    const entries = await listAiModels((name) => (name === 'anthropic_api_key' ? 'a' : null), unauthorized);
    expect(entries).toEqual([{ provider: 'anthropic', status: 'rejected', detail: expect.stringContaining('401') }]);
    expect(unauthorized).toHaveBeenCalledTimes(1);

    const down = vi.fn(async () => {
      throw new Error('getaddrinfo ENOTFOUND');
    }) as unknown as typeof fetch;
    expect((await listAiModels(() => 'k', down)).map((entry) => entry.status)).toEqual(['unreachable', 'unreachable']);
  });

  it('tarife iki alan birlikte girilir, ondalık virgül okunur', () => {
    expect(parseAiModelPrice('0,75', '3.75')).toEqual({ ok: true, price: { inputPerMillion: 0.75, outputPerMillion: 3.75 } });
    expect(parseAiModelPrice(' ', '')).toEqual({ ok: true, price: null });
    expect(parseAiModelPrice('2', '').ok).toBe(false);
    expect(parseAiModelPrice('-1', '2').ok).toBe(false);
  });
});
