import type { Locale } from '@lezzet/i18n';
import { formatPrice } from './format';

/**
 * TARİF SATIRININ ALT METNİ (terfi 14.09) — "{adet} × {boy} · {fiyat}": native tarif detayı ile web'in telefon
 * görünümü aynı cümleyi kurar. Önce native ekranın içindeydi (`recipe-detail-screen.tsx` `rowMeta`); web ikizi
 * ikinci çağıran olunca buraya taşındı (CLAUDE §1).
 *
 * Kurallar native'in künyesinden:
 *   · Adet YALNIZ birden çoksa yazılır ("2 × 500 g"): tarifin çoğu malzemesi tektir, "1 ×" her satıra gürültü ekler.
 *     Adet ekseni veri modelinin kendisi (toplam = Σ adet × fiyat).
 *   · Boş parça sessizce düşer: tek boylu ürünün boş etiketi, fiyatsız (satışa kapalı) satırın fiyatı — "0,00 €"
 *     yazılmaz, sıfır ölçülemeyen değerin yerini tutmaz.
 *
 * Girdi iki yüzeyin satır tipinden bağımsız: native `RecipeRow` (`variantLabel` · `priceCents`) ile web
 * `StorefrontRecipeItem` (`unitLabel` · `unitPriceCents`) aynı üç alanı başka adlarla taşıyor.
 */
export function recipeRowMetaOf(row: { qty: number; label: string; priceCents: number | null }, locale: Locale): string {
  const size = [row.qty > 1 ? `${row.qty} ×` : null, row.label.length > 0 ? row.label : null]
    .filter((part): part is string => part !== null)
    .join(' ');
  return [size.length > 0 ? size : null, row.priceCents === null ? null : formatPrice(row.priceCents, locale)]
    .filter((part): part is string => part !== null)
    .join(' · ');
}
