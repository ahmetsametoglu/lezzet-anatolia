import type { Locale, LocalizedCopy } from '@lezzet/i18n';
import type { StorefrontRecipeDetail, StorefrontRecipeItem } from '@/lib/storefront/storefront-types';
// `typeof messages` için değer bağı gerek (Messages tipi JSON'dan türetilir) — bu yüzden `import type` değil.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import messages from './messages.json';

// Tarif detayı tip/sözleşme modülü (view DEĞİL — gerçek view'lar recipe.desktop/recipe.mobile).

export type Messages = LocalizedCopy<typeof messages>;

export interface RecipeViewProps {
  t: Messages;
  locale: Locale;
  recipe: StorefrontRecipeDetail;
}

/**
 * **Sepete girebilecek kalemler** — tükenmiş ve fiyatsız olanlar elenir (08.24).
 *
 * Saf ve ayrı bir fonksiyon, çünkü aynı cevabı ÜÇ yer birden soruyor: "Tümünü sepete ekle" hangi
 * kalemleri gönderecek, düğme pasif mi (hiç kalem yoksa), ve onay mesajı kaç yazacak. Üçü ayrı
 * ifade olarak yazılsaydı biri bir gün ötekilerden ayrışır ve müşteriye eklenmeyen bir kalemi
 * "eklendi" diye sayardık.
 *
 * İki koşul ayrı sebep, aynı sonuç: tükenmiş kalem sepete GİREMEZ; fiyatı çözülemeyen kalem
 * satışa kapalıdır (`DOMAIN §5`) ve tutarsız bir toplam üretirdi.
 */
export function buyableItems(items: readonly StorefrontRecipeItem[]): StorefrontRecipeItem[] {
  return items.filter((item) => !item.soldOut && item.unitPriceCents !== null);
}
