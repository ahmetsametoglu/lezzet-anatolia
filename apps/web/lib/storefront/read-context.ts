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
 *
 * ── YER BİLİNİYOR MU (DOMAIN §17) ────────────────────────────────────────────
 * `warehouseId` **null olabilir ve bu normaldir**: posta kodu zorunlu değil (K1), ziyaretçi
 * katalogu yerini söylemeden gezebilir. İki okuma AYRI sözleşmedir:
 *
 * - Yer BELLİ → o deponun kullanılabiliri. Söz kesindir: "var" dediğimiz mal o depodadır.
 * - Yer BELİRSİZ → depo-ÜSTÜ toplam. Burada "var" bir vaat DEĞİL, "yok"un dayanağıdır:
 *   ziyaretçiye "tükendi" demenin tek meşru hâli hiçbir depoda bulunmamasıdır (C3). Toplamı
 *   satılabilir gibi göstermek yanlış olurdu — 3 STR'de + 2 KEHL'de duran maldan 5 kişilik
 *   sipariş çıkmaz — ama "hiç yok mu" sorusunun doğru cevabı odur.
 */
export async function loadProductContext(
  db: SupabaseClient,
  rows: ProductWithRelations[],
  warehouseId: string | null,
): Promise<Map<string, ProductContext>> {
  const context = new Map<string, ProductContext>();
  if (!rows.length) return context;

  // Sıra BURADA sabitlenir. Kartın fiyatı ürünün İLK aktif varyantından okunur (`map.ts`) ve gömülü
  // ilişkinin dönüş sırası PostgREST'te garantili DEĞİLDİR — sabitlenmezse aynı ürün iki istekte
  // farklı "başlangıç fiyatı" gösterebilir. Ölçüt operatörün elindeki sıra, eşitlikte doğuş anı.
  const variantsByProduct = new Map(
    rows.map((r) => [
      r.id,
      [...r.variants].sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt)),
    ]),
  );
  const variantIds = rows.flatMap((r) => r.variants.filter((v) => v.isActive).map((v) => v.id));

  const stocks = new StockService(db);
  const [prices, stock, offerBatches] = await Promise.all([
    new PriceService(db).findApplicableMap(variantIds, 'b2c'),
    warehouseId ? stocks.getAvailableMap(warehouseId, variantIds) : stocks.getNetworkAvailabilityMap(variantIds),
    // ── TEKLİF TUTARI YALNIZ YER BELLİYKEN ────────────────────────────────────
    // Yer belliyse o deponun teklifi okunur. Yer BİLİNMİYORSA hiç okunmaz (boş liste): teklif bir
    // partiye bağlıdır, parti bir depodadır ve ziyaretçinin posta kodu oraya düşmeyebilir —
    // indirimli fiyatı gösterip checkout'ta yükseltmek verilmiş bir sözü bozmaktır.
    //
    // Bu, sıralamayla kartı da HİZALAR: `product_listing` yersiz okumada liste fiyatıyla sıralıyor
    // (0043). Teklifi burada okusaydık kart 3 € yazar, sıra 30 €'ya göre kurulurdu — ekran kendi
    // kendisiyle çelişirdi.
    //
    // BEKLEYEN(19.7): teklifin VARLIĞI (`has_near_expiry_offer`) posta kodu davetine dönüşecek —
    // "posta kodunuzu girin, size ulaşabilecek son tarih indirimlerini görün".
    warehouseId ? stocks.listOfferBatches(variantIds, warehouseId) : Promise.resolve([]),
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
export async function listOfferProductIds(db: SupabaseClient, warehouseId: string | null): Promise<string[]> {
  const batches = await new StockService(db).listOfferBatches(undefined, warehouseId ?? undefined);
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
