import { needsExpiryAttention } from '@lezzet/domain-core';
import { resolveLocalizedText, type AvailableStock, type ProductStatus, type ProductStockRow } from '@lezzet/types';
import { publicImageUrl } from '@lezzet/storage';
import type { BatchView } from '@/lib/stock/batch-types';
import { titleOf } from '@/lib/catalog/title';

// Stok seviyesi satırı — İKİ yüzeyin ortak kurulumu (16.08): stok ekranının ana listesi ve ürünler
// önizlemesinin stok bakışı aynı satırı okur. `stock-read.ts`ten taşındı (desen:
// `lib/pricing/price-rows` — fiyat satırı da aynı devri yaşadı); stok sayfasındaki 30+ kullanım
// yeri `stock-types` re-export'u üzerinden yoluna devam eder.
//
// KARARLAR BURADA SORULUR, BURADA VERİLMEZ: her satır `domain-core/stock`'a danışır. Uygulama
// katmanı motoru veriyle buluşturur (STACK §4) — eşiği kendi kurmaz, yüzdeyi kendi hesaplamaz.

/**
 * Bir boyun TEK depodaki gerçeği — satır açılınca görünen kırılım (19.5).
 *
 * Satırın toplamı bu parçaların toplamıdır; iki ayrı okumadan gelmez. "3 STR'de + 2 KEHL'de duran
 * maldan 5 kişilik sipariş çıkmaz" (`DOMAIN §17`) — operatörün transfer kararı bu kırılımda doğar,
 * ama kararın kendisi burada VERİLMEZ (Transfer ekranının işi).
 */
export interface StockWarehouseSplit {
  warehouseId: string;
  code: string;
  name: string;
  physicalQty: number;
  reservedQty: number;
  availableQty: number;
  /** O depodaki en yakın son tarih — hangi şehirdeki malın daha acil olduğu kırılımda okunur. */
  nearestExpiry: string | null;
}

/**
 * Stok seviyesi satırı — ekranın ana listesi. Satır BOYDUR (satılabilir birim), ama adı ve tarih
 * rejimi üründen gelir.
 *
 * `batches` satırla birlikte taşınır: partiler zaten toplu okundu (depoda duran parti sayısı fiziksel
 * olarak sınırlı), o yüzden satırı açmak yeni bir tur gerektirmez. Ürün formunun tersi bir karar
 * ve sebebi ölçüdür: orada katalogun tamamı taşınıyordu, burada elde ne varsa o kadar.
 */
export interface StockLevelRow {
  variantId: string;
  productId: string;
  productName: string;
  variantLabel: string;
  /** Listede görünen tam ad — "Fıstıklı Baklava · 1 kg". */
  title: string;
  /**
   * Ürünün görseli (22.30) — `null` = görsel yüklenmemiş, ekran yer tutucu çizer.
   *
   * Adres SUNUCUDA kuruluyor (`publicImageUrl`, `R2_PUBLIC_BASE_URL` sunucu env'i) ve sürüm damgası
   * `imageUpdatedAt`ten geliyor: görsel değişince adres de değişir, tarayıcı bayat kopyayı göstermez.
   */
  imageUrl: string | null;
  categoryName: string;
  status: ProductStatus;
  /** Boy satışa kapalıysa stok yine görünür; ekran sebebi söyler. */
  variantActive: boolean;
  physicalQty: number;
  reservedQty: number;
  availableQty: number;
  /** Eşik (varsa) ve altına düşmüş mü — "sipariş zamanı" göstergesi. */
  minStockQty: number | null;
  belowMin: boolean;
  /**
   * Depo kırılımı — yalnız MALI OLAN depolar, operatörün seçici sırasıyla (19.5).
   *
   * Boş = hiçbir depoda stok yok. Tek elemanlı = mal tek yerde (satır kodu doğrudan söyler).
   * Çok elemanlı = "N depoda" ipucu + açılır kırılım. Üç hâl de aynı diziden okunur; ayrı bir
   * "kaç depoda" alanı tutmak, sayının listeden sapabileceği ikinci bir gerçek yaratırdı.
   */
  warehouses: StockWarehouseSplit[];
  batches: BatchView[];
  /** En yakın son tarihli parti (FEFO'da ilk çıkacak olan) — yoksa stok yok demektir. */
  nearest: BatchView | null;
  /** Karar bekleyen parti sayısı (yaklaşan · açık teklif · imhalık). */
  attentionCount: number;
}

interface StockLevelInput {
  products: ProductStockRow[];
  batches: BatchView[];
  /**
   * `available_stock` satırları — **(depo, varyant) taneli** (19.5).
   *
   * Satırın toplamı da depo kırılımı da BUNDAN türer, iki ayrı okumadan değil: toplam depo-üstü bir
   * görünümden gelseydi (`available_stock_total`) kırılımın toplamıyla ayrışabilirdi ve hangisinin
   * doğru olduğu belli olmazdı. Tek kaynak, tek gerçek.
   */
  available: readonly AvailableStock[];
  categoryNames: Map<string, string>;
  /** Kimlik → ad/kod; SIRASI operatörün seçici sırasıdır ve kırılım o sırayla çizilir. */
  warehouseLabels: Map<string, { id: string; code: string; name: string }>;
}

/**
 * Ürün sayfasını + partileri + kullanılabilirliği stok seviyesi satırlarına indirger.
 *
 * Satır BOYDUR: bir ürünün üç boyu üç satır olur — çok depoda bile. Varyant×depo düz listesi tarama
 * düzenini bozardı (aynı ürün üç kez), o yüzden depo satıra değil satırın İÇİNE iner: toplam üstte,
 * kırılım açılınca. Partiler varyant kimliğine göre eşlenir; eşleşme bulunamayan boy da listede
 * kalır ("stok yok" da bir cevaptır — gizlenirse operatör ürünün hiç girilmediğini fark edemez).
 */
export function toLevelRows({ products, batches, available, categoryNames, warehouseLabels }: StockLevelInput): StockLevelRow[] {
  const byVariant = new Map<string, BatchView[]>();
  for (const b of batches) {
    const list = byVariant.get(b.variantId);
    if (list) list.push(b);
    else byVariant.set(b.variantId, [b]);
  }

  const availableByVariant = new Map<string, AvailableStock[]>();
  for (const a of available) {
    const list = availableByVariant.get(a.variantId);
    if (list) list.push(a);
    else availableByVariant.set(a.variantId, [a]);
  }

  const order = new Map([...warehouseLabels.keys()].map((id, i) => [id, i]));

  const rows: StockLevelRow[] = [];
  for (const p of products) {
    const productName = resolveLocalizedText(p.name);
    for (const v of p.variants) {
      // Partiler son tarihe göre sıralı geldi (FEFO sırası) → ilki en yakın olandır.
      const own = byVariant.get(v.id) ?? [];
      const stockRows = availableByVariant.get(v.id) ?? [];
      const variantLabel = resolveLocalizedText(v.label);

      const physicalQty = stockRows.reduce((s, r) => s + r.physicalQty, 0);
      const reservedQty = stockRows.reduce((s, r) => s + r.reservedQty, 0);
      const availableQty = stockRows.reduce((s, r) => s + r.availableQty, 0);

      rows.push({
        variantId: v.id,
        productId: p.id,
        productName,
        variantLabel,
        title: titleOf(productName, variantLabel),
        // Görsel ÜRÜNÜN, boyun değil: aynı ürünün iki boyu aynı fotoğrafı paylaşır ve boy başına
        // ayrı görsel diye bir kavram yok (22.30).
        imageUrl: publicImageUrl(p.imageKey, p.imageUpdatedAt),
        categoryName: (p.categoryId && categoryNames.get(p.categoryId)) || '—',
        status: p.status,
        variantActive: v.isActive,
        physicalQty,
        reservedQty,
        availableQty,
        minStockQty: v.minStockQty,
        // Eşik yoksa "altında" da yoktur; 0 eşik "her zaman yeter" demektir, uyarı üretmez.
        //
        // ⚠ Eşik burada AĞ TOPLAMINA bakıyor ve bu bilinçli bir SINIRDIR: asgari stok eşiği aslında
        // depo bazlı bir gerçektir (`DOMAIN §17`, `warehouse_variant_threshold`) ve o kuyruk Satın
        // Alma'nın "sipariş zamanı" listesidir — burası bir tarama listesi, karar kuyruğu değil.
        belowMin: v.minStockQty !== null && v.minStockQty > 0 && availableQty < v.minStockQty,
        warehouses: splitsOf(stockRows, own, warehouseLabels, order),
        batches: own,
        nearest: own[0] ?? null,
        attentionCount: own.filter((b) => needsExpiryAttention(b.decision)).length,
      });
    }
  }
  return rows;
}

/**
 * Depo kırılımı — yalnız MALI OLAN depolar.
 *
 * `available_stock` her aktif depo için satır döndürür (yeni depoda parti olmasa da "0 da bir
 * cevaptır"), ama kırılımda her varyantın altına "KEHL: 0" yazmak listeyi okunmaz kılardı. Sıfır
 * satırın söyleyeceği şey zaten satırın kendisinde: toplam.
 */
function splitsOf(
  stockRows: readonly AvailableStock[],
  batches: readonly BatchView[],
  labels: Map<string, { code: string; name: string }>,
  order: Map<string, number>,
): StockWarehouseSplit[] {
  return stockRows
    .filter((r) => r.physicalQty > 0 || r.reservedQty > 0)
    .sort((a, b) => (order.get(a.warehouseId) ?? 0) - (order.get(b.warehouseId) ?? 0))
    .map((r) => {
      const label = labels.get(r.warehouseId);
      // Partiler FEFO sıralı geldiği için o deponun İLK partisi en yakın tarihlisidir.
      const nearest = batches.find((b) => b.warehouseId === r.warehouseId) ?? null;
      return {
        warehouseId: r.warehouseId,
        code: label?.code ?? '—',
        name: label?.name ?? 'Bilinmeyen depo',
        physicalQty: r.physicalQty,
        reservedQty: r.reservedQty,
        availableQty: r.availableQty,
        nearestExpiry: nearest?.expiryDate ?? null,
      };
    });
}
