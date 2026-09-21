import { PriceService, ProductVariantService, StockService } from '@lezzet/database';
import type { ActiveOffer } from '@lezzet/domain-core';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ProductWithRelations } from '@lezzet/types';
import type { ProductContext } from './map';
import type { PricingViewer } from './pricing-viewer';
import type { PlaceWarehouses } from './storefront-types';

/**
 * Bir ürün listesinin fiyat ve stok yan verilerini sabit sayıda sorguyla toplu okur; `viewer` zorunludur, yoksa unutan çağrı
 * sessizce perakende fiyat okurdu. Yer belliyse o deponun kullanılabiliri (söz), belirsizse depo-üstü toplam ("hiç yok mu") okunur.
 */
export async function loadProductContext(
  db: SupabaseClient,
  rows: ProductWithRelations[],
  place: PlaceWarehouses,
  viewer: PricingViewer,
): Promise<Map<string, ProductContext>> {
  const { warehouseId, shippingWarehouseId } = place;
  /**
   * Yer biliniyor mu: `warehouseId` yalnız rota deposudur, rota dışındaki müşteride kargo deposu doludur; ikili üç hâli ayırır.
   */
  const yerBiliniyor = warehouseId !== null || shippingWarehouseId !== null;
  const context = new Map<string, ProductContext>();
  if (!rows.length) return context;

  // Sıra burada sabitlenir, çünkü fiyat eşitliğinde birincil boy gelen sıraya düşer ve PostgREST gömülü ilişki sırasını
  // garanti etmez; ölçüt `0032` tie-breaker'ıyla aynıdır.
  const variantsByProduct = new Map(
    rows.map((r) => [
      r.id,
      [...r.variants].sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt)),
    ]),
  );
  const variantIds = rows.flatMap((r) => r.variants.filter((v) => v.isActive).map((v) => v.id));

  const stocks = new StockService(db);
  const [prices, stock, shippingStock, networkStock, offerBatches] = await Promise.all([
    // Kanal VE kimlik birlikte gider: kimlik olmadan `findApplicableMap` müşteriye özel fiyat
    // satırlarını hiç sorgulamıyor ve motor her zaman `customerPriceCents: null` alıyordu.
    new PriceService(db).findApplicableMap(variantIds, viewer.channel, viewer.customerId),
    // Rota dışındaki müşteride yerel havuz boş haritadır, ağ-geneli değil; ağ toplamına düşse motor yine `local` derdi.
    warehouseId
      ? stocks.getAvailableMap(warehouseId, variantIds)
      : yerBiliniyor
        ? Promise.resolve(new Map())
        : stocks.getNetworkAvailabilityMap(variantIds),
    // Kargo deposu ayrı okunur, çünkü yerel depoda yok tek başına tükendi demek değildir; yerel depo zaten kargo deposuysa
    // ikinci okuma atlanır.
    shippingWarehouseId && shippingWarehouseId !== warehouseId
      ? stocks.getAvailableMap(shippingWarehouseId, variantIds)
      : Promise.resolve(null),
    // Ağ toplamı, yer bilindiğinde "başka depoda var" (`elsewhere`) ile "hiçbir yerde yok" ayrımının tek dayanağıdır;
    // yer bilinmiyorsa yerel havuz zaten ağ toplamıdır.
    yerBiliniyor ? stocks.getNetworkAvailabilityMap(variantIds) : Promise.resolve(null),
    // Teklif yalnız yer belliyken, malın geldiği depodan okunur: yer bilinmezken indirimli fiyatı gösterip checkout'ta
    // yükseltmek sözü bozardı ve kart yersiz sıralamayla (liste fiyatı) çelişirdi.
    // BEKLEYEN(19.7): teklifin varlığı (`has_near_expiry_offer`) posta kodu davetine dönüşecek.
    warehouseId || shippingWarehouseId
      ? stocks.listOfferBatches(variantIds, warehouseId ?? shippingWarehouseId ?? undefined)
      : Promise.resolve([]),
  ]);

  const offers = toOfferMap(offerBatches);
  for (const row of rows) {
    context.set(row.id, {
      viewer,
      variants: variantsByProduct.get(row.id) ?? [],
      prices,
      stock,
      // Yerel depo kargo deposuyla aynıysa `stock` zaten o cevabı taşıyor.
      shippingStock: shippingStock ?? (shippingWarehouseId ? stock : null),
      // Yer bilinmiyorsa `stock` zaten ağ toplamı — ikinci bir okumaya gerek yok.
      networkStock: networkStock ?? (warehouseId ? null : stock),
      offers,
    });
  }
  return context;
}

/**
 * Teklife açık partisi olan ürünlerin kimlikleri; "yalnız indirimliler" süzgeci sorguya önden girer, çünkü sayfa
 * çekildikten sonra elemek keyset sayfalamayı bozar. Boş dizi teklifli ürün yok demektir.
 */
export async function listOfferProductIds(db: SupabaseClient, warehouseId: string | null): Promise<string[]> {
  const batches = await new StockService(db).listOfferBatches(undefined, warehouseId ?? undefined);
  if (!batches.length) return [];
  const variants = await new ProductVariantService(db).listByIds([...new Set(batches.map((b) => b.variantId))]);
  return [...new Set(variants.map((v) => v.productId))];
}

/**
 * Teklifli partilerden varyant başına tek teklif, FEFO sırasıyla ilk parti. `remainingQty` fiili miktardır ve yalnız
 * karttaki etiketi besler; gerçek tavan sepete eklemede uygulanır.
 */
function toOfferMap(
  batches: Array<{ variantId: string; offerPriceCents: number | null; physicalQty: number; id: string }>,
): Map<string, ActiveOffer> {
  const offers = new Map<string, ActiveOffer>();
  for (const b of batches) {
    if (b.offerPriceCents == null || offers.has(b.variantId)) continue;
    offers.set(b.variantId, { unitPriceCents: b.offerPriceCents, remainingQty: b.physicalQty, stockId: b.id });
  }
  return offers;
}

/**
 * Bu depoda fiilen duran ürünlerin kimlikleri, çünkü araç bir vitrin değildir ve kuryenin satış listesi aracın içeriğidir.
 * Sipariş için yüklenmiş mal tesisin stoğu olduğu için girmez; boş dizi burada mal yok demektir.
 */
export async function listStockedProductIds(db: SupabaseClient, warehouseId: string): Promise<string[]> {
  const batches = await new StockService(db).listInStockDetailed(undefined, [warehouseId]);
  const variantIds = [...new Set(batches.filter((b) => b.physicalQty > 0).map((b) => b.variantId))];
  if (!variantIds.length) return [];
  const variants = await new ProductVariantService(db).listByIds(variantIds);
  return [...new Set(variants.map((v) => v.productId))];
}
