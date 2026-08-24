import { ProductService, ProductVariantService, VariantBarcodeService } from '@lezzet/database';
import { publicImageUrl } from '@lezzet/storage';
import { resolveLocalizedText } from '@lezzet/types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { variantNames } from './names';

/**
 * **PLANSIZ KABULÜN ÜRÜN ARAMASI** (23.13) — "elimde mal var, kayıtta karşılığı hangisi?"
 *
 * ── NEDEN AYRI BİR KAPI ─────────────────────────────────────────────────────
 * PO'lu kabulde satır kümesi SİPARİŞTEN gelir ve arama gereksizdir; oradaki "katalog araması
 * bilerek yok" kararı (karar §1.3) hâlâ geçerli — yanlış ürüne öğretmenin kapısıdır. Plansız
 * kabulde ise küme YOKTUR: mal gelmiştir, siparişi girilmemiştir. Depocu ürünü bir şekilde
 * seçebilmeli, yoksa kabul hiç yazılamaz (ekran bugüne kadar bu yüzden satır açamıyordu).
 *
 * ── KOD ARAMASI ÖNCE, AD SONRA ──────────────────────────────────────────────
 * Girilen metin bir KOD olabilir (okutulan barkod, SKU, tedarikçi kodu). Kod eşleşirse ada hiç
 * bakılmaz — kod kesin kimliktir, ad tahmindir (`code-search.ts`'in web'de aldığı aynı karar).
 * Zincir yine tek kapıdan (`findByCode`), ikinci bir arama sırası açılmıyor.
 *
 * ── PARA TAŞIMAZ ────────────────────────────────────────────────────────────
 * Dönen satırda fiyat YOK ve olamaz: depo yolu fiyat görmez (09.14) — kabul gövdesinde maliyet
 * alanı da yok. Satır yalnız kimlik + tanıma yetecek kadar künye taşır.
 */

export interface VariantSearchRow {
  variantId: string;
  productName: string;
  variantLabel: string;
  sku: string | null;
  imageUrl: string | null;
  /** Kod eşleşmesiyle bulunduysa okutmanın kaç adet saydığı; ad aramasında `null`. */
  qtyPerCode: number | null;
}

/**
 * Tavan ÜRÜNE uygulanır, satıra değil: sayfa ürün sayfası ve her ürün boylarıyla açılıyor — yani
 * dönen satır sayısı bundan büyük olabilir (ölçüldü 24.08: "baklava" → 12 ürün, 27 boy). Doğrusu
 * da bu; bir ürünün boylarından yalnız bazılarını göstermek, depocuya elindeki malın listede
 * olmadığını düşündürürdü.
 */
const DEFAULT_LIMIT = 12;

export async function searchVariantsForIntake(
  db: SupabaseClient,
  input: { query: string; limit?: number },
): Promise<VariantSearchRow[]> {
  const query = input.query.trim();
  if (query.length === 0) return [];
  const limit = input.limit ?? DEFAULT_LIMIT;

  // 1) KOD: eşleşirse tek satır döner ve ada hiç bakılmaz.
  const match = await new VariantBarcodeService(db).findByCode(query);
  if (match) {
    // Ad/görsel çözümü depo kapılarının ORTAK okumasından (`names.ts`) — ikinci bir "varyantın adı
    // nasıl bulunur" yolu açılmıyor. SKU varyantın kendi alanı, tek turda yanından alınır.
    const [names, variants] = await Promise.all([
      variantNames(db, [match.variantId]),
      new ProductVariantService(db).listByIds([match.variantId]),
    ]);
    const name = names.get(match.variantId);
    if (name !== undefined) {
      return [
        {
          variantId: match.variantId,
          productName: name.productName,
          variantLabel: name.variantLabel,
          sku: variants[0]?.sku ?? null,
          imageUrl: name.imageUrl,
          qtyPerCode: match.qtyPerCode,
        },
      ];
    }
  }

  // 2) AD: üç dilde `ilike` (servisin kendi süzgeci). Aday ürünler de gelir — depoya girmiş bir
  // numunenin kabulü meşrudur; satılamaz olması ekranın söyleyeceği şeydir, saklayacağı değil.
  const page = await new ProductService(db).listStockRows({ filters: { query }, limit });
  return page.rows.flatMap((product) =>
    product.variants
      .filter((variant) => variant.isActive)
      .map((variant) => ({
        variantId: variant.id,
        productName: resolveLocalizedText(product.name, 'tr'),
        variantLabel: resolveLocalizedText(variant.label, 'tr'),
        sku: variant.sku ?? null,
        imageUrl: publicImageUrl(product.imageKey, product.imageUpdatedAt),
        qtyPerCode: null,
      })),
  );
}

