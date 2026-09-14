import { resolveLocalizedText, type LocalizedText, type PreferredLanguage } from '@lezzet/types';

/**
 * Çok dilli metni çözer; boş/boşluk `null` sayılır — altyazı, rozet ve kampanya adı boşuna açılmasın
 * (`{tr:''}` form artığıdır, metin değildir; boş dize gönderilseydi ekran "adı var" sanıp adsız bir
 * cümle kurardı).
 *
 * TEK TANIM (14.09): vitrin bandı, tarif kartı, kampanyanın tele çıkışı, paket açıklaması ve mobil
 * sepet görünümü aynı kuralı kullanıyor. `apps/mobile-api`da iki kopyası vardı (`lib/home.ts` ve
 * `lib/campaign-wire.ts`); telefon vitrini pakete terfi ederken tek yere indi.
 */
export function resolvedOrNull(value: LocalizedText | null, locale: PreferredLanguage): string | null {
  if (!value) return null;
  const text = resolveLocalizedText(value, locale).trim();
  return text.length > 0 ? text : null;
}
