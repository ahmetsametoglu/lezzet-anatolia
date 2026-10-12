import type { LanguageModel } from 'ai';
import type { z } from 'zod';
import type { AiProvider, AiRunFailure, AiTier as Tier } from '@lezzet/types';

/**
 * `@lezzet/ai` bir porttur: model çağırır, tipli sonuç ve ölçüm döner; veritabanı, logger ve iş kuralı bilmez. Bu sınırı
 * `dependency-cruiser`'ın `ai-scope` kuralı zorlar, çünkü dış dünyası olmayan katman ağa çıkmadan sınanabilir.
 */

/** Görev model adını değil katmanı söyler; katmanın modeli Kurulum'da seçilir, model değişince görev değişmez. */
export type AiTier = Tier;

/** Kütüphanenin tipi yeniden adlandırılır ki çağıranlar `ai` paketini doğrudan almasın; kütüphane değişince uygulamalar değişmez. */
export type AiModel = LanguageModel;

export type AiProviderName = AiProvider;

/**
 * `not_configured` beklenen bir hâldir ve özellik yapay zekâsız sürer; `provider_error` geçici olabilir; `invalid_output` prompt'a
 * işaret eder. Kayda giren iki sebep tip paketindeki tek listededir (`AiRunFailureEnum`).
 */
export type AiFailureReason = 'not_configured' | AiRunFailure;

/** Alanlar `null` olabilir, `0` değil: sağlayıcı ölçümü vermediyse "sıfır jeton" demek bozuk ölçümü sağlıklı gösterirdi. */
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
  /** Modelin çağırdığı araçlar, sırasıyla; "AI teslim günü söyledi" ile "uydurdu" farkını sonradan yalnız bu liste ayırır. */
  toolCalls: string[];
}

export interface AiFailure {
  ok: false;
  reason: AiFailureReason;
  /** Teşhis için insan-okunur sebep. **Kullanıcı içeriği taşımaz** (`CLAUDE §1` log kuralı). */
  message: string;
}

export type AiResult<T> = AiSuccess<T> | AiFailure;

/**
 * Modele giden kullanıcı mesajının parçaları. `mediaType` zorunludur, çünkü model dosyayı uzantıdan değil bu alandan okur; dosyayı
 * metne gömmek jeton sayacını yanıltırdı.
 */
export type AiPromptPart = { type: 'text'; text: string } | { type: 'file'; data: Uint8Array | string; mediaType: string };

/** Görevin ürettiği istem: düz metin ya da (dosya taşıyorsa) parça dizisi. */
export type AiPromptContent = string | AiPromptPart[];

/** Prompt görevde durur, çağıranda değil: aynı prompt'un iki sürümü çıktının neden değiştiğini bulunamaz kılardı. */
export interface AiTask<TInput, TOutput> {
  /** Kayıt anahtarı — ölçüm/log satırında görünür. */
  id: string;
  tier: AiTier;
  /** Çıktı sözleşmesi. Model buna uymazsa sonuç `invalid_output`; ayrıştırma tahmini YOK. */
  output: z.ZodType<TOutput>;
  /** Sistem talimatı — görevin değişmeyen yarısı. */
  system: string;
  /** Girdinin değişen yarısı; ses gibi dosyalar parça dizisiyle gelir ki ikinci bir çağırma yolu açılmasın. */
  buildPrompt(input: TInput): AiPromptContent;
  /** Tek doğrusu olan işlerde (çeviri, çıkarım) 0, ki aynı girdi aynı çıktıyı versin; metin taslağında yükselir. */
  temperature: number;
  /**
   * Araçlı koşuda adım tavanı, varsayılan 4; araç çağıran model döngüye girebilir ve tavan faturayı sınırlar. Araç listesi görevde
   * değil çağrıdadır, çünkü aynı görev her müşteri için onun kimliğine kapatılmış araçlarla koşar.
   */
  maxSteps?: number;
}
