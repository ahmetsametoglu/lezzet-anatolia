import { needsExpiryAttention } from '@lezzet/domain-core';
import {
  resolveLocalizedText,
  type AvailableStock,
  type DepotStockThreshold,
  type ProductStatus,
  type ProductStockRow,
} from '@lezzet/types';
import { thumbnailImageUrl } from '@lezzet/application';
import type { BatchView } from '@/lib/stock/batch-types';
import { titleOf } from '@/lib/catalog/title';

// Stok seviyesi satırı: stok ekranının listesi ve ürünler önizlemesinin stok bakışı aynı satırı okur. Kararlar `domain-core/stock`ta
// verilir, burada yalnız sorulur.

/**
 * Bir boyun tek depodaki gerçeği; satırın toplamı bu parçaların toplamıdır. "3 STR'de + 2 KEHL'de duran maldan 5 kişilik sipariş
 * çıkmaz" (`DOMAIN §17`): transfer ihtiyacı bu kırılımda görünür, kararı Transfer ekranında verilir.
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
 * Stok seviyesi satırı: satır boydur, adı ve tarih rejimi üründen gelir. Partiler satırla taşınır, çünkü zaten toplu okundu ve depoda
 * duran parti sayısı fiziksel olarak sınırlıdır; satırı açmak yeni tur istemez.
 */
export interface StockLevelRow {
  variantId: string;
  productId: string;
  productName: string;
  variantLabel: string;
  /** Listede görünen tam ad — "Fıstıklı Baklava · 1 kg". */
  title: string;
  /**
   * Ürünün küçük resmi; `null` = görsel yok, ekran yer tutucu çizer. Adres sunucuda kurulur (`R2_PUBLIC_BASE_URL` sunucu env'i) ve
   * `imageUpdatedAt` damgası taşır ki görsel değişince tarayıcı bayat kopyayı göstermesin.
   */
  imageUrl: string | null;
  categoryName: string;
  status: ProductStatus;
  /** Boy satışa kapalıysa stok yine görünür; ekran sebebi söyler. */
  variantActive: boolean;
  physicalQty: number;
  reservedQty: number;
  availableQty: number;
  /** Eşik (varsa) ve altına düşmüş mü — "sipariş zamanı" göstergesi; odak depo varsa o deponun eşiği ve stoğu. */
  minStockQty: number | null;
  belowMin: boolean;
  /** Odak deponun eşik kırılımı (varsayılan · istisna); `null` = bakış ağın tamamı, depo eşiği düzenlenmez. */
  depotThreshold: (DepotStockThreshold & { warehouseId: string }) | null;
  /**
   * Malı olan depolar, operatörün seçici sırasıyla; boş, tek ve çok elemanlı hâller aynı diziden okunur. Ayrı bir "kaç depoda" alanı
   * listeden sapabilecek ikinci bir gerçek olurdu.
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
   * `available_stock` satırları, (depo, varyant) taneli; toplam da kırılım da bundan türer. Toplam depo üstü görünümden gelseydi
   * (`available_stock_total`) kırılımın toplamıyla ayrışabilirdi.
   */
  available: readonly AvailableStock[];
  categoryNames: Map<string, string>;
  /** Kimlik → ad/kod; SIRASI operatörün seçici sırasıdır ve kırılım o sırayla çizilir. */
  warehouseLabels: Map<string, { id: string; code: string; name: string }>;
  /** Bakış tek depoya indiyse o deponun etkin eşikleri (`WarehouseVariantThresholdService.resolve`). */
  depot?: { warehouseId: string; thresholds: ReadonlyMap<string, DepotStockThreshold> } | null;
}

/**
 * Ürün sayfasını, partileri ve kullanılabilirliği seviye satırlarına indirger; depo satıra değil satırın içine iner, çünkü varyant×depo
 * düz listesi aynı ürünü üç kez gösterirdi. Stoğu olmayan boy da listede kalır, yoksa operatör ürünün hiç girilmediğini fark edemezdi.
 */
export function toLevelRows({ products, batches, available, categoryNames, warehouseLabels, depot }: StockLevelInput): StockLevelRow[] {
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
      // Odak depo varken stok okuması da yalnız o depodandır, eşik onunla karşılaştırılır.
      const threshold = depot ? (depot.thresholds.get(v.id) ?? null) : null;
      const minStockQty = depot ? (threshold?.minStockQty ?? null) : v.minStockQty;

      rows.push({
        variantId: v.id,
        productId: p.id,
        productName,
        variantLabel,
        title: titleOf(productName, variantLabel),
        // Görsel ürünündür: aynı ürünün boyları aynı fotoğrafı paylaşır.
        imageUrl: thumbnailImageUrl(p),
        categoryName: (p.categoryId && categoryNames.get(p.categoryId)) || '—',
        status: p.status,
        variantActive: v.isActive,
        physicalQty,
        reservedQty,
        availableQty,
        minStockQty,
        // Eşik yoksa "altında" da yoktur; 0 eşik "her zaman yeter" demektir, uyarı üretmez. Odak depo yoksa eşik ağ toplamına
        // bakar: bu bir tarama listesidir, depo bazlı karar kuyruğu Tedarik'in "sipariş zamanı" listesidir.
        belowMin: minStockQty !== null && minStockQty > 0 && availableQty < minStockQty,
        depotThreshold: depot && threshold ? { warehouseId: depot.warehouseId, ...threshold } : null,
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
 * Depo kırılımı yalnız malı olan depoları taşır; `available_stock` her aktif depoya satır döndürür, ama her boyun altına "KEHL: 0"
 * yazmak listeyi okunmaz kılardı.
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
