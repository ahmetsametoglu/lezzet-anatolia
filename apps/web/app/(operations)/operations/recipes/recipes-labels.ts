import { titleOf } from '@/lib/catalog/title';
import type { OpsTone } from '@/components/operation/ui/tone';
import type { RecipeItemView, RecipeView } from './recipes-types';

/**
 * Tarif ekranının sözlüğü (09.21). İç terim ham kullanılmaz: ekranda `is_active` değil
 * "Yayında", `locale` değil "TR/FR/DE" yazar.
 */

const LOCALE_LABEL: Record<string, string> = { tr: 'TR', fr: 'FR', de: 'DE' };

/** Yayın durumu — rozetin hem rengi hem sözü tek yerden. */
export function statusBadge(recipe: RecipeView): { label: string; tone: OpsTone } {
  return recipe.isActive ? { label: 'Yayında', tone: 'olive' } : { label: 'Taslak', tone: 'slate' };
}

/**
 * Diller rozeti — DOLU olanları yazar, sayı değil.
 *
 * "2/3" okuyan operatör hangisinin eksik olduğunu aramak zorunda kalırdı; "TR FR" yazınca eksik
 * olan bakışta belli oluyor. Üçü de doluysa rozet olive, eksik varsa amber: renk bir uyarı değil,
 * yayın kapısının hâli.
 */
export function langBadge(recipe: RecipeView): { label: string; tone: OpsTone } {
  const filled = recipe.filledLocales.map((locale) => LOCALE_LABEL[locale] ?? locale.toUpperCase());
  return {
    label: filled.length > 0 ? filled.join(' ') : 'boş',
    tone: recipe.canPublish ? 'olive' : 'amber',
  };
}

export const RECIPE_NOTES = {
  /** Veri BU EKRANDAN doğuyor (05.16 zinciri): boş durum bir arıza değil, başlangıç. */
  empty:
    'Tarifler buradan doğuyor — müşteri yüzeyindeki "Sofradan Fikirler" bu kayıtları okuyor. İlk tarifi ekleyip malzemelerini ürün kayıtlarından bağlayın.',
  pick: 'Soldaki listeden bir tarif seçin; malzemeleri, adımları ve yayın durumu burada görünür.',
  /** Yeni tarif taslak DOĞAR — yayın ayrı bir karar ve ayrı bir düğme. */
  newSubtitle: 'Taslak olarak açılır; üç dilde ad dolunca yayına alınabilir.',
  /** Fiyat burada girilmez (tasarımın kuralı) — ekran fiyatın sahibi değil, okuyucusu. */
  itemsAside: 'ürün kaydından seçilir · fiyat oradan okunur',
  /** Satır = madde; kullanıcı kararı 07.08 (`KARARLAR §3z`). Numarayı önizleme veriyor. */
  lineIsItem: 'her satır bir adım',
  pantryAside: 'her satır bir madde · satışa bağlanmaz',
  /** Kalemi olmayan tarif geçerli bir taslaktır — eksiklik değil, henüz bağlanmamış demek. */
  noItems: 'Henüz bağlı malzeme yok — bu tarif müşteride sepete eklenebilir bir şey göstermez.',

  /**
   * Yayın kapısının cümlesi. Kısıt VERİDE (üç dil dolmadan `is_active` olmaz, 05.16); buradaki
   * metin o kısıtı operatörün diline çeviriyor — yoksa kayıt anında anlaşılmaz bir hata döner.
   * Hangi dilin eksik olduğu tek tek yazılır: "eksik dil var" demek, aramaya gönderirdi.
   */
  publishGate: (recipe: RecipeView): string => {
    if (recipe.canPublish) {
      return recipe.isActive
        ? 'Yayında — müşteri yüzeyinde görünüyor.'
        : 'Üç dil de dolu; bu tarif yayına alınabilir.';
    }
    const missing = recipe.missingLocales.map((locale) => LOCALE_LABEL[locale] ?? locale.toUpperCase()).join(', ');
    return `Yayınlanamaz: ${missing} dilinde ad yok. Tarif adı üç dilde de dolmadan yayına alınamaz — müşteri o dilde adsız bir kart görürdü.`;
  },
} as const;

/**
 * Malzeme satırının başlığı — ürün adı + boy, tek yerden (`titleOf`).
 *
 * **Sözlükte, okumada DEĞİL:** `recipes-read` `server-only` ve bunu çağıran ekran bir İSTEMCİ
 * bileşeni. Orada dururken sayfa 500 dönüyordu (ölçüldü 08.08) — sunucuya kilitli bir modül
 * istemci ağacına girdiği an derleme değil ÇALIŞMA anında patlıyor, yani typecheck göremiyor.
 */
export function recipeItemTitle(item: RecipeItemView): string {
  return titleOf(item.productName, item.variantLabel);
}
