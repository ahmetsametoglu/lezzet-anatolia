/**
 * AI duman testi — `pnpm ai:smoke`
 *
 * GERÇEK anahtarla TEK çeviri çağrısı yapar ve zinciri uçtan uca doğrular: `AI_PROVIDER` okunuyor
 * mu · anahtar geçerli mi · model cevap veriyor mu · çıktı şemadan geçiyor mu. Sonunda kullanılan
 * token sayısını basar.
 *
 * Neden var: birim testleri sağlayıcıya ağdan GİTMEZ (`packages/ai/src/testing.ts` sahte modeli) —
 * "kod doğru" ile "anahtar/sağlayıcı doğru" ayrı sorulardır; bu script ikincisini cevaplar
 * (`stripe-smoke.ts` ile aynı sınıf). Kurulumdan ve anahtar/sağlayıcı değişiminden sonra ELLE
 * çalıştırılır. **Her çağrı gerçek token harcar** — otomatik test paketine bağlanmaz.
 */
const load = (process as { loadEnvFile?: (path: string) => void }).loadEnvFile;

// SIRA ÖNEMLİ (stripe-smoke ile aynı gerekçe): Node var olan değişkeni ezmez, ilk yükleyen
// kazanır. Anahtarlar `apps/web/.env.local`'de; kök `.env` yalnız eksikleri tamamlar.
try {
  load?.('apps/web/.env.local');
} catch {
  // Yoksa sorun değil: değişkenler ortamdan gelmiş olabilir (CI).
}
try {
  load?.('.env');
} catch {
  // aynı
}

const { runTask, translateTask } = await import('@lezzet/ai');

// Türkçe kaynak metin bilerek üç sınama taşıyor: yemek adı (aktarılmalı, çevrilmemeli),
// sayı (değişmemeli) ve gündelik ifade (kalıp değil anlam çevirisi ister).
const res = await runTask(translateTask, {
  text: 'Fıstıklı baklava harikaydı, 2 kutu daha sipariş edeceğim. Elinize sağlık!',
  kind: 'urun_yorumu',
});

if (!res.ok) {
  console.error(`[ai-smoke] BAŞARISIZ — ${res.reason}: ${res.message}`);
  process.exit(1);
}

console.log(`[ai-smoke] model: ${res.modelId}`);
console.log(`[ai-smoke] kaynak dil: ${res.data.sourceLanguage}`);
console.log(`[ai-smoke] tr: ${res.data.tr}`);
console.log(`[ai-smoke] fr: ${res.data.fr}`);
console.log(`[ai-smoke] de: ${res.data.de}`);
console.log(`[ai-smoke] token: ${JSON.stringify(res.usage)}`);
console.log('[ai-smoke] zincir sağlam — anahtar, sağlayıcı, şema ✓');
