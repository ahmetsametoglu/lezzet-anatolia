import { z } from 'zod';

// Çok dilli metin (jsonb). Diller sabit TR/FR/DE (bkz. @lezzet/i18n LOCALES).
// Gösterim/slug yedek zinciri TR → FR → DE (SEO_I18N "Kalıcı kararlar").

/**
 * Boş OLABİLEN çok dilli metin — opsiyonel alanlar için (açıklama gibi). "En az bir dil" kuralı YOK:
 * kullanıcı yazıp sildiğinde değer `{tr:''}` olur; zorunlu şemayla doğrulanırsa form haksızca geçersiz
 * olurdu. Zorunlu alanlar `LocalizedTextSchema` kullanır (bu şemadan türer — alanlar tek yerde).
 */
/**
 * Site dilleri başına opsiyonel metin — **iki ayrı anlamın ORTAK iskeleti**, o yüzden tek yerde:
 * yazılmış metin (`LocalizedText`, aşağıda) ve makineyle türetilmiş çeviri
 * (`TranslationBag`, `user-text.schema.ts`). Şekilleri aynı olduğu için ikisini ayrı ayrı
 * yazmak, bir gün dil eklendiğinde birini güncelleyip ötekini unutmak demekti (`CLAUDE §1`).
 */
export const perLanguageTextShape = {
  tr: z.string().optional(),
  fr: z.string().optional(),
  de: z.string().optional(),
} as const;

export const LocalizedTextDraftSchema = z.object(perLanguageTextShape);

/**
 * `LocalizedText`'in dil anahtarları — ŞEMADAN türetilir, elle liste yazılmaz. `@lezzet/i18n`'in
 * `LOCALES`'i ile aynı kümedir ama `types` i18n'e bağlanamaz (STACK §4); `database` de i18n'i bilmez.
 * Çok dilli alan üzerinde dil dil sorgu kuran katmanlar (ör. ürün adı araması) bunu kullanır.
 */
export const LOCALIZED_TEXT_KEYS = Object.keys(LocalizedTextDraftSchema.shape) as Array<keyof z.infer<typeof LocalizedTextDraftSchema>>;

/** Zorunlu çok dilli metin: en az bir dil dolu olmalı (ör. ad). */
export const LocalizedTextSchema = LocalizedTextDraftSchema.refine(
  (v) => Boolean(v.tr?.trim() || v.fr?.trim() || v.de?.trim()),
  { message: 'En az bir dilde metin gerekli (tr/fr/de)' },
);
export type LocalizedText = z.infer<typeof LocalizedTextSchema>;

/**
 * Yedek zinciriyle ilk dolu metni seçer. `preferred` verilirse önce o dil (gösterim:
 * seçili → TR → FR → DE); verilmezse kanonik sıra TR → FR → DE (slug türetimi). Hiçbiri yoksa ''.
 */
export function resolveLocalizedText(text: LocalizedText, preferred?: 'tr' | 'fr' | 'de'): string {
  const order: Array<'tr' | 'fr' | 'de'> = preferred ? [preferred, 'tr', 'fr', 'de'] : ['tr', 'fr', 'de'];
  for (const lang of order) {
    const value = text[lang]?.trim();
    if (value) return value;
  }
  return '';
}
