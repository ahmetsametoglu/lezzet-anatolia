import 'server-only';
import { PriceService, ProductService, ProductVariantService, StockService, type Db } from '@lezzet/database';
import { publicImageUrl } from '@lezzet/storage';
import { resolveLocalizedText, type ProductPool } from '@lezzet/types';
import { titleOf } from '@/lib/catalog/title';
import type { VariantOption } from '@/components/operation/form/bundle-form/types';

/**
 * Havuz satırı → paket formunun gördüğü seçenek (22.11 · taşındı, kopyalanmadı).
 *
 * Ürün sayfasının `products-read.ts`indeydi ve tek çağıranı paket eylemleriydi; o eylemler ortak
 * alana çıkınca (kuyruk da aynı formu açıyor) bu türev de onlarla birlikte geldi. Sayfa klasöründe
 * bırakılsaydı `lib/` → `app/` yönünde bir bağımlılık kalırdı — ters yön (`docs:check §3e`).
 *
 * **PASİF OLAN DA GELİR:** havuz hem "pakete ne eklenebilir" (yalnız aktif) hem "pakette duran
 * kalemin adı ne" (hepsi) sorusuna hizmet ediyor. Aktifle sınırlıyken pasif ürünün kalemi adsız
 * kalıyordu ve ekran onu "silinmiş" sanıyordu — oysa pakette duran varyant FK gereği (`restrict`)
 * silinemez. Eklenebilirlik artık ayrı bir alan (`addable`), süzgeç değil.
 *
 * **TEK KAYNAK:** paket formunun seçicisi de, öneri gövdesinin kalem satırları da bunu kullanır.
 * İki yerde ayrı kurulsaydı biri "500 g" öbürü "Baklava 500 g" yazar, aynı kalem iki adla görünürdü.
 */
function toVariantOptions(
  rows: ProductPool[],
  listPriceCents: Map<string, number>,
  unitCosts: Map<string, number>,
): VariantOption[] {
  return rows.flatMap((p) => {
    const productName = resolveLocalizedText(p.name);
    const imageUrl = publicImageUrl(p.imageKey, p.imageUpdatedAt);
    // Ürün düzeyindeki engel varyantın hepsini kapsar; boy düzeyindeki yalnız o boyu.
    const productBlock = p.status === 'active' ? null : p.status === 'candidate' ? 'aday ürün' : 'pasif ürün';
    return p.variants.map((v) => {
      const boy = resolveLocalizedText(v.label);
      const blockedReason = productBlock ?? (v.isActive ? null : 'pasif boy');
      return {
        variantId: v.id,
        label: titleOf(productName, boy),
        imageUrl,
        listPriceCents: listPriceCents.get(v.id) ?? null,
        // Maliyet ve KDV oranı ÜRÜNDEN gelir; marj ikisi olmadan hesaplanamaz.
        unitCostCents: unitCosts.get(v.id) ?? null,
        vatRate: p.vatRate,
        targetMarginPercent: p.targetMarginPercent ?? null,
        addable: blockedReason === null,
        blockedReason,
      };
    });
  });
}

/** Havuzda kaç ürün taranır — arama zaten daraltıyor, bu bir kaçak freni. */
const VARIANT_POOL_LIMIT = 500;

/**
 * Verilen ÜRÜNLERİN seçenek verisi: havuz satırı + b2c liste fiyatı + birim maliyet.
 *
 * Üç çağıranı var (paket formu açılışı · kalem araması · asistan kuyruğunun paket önerisi) ve üçü de
 * AYNI üç okumayı ister; ayrı yazılsalardı kalemin formda gördüğü fiyatla kuyrukta gördüğü fiyat bir
 * gün ayrışırdı. `bundle-actions` içinde özel bir fonksiyondu; kuyruk da isteyince buraya çıktı.
 */
export async function variantOptionsForProducts(db: Db, productIds: string[]): Promise<VariantOption[]> {
  if (productIds.length === 0) return [];
  const poolRows = await new ProductService(db).listPool(VARIANT_POOL_LIMIT, productIds);

  // Fiyat ve maliyet havuz kimliklerini bekler; ikisi de TEK turda (varyant başına sorgu yok).
  const variantIds = poolRows.flatMap((p) => p.variants.map((v) => v.id));
  const [priceRows, unitCosts] = await Promise.all([
    new PriceService(db).findApplicableMap(variantIds, 'b2c'),
    new StockService(db).unitCostCentsMap(variantIds),
  ]);
  const listPrices = new Map(
    [...priceRows].flatMap(([id, { channelPrice }]) => (channelPrice ? [[id, channelPrice.amountCents] as const] : [])),
  );
  return toVariantOptions(poolRows, listPrices, unitCosts);
}

/**
 * VARYANT kimliklerinden seçenek verisi — asistan kuyruğunun sorusu (22.18).
 *
 * Paket önerisinin dilekçesi kalemleri `variantId` ile taşıyor, ürün kimliğiyle değil; havuz okuması
 * ise ÜRÜN üzerinden çalışıyor (bir üründen birden çok boy çıkar ve hepsinin adı satırda gerekir).
 * Aradaki tek adım burada: varyanttan ürüne çık, sonra ürünün TÜM boylarını getir.
 *
 * Ürünün öteki boylarının da gelmesi bir fazlalık değil, gereklilik: operatör önerideki "500 g"yi
 * "1 kg" ile değiştirmek isterse seçenek listede olmalı.
 */
export async function variantOptionsForVariants(db: Db, variantIds: string[]): Promise<VariantOption[]> {
  const wanted = [...new Set(variantIds)];
  if (wanted.length === 0) return [];
  const variants = await new ProductVariantService(db).listByIds(wanted);
  return variantOptionsForProducts(db, [...new Set(variants.map((v) => v.productId))]);
}
