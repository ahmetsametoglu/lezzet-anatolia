import type { SupabaseClient } from '@supabase/supabase-js';
import type { PurchaseOrder, PurchaseOrderItem } from '@lezzet/types';
import { PurchaseOrderService, type DraftLine } from './purchase-order.service';
import { StockService } from './stock.service';
import { SupplierProductService } from './supplier.service';

/** Eşiğin altına düşmüş bir varyant — önerilen sipariş miktarıyla. */
export interface ReorderLine {
  variantId: string;
  availableQty: number;
  minStockQty: number;
  /** Eşiğe çıkarmak için gereken adet — öneridir, admin değiştirebilir. */
  suggestedQty: number;
  supplierCode: string | null;
  lastPurchasePrice: number | null;
  /**
   * **Yolda**: GÖNDERİLMİŞ siparişlerden bu depoya bekleyen adet (`sent` + `partially_received`).
   * Eşik karşılaştırmasına GİRER — mal yolda ise raf yakında dolacaktır.
   */
  incomingQty: number;
  /**
   * **Taslakta**: henüz gönderilmemiş siparişlerdeki adet.
   *
   * `incomingQty` ile TOPLANMAZ ve eşiğe girmez: gönderilmiş sipariş bir bekleyiştir, taslak yalnız
   * bizim kararımızdır ve tedarikçi ondan habersizdir. İkisini toplamak, açıp göndermeyi
   * unuttuğumuz bir taslağın eksiği "kapatmış" görünmesi olurdu — sessizce boş raf.
   */
  draftQty: number;
  /**
   * Hedef deposu YAZILMAMIŞ açık siparişlerdeki adet — hiçbir depoya sayılmaz, ama görünür kalır.
   *
   * `target_warehouse_id` bir niyet beyanıdır, kısıt değil (C7): mal fiilen nereye indiyse oraya
   * girer. Hedefsiz kalemi bakılan depoya saymak, malın oraya geleceğini VARSAYMAK olurdu ve K6
   * tam bunu yasaklıyor — yanlış varsayım "eksik kapandı" der, raf boş kalır ve kimse sebebini
   * aramaz. Ölçemediğimizi sıfır saymıyoruz; ayrı sayıp operatöre gösteriyoruz (`CLAUDE.md §1`).
   */
  unassignedQty: number;
}

/** Tedarikçiye göre gruplanmış öneri — liste tek dokunuşla PO taslağına dönsün diye. */
export interface ReorderGroup {
  supplierId: string | null;
  /**
   * Önerinin ÇIKTIĞI depo (C6) — taslağa hedef olarak yazılır.
   *
   * Bunu taşımak zorunlu: hedefsiz açılan sipariş hiçbir deponun eksiğini kapatmaz (yukarı bak) ve
   * öneriden açılan siparişler hedefsiz kalsaydı, "yolda" hesabı tam da onu doğuran akışta
   * çalışmazdı — düzeltme kâğıt üstünde kalırdı.
   */
  warehouseId: string;
  lines: ReorderLine[];
}

/**
 * "Sipariş zamanı" önerisi (06.11) — DOMAIN §16 Faz 1 (eşik). Kullanılabilir stoğu `min_stock_qty`
 * altına düşen varyantlar tedarikçiye göre gruplanır; **otomatik sipariş yoktur**, karar admin'in.
 *
 * Tedarikçisi eşlenmemiş varyantlar da listelenir (`supplierId: null`) — görünmez olmaları
 * "eksik ürün fark edilmedi" demektir; eksik olan eşlemedir, ürünün kendisi değil.
 *
 * Faz 2 (satış hızı + tedarik süresi + sezon ile "şu tarihte biter" tahmini) AI içgörü ailesine ait.
 */
export class ReorderService {
  private readonly stocks: StockService;
  private readonly mappings: SupplierProductService;
  private readonly orders: PurchaseOrderService;

  constructor(supabase: SupabaseClient) {
    this.stocks = new StockService(supabase);
    this.mappings = new SupplierProductService(supabase);
    this.orders = new PurchaseOrderService(supabase);
  }

  /**
   * BİR DEPODA eşik altına inen varyantlar, tercihli tedarikçilerine göre gruplu.
   *
   * Öneri depo başınadır (C6) ve bu isteğe bağlı bir ayrıntı değil: eşiğin kendisi depo bazlı
   * (varyanttaki değer varsayılan, depo satırı istisna). Depo-üstü tek bir öneri listesi "toplamda
   * 40 var" deyip Kehl'in boş rafını gizlerdi — sipariş de o rafı doldurmak için verilecek.
   */
  async suggestions(warehouseId: string): Promise<ReorderGroup[]> {
    const below = await this.stocks.listBelowMinStock(warehouseId);
    if (below.length === 0) return [];

    // ── YOLDAKİ MAL DA ELDEDİR (09.14 üçüncü talep · kullanıcı bulgusu) ────────
    // Eski hâl yalnız `availableQty < minStockQty`'ye bakıyordu. Sipariş vermek stoğu değiştirmez
    // (mal gelmedi, raf boş), dolayısıyla satır yerinde kalıyordu — davranış tanıma göre doğru ama
    // operasyonel sonucu arıza: aynı tedarikçiye üst üste basmak ikinci, üçüncü siparişi açıyor ve
    // hiçbir yerde uyarı yok. Bedeli para ve raf; soğuk zincirde fazla malın raf ömrü de risk.
    const pending = await this.orders.openProgress();
    const incoming = sumByVariant(pending, (row) => row.status !== 'draft' && row.targetWarehouseId === warehouseId);
    const drafts = sumByVariant(pending, (row) => row.status === 'draft' && row.targetWarehouseId === warehouseId);
    const unassigned = sumByVariant(pending, (row) => row.targetWarehouseId === null);

    const mappings = await this.mappings.listByVariants(below.map((row) => row.variantId));
    // Bir varyantın birden çok kaynağı olabilir: tercihli olan kazanır, yoksa ilk eşleme.
    const chosen = new Map<string, (typeof mappings)[number]>();
    for (const mapping of mappings) {
      const current = chosen.get(mapping.variantId);
      if (!current || (mapping.isPreferred && !current.isPreferred)) chosen.set(mapping.variantId, mapping);
    }

    const groups = new Map<string | null, ReorderGroup>();
    for (const row of below) {
      const incomingQty = incoming.get(row.variantId) ?? 0;
      // Yoldaki mal eksiği KAPATIYORSA satır düşer. Süzgeç burada, SQL'de değil: `listBelowMinStock`
      // aday kümesini veriyor (`available < min`) ve yolda olanı eklemek o kümeyi yalnız KÜÇÜLTÜR —
      // eşiğin üstündeki bir varyant zaten aday değildi.
      if (row.availableQty + incomingQty >= row.minStockQty) continue;

      const mapping = chosen.get(row.variantId) ?? null;
      const supplierId = mapping?.supplierId ?? null;
      const group = groups.get(supplierId) ?? { supplierId, warehouseId, lines: [] };
      group.lines.push({
        variantId: row.variantId,
        availableQty: row.availableQty,
        minStockQty: row.minStockQty,
        // Eşiğe çıkaracak kadar — YOLDAKİ düşülerek; koli içi adet biliniyorsa yukarı yuvarlanır
        // (koli bölünmez). Yoldakini düşmemek, gelen malın üstüne bir kez daha sipariş vermekti.
        suggestedQty: roundToPack(row.minStockQty - row.availableQty - incomingQty, mapping?.packQty ?? null),
        supplierCode: mapping?.supplierCode ?? null,
        lastPurchasePrice: mapping?.lastPurchasePrice ?? null,
        incomingQty,
        draftQty: drafts.get(row.variantId) ?? 0,
        unassignedQty: unassigned.get(row.variantId) ?? 0,
      });
      groups.set(supplierId, group);
    }
    return [...groups.values()];
  }

  /**
   * Bir öneri grubundan taslak PO üretir — "tek dokunuş". Tedarikçisi olmayan grup sipariş edilemez:
   * kime yazılacağı belli değildir, sessizce boş tedarikçiyle kayıt açmak yerine açıkça reddedilir.
   */
  async createDraftFrom(group: ReorderGroup, note?: string): Promise<{ order: PurchaseOrder; items: PurchaseOrderItem[] }> {
    if (!group.supplierId) throw new Error('reorder: tedarikçisi eşlenmemiş kalemlerden sipariş açılamaz');

    const lines: DraftLine[] = group.lines.map((line) => ({
      variantId: line.variantId,
      qty: line.suggestedQty,
      unitPrice: line.lastPurchasePrice,
      // HEDEF DEPO YAZILIR (09.14 üçüncü talep): öneri depo başınadır, yani niyet zaten belli.
      // Yazmamak, bir sonraki turda "bu mal hangi deponun eksiğini kapatıyor" sorusunu
      // cevapsız bırakırdı ve `incomingQty` tam da bu akışta hep 0 kalırdı — düzeltme kâğıt
      // üstünde kalır, operatör yine ikinci siparişi açardı.
      targetWarehouseId: group.warehouseId,
    }));
    return this.orders.createDraft(group.supplierId, lines, note);
  }
}

/** Varyant başına bekleyen adet toplamı — süzgeci çağıran verir (yolda / taslak / hedefsiz). */
function sumByVariant<T extends { variantId: string; missingQty: number }>(
  rows: readonly T[],
  keep: (row: T) => boolean,
): Map<string, number> {
  const total = new Map<string, number>();
  for (const row of rows) {
    if (!keep(row)) continue;
    total.set(row.variantId, (total.get(row.variantId) ?? 0) + row.missingQty);
  }
  return total;
}

/** Koli içi adet biliniyorsa üste yuvarlar (yarım koli sipariş edilmez); en az 1. */
function roundToPack(qty: number, packQty: number | null): number {
  const needed = Math.max(1, qty);
  if (!packQty || packQty <= 1) return needed;
  return Math.ceil(needed / packQty) * packQty;
}
