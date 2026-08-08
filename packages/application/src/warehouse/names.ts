import { ProductService, ProductVariantService } from '@lezzet/database';
import { resolveLocalizedText } from '@lezzet/types';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Varyantın DEPO EKRANLARINDA görünen adı — **dört kapının ortak okuması** (terfi 21.11).
 *
 * Hazırlık kuyruğu, mal kabul formu ve transfer kabulü aynı soruyu soruyor: "bu varyantın ürün adı
 * ve boy etiketi ne". Üç kapı kendi kopyasını taşısaydı üçü de aynı iki sorguyu (varyant → ürün)
 * kurardı ve biri gün gelip ötekinden farklı bir ad üretirdi (ör. boyu parantezle mi yazıyor).
 *
 * **İki tur, varyant başına sorgu YOK** (N+1): kimlikler toplanır, iki `listByIds` ile çözülür.
 *
 * **Operasyon yüzeyi Türkçedir** (CLAUDE.md §2) — çözüm dili sabit `tr`. Depocunun ekranı müşterinin
 * diliyle konuşmaz; koli etiketiyle rafın üstündeki yazı aynı dilde olmalı.
 */

/**
 * Dışa VERİLMEZ ve bu bilinçli: tüketiciler haritanın değerini yapısal olarak okuyor (`.productName`
 * / `.variantLabel`), tipin adına ihtiyaçları yok. İhraç edilseydi paketin kamu yüzeyinde hiç
 * çağrılmayan bir isim dururdu (`knip`).
 */
interface VariantName {
  /** "Fıstıklı Baklava" — ürünün operasyon dilindeki adı. */
  productName: string;
  /** "500 g" gibi boy etiketi; tek boylu üründe boş dize. */
  variantLabel: string;
}

/** Bilinmeyen varyant için gösterilecek ad — uydurma bir metin yerine görünür bir boşluk. */
const UNKNOWN = '—';

export async function variantNames(
  db: SupabaseClient,
  variantIds: readonly string[],
): Promise<Map<string, VariantName>> {
  const ids = [...new Set(variantIds)];
  if (ids.length === 0) return new Map();

  const variants = await new ProductVariantService(db).listByIds(ids);
  const products = await new ProductService(db).listByIds([...new Set(variants.map((variant) => variant.productId))]);
  const productOf = new Map(products.map((product) => [product.id, product]));

  return new Map(
    variants.map((variant) => [
      variant.id,
      {
        productName: resolveLocalizedText(productOf.get(variant.productId)?.name ?? {}, 'tr'),
        variantLabel: resolveLocalizedText(variant.label, 'tr'),
      },
    ]),
  );
}

/**
 * Tek satırlık ad — "Ürün (boy)". Boy etiketi yoksa parantez de yoktur: boş parantez, olmayan bir
 * ayrımı varmış gibi gösterir.
 */
export function displayName(name: VariantName | undefined): string {
  if (!name) return UNKNOWN;
  return name.variantLabel ? `${name.productName} (${name.variantLabel})` : name.productName;
}
