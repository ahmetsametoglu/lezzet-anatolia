import { dictionarySlugOf } from '../money/dictionary-slug';
import { pinpointOutcomeOf, type PinpointOutcome } from '../money/pinpoint';

/**
 * TEDARİKÇİ KALEM ANAHTARI (06.16 · 22.43 · kullanıcı kararı 14.09) — faturadaki kalem bizim
 * varyantımıza nasıl bağlanır.
 *
 * Kullanıcının cümlesi: *"Bazı ürünlerde SKU olmayabilir. O zaman hangi dilde ad varsa o SKU olarak
 * sisteme işlenebilir; aradaki boşluklar atılır, araya tire konur."*
 *
 * Kural: tedarikçinin kodu varsa kod (kırpılmış); yoksa tedarikçinin yazdığı ad — hangi dildeyse —
 * sözlük slug kuralından geçer (`dictionarySlugOf`: küçük harf, aksan ve Türkçe harf sadeleşir,
 * boşluk tireye döner): "Druivenmelasse 650gr" → `druivenmelasse-650gr`. İkinci bir normalizasyon
 * yazılmaz; anahtar `supplier_product.supplier_code`a yazılır, ad olduğu gibi `name_at_supplier`da
 * durur. Tekillik veride: tedarikçi + kod (`supplier_product_code_key`, `lower`).
 *
 * Eşleşme NOKTA ATIŞIDIR: parça ad yok. Tedarikçi yazımı değiştirirse ("650 gr" ↔ "650gr") anahtar
 * değişir ve eşleşmez — asistan sorar, yönetici eşler. Sayı ile birim arasındaki boşluğu yok sayan
 * bir kural gerekirse buraya, parametrik olarak eklenir.
 */
export function supplierItemKeyOf(code: string | null | undefined, name: string | null | undefined): string | null {
  const trimmed = code?.trim() ?? '';
  if (trimmed) return trimmed;
  return name ? dictionarySlugOf(name) : null;
}

export interface SupplierItemRef {
  code?: string | null;
  name?: string | null;
}

/**
 * Bir tedarikçinin eşlemeleri içinde kalemi bulur: kod verildiyse kod eşitliği (büyük-küçük harf
 * duyarsız); ad verildiyse adın slug'ı ya kayıtlı koda (kodsuz eşlemenin anahtarı) ya da
 * tedarikçideki adın slug'ına eşit. Liste TEDARİKÇİ BAŞINADIR (çağıran öyle verir) — küresel kod
 * araması (`findBySupplierCode`) başka bir sorunun kapısı: barkod tarama zinciri.
 */
export function matchSupplierItem<T extends { id: string; supplierCode: string; nameAtSupplier: string | null }>(
  mappings: readonly T[],
  item: SupplierItemRef,
): PinpointOutcome<T> {
  const code = item.code?.trim().toLowerCase() ?? '';
  const nameKey = item.name ? dictionarySlugOf(item.name) : null;
  if (!code && !nameKey) return { status: 'none' };
  const hits = mappings.filter((mapping) => {
    const storedCode = mapping.supplierCode.trim().toLowerCase();
    if (code && storedCode === code) return true;
    if (nameKey && (storedCode === nameKey || dictionarySlugOf(mapping.nameAtSupplier ?? '') === nameKey)) return true;
    return false;
  });
  return pinpointOutcomeOf(hits);
}
