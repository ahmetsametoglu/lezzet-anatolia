import 'server-only';
import { PriceService, ProductVariantService, StockService } from '@lezzet/database';
import { toCents } from '@lezzet/helper';
import type { ActiveOffer } from '@lezzet/domain-core';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ProductWithRelations } from '@lezzet/types';
import type { ProductContext } from './map';

/**
 * Bir ürün listesinin fiyat ve stok yan verilerini TOPLU okur (08.10).
 *
 * Kart başına sorgu atılmaz: liste kaç ürün olursa olsun sabit sayıda sorgu çalışır — 30 ürünlük
 * katalog sayfası 30 fiyat + 30 stok sorgusu atarsa sayfa açılmaz (`CLAUDE.md`: N+1 kırılır).
 * `findApplicableMap` bu iş için `PriceService`'e eklendi; stokta `getAvailableMap` zaten vardı.
 *
 * Fiyat ziyaretçi kanalından (`b2c`) okunur. Giriş yapmış müşterinin kanalı ve özel fiyatı 04/07
 * bağlandığında buraya parametre olarak girer — kart ve sayfa değişmez.
 */
export async function loadProductContext(db: SupabaseClient, rows: ProductWithRelations[]): Promise<Map<string, ProductContext>> {
  const context = new Map<string, ProductContext>();
  if (!rows.length) return context;

  const variantsByProduct = new Map(rows.map((r) => [r.id, r.variants]));
  const variantIds = rows.flatMap((r) => r.variants.filter((v) => v.isActive).map((v) => v.id));

  const [prices, stock, offerBatches] = await Promise.all([
    new PriceService(db).findApplicableMap(variantIds, 'b2c'),
    new StockService(db).getAvailableMap(variantIds),
    new StockService(db).listOfferBatches(variantIds),
  ]);

  const offers = toOfferMap(offerBatches);
  for (const row of rows) {
    context.set(row.id, { variants: variantsByProduct.get(row.id) ?? [], prices, stock, offers });
  }
  return context;
}

/**
 * Teklife açık partisi olan ÜRÜNLERİN kimlikleri. Teklif partiye (dolayısıyla varyanta) bağlıdır,
 * vitrin ise ürün listeler — bu okuma o köprüyü kurar.
 *
 * Katalogda "yalnız indirimliler" süzgeci de bunu kullanır: süzme sonuç sayfası ÇEKİLDİKTEN sonra
 * elenerek yapılamaz, yoksa keyset sayfalama ve toplam sayı bozulur (sayfa başına değişken sayıda
 * ürün düşerdi). Kimlikler önden çözülüp sorguya girer.
 *
 * Boş dizi "teklifli ürün yok" demektir — çağıran bunu sonucu daraltmak için kullanır.
 */
export async function listOfferProductIds(db: SupabaseClient): Promise<string[]> {
  const batches = await new StockService(db).listOfferBatches();
  if (!batches.length) return [];
  const variants = await new ProductVariantService(db).listByIds([...new Set(batches.map((b) => b.variantId))]);
  return [...new Set(variants.map((v) => v.productId))];
}

/**
 * Teklife açık partiler → varyant başına TEK teklif. Partiler FEFO sırasında gelir (önce süresi
 * dolan), ilk satır kazanır: near-expiry indiriminin sebebi partinin tarihi olduğuna göre önce
 * en acili eritilir (DOMAIN §5).
 *
 * `remainingQty` fiili miktardır. Partiye çıpalanmış rezervasyon burada düşülmez — bu değer yalnız
 * karttaki "en fazla N adet" etiketini besler; gerçek tavan sepete eklemede uygulanır (07).
 */
function toOfferMap(batches: Array<{ variantId: string; offerPrice: number | null; physicalQty: number; id: string }>): Map<string, ActiveOffer> {
  const offers = new Map<string, ActiveOffer>();
  for (const b of batches) {
    if (b.offerPrice == null || offers.has(b.variantId)) continue;
    offers.set(b.variantId, { unitPriceCents: toCents(b.offerPrice), remainingQty: b.physicalQty, stockId: b.id });
  }
  return offers;
}
