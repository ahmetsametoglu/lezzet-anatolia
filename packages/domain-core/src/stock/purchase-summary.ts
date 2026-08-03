/**
 * Tedarik siparişi liste satırının ÖZETİ (09.14) — saf türetme, DB'siz.
 *
 * Okuma ham sayıları getirir (`PurchaseOrderRow`: kalemler + fiilen giren partiler); "kaç kalem
 * tamamlandı", "tutar ne", "hangi depoya ne kadar indi" kararları burada verilir. `bundle_list_rows`
 * emsalinin aynısı: fonksiyon toplar, motor yorumlar (`STACK §4`, §13).
 *
 * Ayrı durmasının pratik sebebi: bu üç sayı ekranın üç ayrı yerinde görünüyor (liste satırı, sipariş
 * detayı, tedarikçi kartı). Türetmeyi ekrana bıraksaydık üç kopya olurdu ve biri gün gelip
 * "tamamlandı"yı farklı tanımlardı.
 */

/** Motorun gördüğü asgari satır — DB karşılığı `PurchaseOrderRow`. */
export interface PurchaseOrderRowInput {
  items: ReadonlyArray<{
    qty: number;
    /**
     * Beklenen alış (**cent**); `null` ise tutar EKSİK kalır.
     *
     * Motor içinde para zaten cent'ti ama girdi euro geliyordu ve dönüşüm burada yapılıyordu —
     * yani sınır motorun İÇİNDEN geçiyordu. Artık okuma cent veriyor (02.9 · `STACK §8`): motor
     * tek birimle çalışır, çevrim yapmaz.
     */
    unitPriceCents: number | null;
    batches: ReadonlyArray<{
      initialQty: number;
      warehouse: { id: string; code: string } | null;
    }>;
  }>;
}

export interface WarehouseIntake {
  warehouseId: string;
  code: string;
  qty: number;
}

export interface PurchaseOrderSummary {
  itemCount: number;
  /**
   * Ismarlanan adedin TAMAMI gelmiş kalem sayısı — ekranın "8/12 kalem"i.
   *
   * Ölçüt `>=`, `===` değil: tedarikçi fazla göndermiş olabilir ve fazla gelen kalem eksik
   * sayılamaz. Fark ayrıca raporlanıyor (`receiveGoods.differences`), burada yalnız "bu kalemi
   * beklemeye devam ediyor muyuz" sorusu var.
   */
  receivedItemCount: number;
  /** Σ adet × birim fiyat — **cent** (`STACK §8`). Fiyatsız kalem hesaba 0 girer, bkz. aşağısı. */
  totalCents: number;
  /**
   * Fiyatı girilmemiş kalem sayısı. **Sıfırdan farklıysa `totalCents` EKSİKTİR** ve ekran bunu
   * söylemeli ("≈"). Eksik ölçümü tam gibi göstermek, bozuk sayıyı sağlıklı gibi okutmaktır
   * (`CLAUDE.md §1`).
   */
  missingPriceCount: number;
  /**
   * Malın FİİLEN indiği depolar ve adetleri — çoktan aza, eşitlikte koda göre (sıra kararlı olmalı,
   * yoksa aynı sipariş her yenilemede farklı sıralanır).
   *
   * Deposu okunamayan parti listeye girmez: uydurma bir depo adı yazmaktansa eksik bırakmak doğru —
   * ve bu satır zaten oluşmamalı (`stock.warehouse_id` not null).
   */
  byWarehouse: WarehouseIntake[];
}

export function summarizePurchaseOrder(row: PurchaseOrderRowInput): PurchaseOrderSummary {
  let receivedItemCount = 0;
  let totalCents = 0;
  let missingPriceCount = 0;
  const byWarehouse = new Map<string, WarehouseIntake>();

  for (const item of row.items) {
    if (item.unitPriceCents == null) missingPriceCount += 1;
    else totalCents += item.unitPriceCents * item.qty;

    let received = 0;
    for (const batch of item.batches) {
      received += batch.initialQty;
      if (!batch.warehouse) continue;
      const entry = byWarehouse.get(batch.warehouse.id);
      if (entry) entry.qty += batch.initialQty;
      else byWarehouse.set(batch.warehouse.id, { warehouseId: batch.warehouse.id, code: batch.warehouse.code, qty: batch.initialQty });
    }
    if (received >= item.qty) receivedItemCount += 1;
  }

  return {
    itemCount: row.items.length,
    receivedItemCount,
    totalCents,
    missingPriceCount,
    byWarehouse: [...byWarehouse.values()].sort((a, b) => b.qty - a.qty || a.code.localeCompare(b.code)),
  };
}
