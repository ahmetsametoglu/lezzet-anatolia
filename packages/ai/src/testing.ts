import { MockLanguageModelV4 } from 'ai/test';

/**
 * Test için sabit cevap veren sahte model — **ağa çıkılmaz, sonuç belirleyicidir.**
 *
 * Burada duruyor çünkü iki ayrı test dosyası (paketin kendi testleri + backend çeviri işi) aynı
 * sahteyi kuruyordu; ikinci kopya yazıldığı gün `ai` SDK'sının şekli değişse biri güncellenir
 * öteki unutulurdu (`CLAUDE §1`). Ayrıca `ai/test` bağımlılığı böylece TEK pakette kalıyor:
 * `apps/backend` kütüphaneyi hiç tanımıyor.
 *
 * **`usage` iki ayrı şekle sahip ve karıştırılması saat yakar:** SAĞLAYICI seviyesinde alanlar
 * iç içedir (`inputTokens.total`), SDK'nın dışarı verdiği ölçüm düzdür (`inputTokens: number`).
 * Sahte model sağlayıcının yerine geçtiği için iç içe şekli kurar.
 *
 * Dönüş tipi `AiModel` DEĞİL sahtenin kendisi: `doGenerateCalls` ile "modele NE gönderildi"
 * sorulabilsin (prompt'un gerçekten geçtiğini sınayan testler buna bakıyor).
 */
export function fakeAiModel(text: string, usage?: { inputTokens?: number; outputTokens?: number }): MockLanguageModelV4 {
  return new MockLanguageModelV4({
    doGenerate: async () => ({
      content: [{ type: 'text' as const, text }],
      finishReason: { unified: 'stop' as const, raw: undefined },
      usage: {
        inputTokens: { total: usage?.inputTokens, noCache: undefined, cacheRead: undefined, cacheWrite: undefined },
        outputTokens: { total: usage?.outputTokens, text: undefined, reasoning: undefined },
      },
      warnings: [],
    }),
  });
}

/** Her çağrıda fırlatan sahte model — sağlayıcı hatası dalını sınamak için. */
export function failingAiModel(message: string): MockLanguageModelV4 {
  return new MockLanguageModelV4({
    doGenerate: async () => {
      throw new Error(message);
    },
  });
}
