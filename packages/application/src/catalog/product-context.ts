import { PriceService, ProductVariantService, StockService } from '@lezzet/database';
import type { ActiveOffer } from '@lezzet/domain-core';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ProductWithRelations } from '@lezzet/types';
import type { ProductContext } from './map';
import type { PricingViewer } from './pricing-viewer';
import type { PlaceWarehouses } from './storefront-types';

/**
 * Bir ürün listesinin fiyat ve stok yan verilerini TOPLU okur (08.10; terfi 21.6 —
 * kaynağı `apps/web/lib/storefront/read-context.ts`).
 *
 * Kart başına sorgu atılmaz: liste kaç ürün olursa olsun sabit sayıda sorgu çalışır — 30 ürünlük
 * katalog sayfası 30 fiyat + 30 stok sorgusu atarsa sayfa açılmaz (`CLAUDE.md`: N+1 kırılır).
 * `findApplicableMap` bu iş için `PriceService`'e eklendi; stokta `getAvailableMap` zaten vardı.
 *
 * ── KİM SORUYOR (`viewer`) ───────────────────────────────────────────────────
 * Fiyat uzun süre `'b2c'` SABİTİYLE okunuyordu. Sabit geçerli bir değerdi, yani hiçbir şey hata
 * vermiyordu — ama iki şey sessizce ölüydü: **onaylanmış B2B müşteri toptan fiyat görmüyordu** ve
 * **müşteriye özel fiyat hiç okunmuyordu** (kimlik verilmeyince `findApplicableMap` o satırları
 * hiç aramıyor).
 *
 * Parametre ZORUNLU ve varsayılansız, tıpkı `place` gibi: varsayılan bıraksaydık argümanı unutan
 * çağrı derlenir ve sessizce perakende okurdu — yani az önce kapattığımız açığın kendisi geri
 * gelirdi, bu kez fark edilmesi daha da zor.
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
  place: PlaceWarehouses,
  viewer: PricingViewer,
): Promise<Map<string, ProductContext>> {
  const { warehouseId, shippingWarehouseId } = place;
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
  const [prices, stock, shippingStock, networkStock, offerBatches] = await Promise.all([
    // Kanal VE kimlik birlikte gider: kimlik olmadan `findApplicableMap` müşteriye özel fiyat
    // satırlarını hiç sorgulamıyor ve motor her zaman `customerPriceCents: null` alıyordu.
    new PriceService(db).findApplicableMap(variantIds, viewer.channel, viewer.customerId),
    warehouseId ? stocks.getAvailableMap(warehouseId, variantIds) : stocks.getNetworkAvailabilityMap(variantIds),
    // ── KARGO DEPOSU AYRI OKUNUR (19.10) ──────────────────────────────────────
    // "Yerel depoda yok" tek başına **tükendi demek DEĞİLDİR** (C3): ürün kargo deposunda duruyorsa
    // hâlâ satılabilir. Bu ikinci harita olmadan sistem müşteriyi tanıdıkça daha AZ satıyordu —
    // posta kodunu giren müşteri, kargoyla gönderebileceğimiz ürünü "Tükendi" görüyordu.
    //
    // Depo-üstü toplam bu soruyu cevaplayamaz: mal Kehl'in ROTA deposunda duruyor olabilir, kargo
    // deposunda değil. Toplam yalnız "hiçbir yerde yok mu"nun dayanağıdır.
    //
    // Yerel depo zaten kargo deposuysa (Strasbourg her ikisi) ikinci okuma atlanır — aynı satırları
    // iki kez getirmenin karşılığı yok.
    shippingWarehouseId && shippingWarehouseId !== warehouseId
      ? stocks.getAvailableMap(shippingWarehouseId, variantIds)
      : Promise.resolve(null),
    // ── ÜÇÜNCÜ SAYI: AĞ GENELİ (19.10) ────────────────────────────────────────
    // Dört hâli ayırmak için gerekli. "Yerelde yok + kargoda yok" iki AYRI şey olabilir: ürün
    // başka bir depoda duruyor olabilir (soğuk zincir, o bölgeye gitmiyor) ya da hiçbir yerde
    // olmayabilir. İlkinde doğru cümle "bölgenizde şu an yok" ve yanında "gelince haber ver"
    // (19.12); ikincisinde "tükendi". İkisini aynı kelimeyle söylemek, gelmeyecek malı bekletmek
    // ya da gelecek malı kaçırmaktır.
    //
    // Yer bilinmiyorsa okunmaz: `stock` zaten ağ-geneli toplamdır.
    warehouseId ? stocks.getNetworkAvailabilityMap(variantIds) : Promise.resolve(null),
    // ── TEKLİF TUTARI YALNIZ YER BELLİYKEN ────────────────────────────────────
    // Yer belliyse o deponun teklifi okunur. Yer BİLİNMİYORSA hiç okunmaz (boş liste): teklif bir
    // partiye bağlıdır, parti bir depodadır ve ziyaretçinin posta kodu oraya düşmeyebilir —
    // indirimli fiyatı gösterip checkout'ta yükseltmek verilmiş bir sözü bozmaktır.
    //
    // Bu, sıralamayla kartı da HİZALAR: `product_listing` yersiz okumada liste fiyatıyla sıralıyor
    // (0043). Teklifi burada okusaydık kart 3 € yazar, sıra 30 €'ya göre kurulurdu — ekran kendi
    // kendisiyle çelişirdi.
    warehouseId ? stocks.listOfferBatches(variantIds, warehouseId) : Promise.resolve([]),
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
