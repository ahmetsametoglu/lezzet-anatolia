import type { Locale, LocalizedCopy } from '@lezzet/i18n';
import type { StorefrontHome } from '@/lib/storefront/storefront-types';
// `typeof messages` için değer bağı gerek (Messages tipi JSON'dan türetilir) — bu yüzden `import type` değil.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import messages from './messages.json';

// Anasayfa tip/sözleşme modülü (view DEĞİL — gerçek view'lar home.desktop/home.mobile).

/** Arayüz metinleri messages.json'dan TÜRETİLİR (elle interface yok). */
export type Messages = LocalizedCopy<typeof messages>;

/**
 * Masaüstü ve mobil sunum varyantlarının paylaştığı sözleşme. Anasayfa durumsuzdur: veri sunucuda
 * çözülür, varyantlar yalnız DÜZENİ değiştirir (Sapma 3 — çatallanma client sınırında).
 */
export interface HomeViewProps {
  t: Messages;
  locale: Locale;
  data: StorefrontHome;
}

/** "En fazla {n} adet" şablonunu doldurur — sayı yerleşimi tek yerde, iki varyantta tekrarlanmaz. */
export function limitText(template: string, limit: string | null): string | null {
  return limit ? template.replace('{n}', limit) : null;
}
