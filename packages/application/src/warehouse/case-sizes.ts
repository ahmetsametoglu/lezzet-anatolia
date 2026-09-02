import { VariantBarcodeService } from '@lezzet/database';
import type { CaseSizeContract } from '@lezzet/types';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Varyant → kayıtlı KOLİ BOYLARI (tek turda, çarpana göre sıralı).
 *
 * Aynı harita dört yerde elle kuruluyordu (mal kabul · okutma · ürün araması · şimdi sayım ve
 * transfer); beşinci kopyayı yazmak yerine tek kapı (CLAUDE §1). Kurallar burada, tek yerde:
 * · **Paket kodları (`unit`, çarpan 1) elenir** — çekmecede "1 paketlik koli" diye görünürlerdi.
 * · **Sıra ÇARPANA göre, küçük koli önce** — depocunun elindeki koliyi listede aradığı ölçüt
 *   kaç paket olduğudur; okunma sırası ona bir şey söylemez.
 * · Boş liste = kayıtlı boy yok; çağıran uydurmaz, çekmece "başka koli boyu" ile ölçtürür.
 */
export async function caseSizesByVariant(
  db: SupabaseClient,
  variantIds: readonly string[],
): Promise<Map<string, CaseSizeContract[]>> {
  const casesOf = new Map<string, CaseSizeContract[]>();
  if (variantIds.length === 0) return casesOf;
  const barcodes = await new VariantBarcodeService(db).listByVariants([...variantIds]);
  for (const barcode of barcodes) {
    if (barcode.kind !== 'case') continue;
    const list = casesOf.get(barcode.variantId) ?? [];
    list.push({ code: barcode.code, qtyPerCode: barcode.qtyPerCode });
    casesOf.set(barcode.variantId, list);
  }
  for (const list of casesOf.values()) list.sort((a, b) => a.qtyPerCode - b.qtyPerCode);
  return casesOf;
}
