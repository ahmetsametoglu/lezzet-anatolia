import { z } from 'zod';

/** Yapay zekâ sağlayıcıları; model seçimi ve seçim yokken çalışan varsayılan bu listeyle sınırlıdır. */
export const AiProviderEnum = z.enum(['anthropic', 'google']);
export type AiProvider = z.infer<typeof AiProviderEnum>;

/** Model katmanı: görev model adını değil katmanı söyler, katmanın modeli Kurulum'da seçilir. */
export const AiTierEnum = z.enum(['cheap', 'standard']);
export type AiTier = z.infer<typeof AiTierEnum>;

/** Bir katmanın seçili modeli (`settings.ai_model_*`); sağlayıcı modelle birlikte saklanır ki model adından tahmin edilmesin. */
export const AiModelChoiceSchema = z.object({ provider: AiProviderEnum, model: z.string().min(1) });
export type AiModelChoice = z.infer<typeof AiModelChoiceSchema>;

/** Anthropic `GET /v1/models` cevabının okunan kısmı; liste en yeni modelden başlar. */
export const AnthropicModelListSchema = z.object({
  data: z.array(z.object({ id: z.string(), display_name: z.string().optional() })),
});

/** Google `GET /v1beta/models` cevabının okunan kısmı; metin modeli `generateContent` desteğinden tanınır. */
export const GoogleModelListSchema = z.object({
  models: z
    .array(z.object({ name: z.string(), displayName: z.string().optional(), supportedGenerationMethods: z.array(z.string()).optional() }))
    .default([]),
});
