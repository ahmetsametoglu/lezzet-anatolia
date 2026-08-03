import type { LanguageModel } from 'ai';
import type { z } from 'zod';

/**
 * `@lezzet/ai` sözleşmeleri — paket bir PORT'tur: model çağırır, tipli sonuç döner.
 *
 * **Paket hiçbir şey bilmez ve hiçbir şeye yazmaz:** ne veritabanı, ne logger, ne iş kuralı.
 * Ölçümü (`usage`) döner, LOGLAMAZ — çağıran loglar. `dependency-cruiser`'daki `ai-scope`
 * kuralı bunu makineyle zorluyor (yalnız `@lezzet/types`). Sebebi domain-core'unkiyle aynı:
 * dış dünyası olmayan bir katman ağa çıkmadan test edilebilir.
 */

/**
 * Model KATMANI — görev kaydında model ADI değil katman durur.
 *
 * Görev "ucuz olanla çevir" der; hangi modelin ucuz olduğu bugünün bilgisidir ve env'den gelir
 * (`AI_MODEL_CHEAP`). Model adını görev tanımına gömmek, model değişince KODU değiştirmek
 * demekti — oysa bu bir dağıtım kararıdır, bir iş kararı değil.
 */
export type AiTier = 'cheap' | 'standard';

/**
 * Çalıştırılabilir bir model. **Kütüphanenin tipi burada YENİDEN ADLANDIRILIYOR** ki çağıranlar
 * (`apps/backend`, `apps/web`) `ai` paketini doğrudan import etmek zorunda kalmasın — yoksa
 * "sağlayıcı-agnostik" iddiası ilk satırda çürürdü: kütüphane değişince üç uygulama da değişirdi.
 */
export type AiModel = LanguageModel;

/** Desteklenen sağlayıcılar. Seçim `AI_PROVIDER` ile; anahtar sağlayıcının kendi env'inden. */
export type AiProviderName = 'anthropic' | 'google';

/**
 * Başarısızlığın ÜÇ sebebi — çağıranın davranışı üçünde de farklı olduğu için ayrı tutuluyor:
 *
 * · `not_configured` — anahtar/env yok. Beklenen bir hâl: özellik AI'sız çalışmaya devam eder,
 *   kullanıcıya hata gösterilmez, tekrar denemenin anlamı yoktur.
 * · `provider_error`  — ağ/kota/model hatası. GEÇİCİ olabilir; tekrar denenebilir.
 * · `invalid_output`  — model şemaya uymayan bir şey döndürdü. Tekrar denemek genelde işe yarar
 *   ama sınırlı: aynı prompt üçüncü kez de bozuksa sorun prompt'tadır.
 */
export type AiFailureReason = 'not_configured' | 'provider_error' | 'invalid_output';

/**
 * Bir çağrının token ölçümü.
 *
 * Alanlar `number | null` — **`0` değil.** Sağlayıcı ölçümü vermediyse "sıfır token harcandı"
 * demek, bozuk ölçümü sağlıklı gibi okutur (`CLAUDE §1`). Bilinmiyorsa bilinmiyor yazar.
 */
export interface AiUsage {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  /** Girdinin önbellekten okunan (ucuz) alt kümesi — sağlayıcı bildirirse. */
  cachedInputTokens: number | null;
}

export interface AiSuccess<T> {
  ok: true;
  data: T;
  usage: AiUsage;
  /** Çağrının GERÇEKTEN gittiği model — ölçüm ve maliyet bununla eşleşir. */
  modelId: string;
}

export interface AiFailure {
  ok: false;
  reason: AiFailureReason;
  /** Teşhis için insan-okunur sebep. **Kullanıcı içeriği taşımaz** (`CLAUDE §1` log kuralı). */
  message: string;
}

export type AiResult<T> = AiSuccess<T> | AiFailure;

/**
 * Bir AI görevi — kaydın tek birimi.
 *
 * Prompt burada durur, çağıranın içinde değil: aynı prompt'un iki yerde iki sürümü olması
 * (`CLAUDE §1` duplication) çıktının neden değiştiğini bulunamaz hâle getirir.
 */
export interface AiTask<TInput, TOutput> {
  /** Kayıt anahtarı — ölçüm/log satırında görünür. */
  id: string;
  tier: AiTier;
  /** Çıktı sözleşmesi. Model buna uymazsa sonuç `invalid_output`; ayrıştırma tahmini YOK. */
  output: z.ZodType<TOutput>;
  /** Sistem talimatı — görevin değişmeyen yarısı. */
  system: string;
  /** Girdinin değişen yarısı. */
  buildPrompt(input: TInput): string;
  /**
   * Yaratıcılık ayarı. Çeviri/çıkarım gibi TEK doğrusu olan işlerde 0 — aynı girdi aynı çıktıyı
   * versin. Metin taslağı gibi işlerde yükselir.
   */
  temperature: number;
}
