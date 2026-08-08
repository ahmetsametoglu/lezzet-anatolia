import type { StockAdjustmentReason } from '@lezzet/types';

// Stoktan düşme masasının görünüm modeli (10.5).
// Tasarım: `design/project/Operasyon - Depo Imha Sayim.dc.html` (*"· web"*).
//
// **Maliyet/tutar bu yüzeyde YOKTUR** — tasarımın kendi başlığı. Fire'ın parasal değeri
// yöneticinin Stok ekranında yaşıyor; depocu adet düşer, paraya çevirmek admin raporlarının işi.

/** Seçilebilir parti — ürün adı, son tarih ve eldeki adet. Alış fiyatı taşımıyor. */
export interface BatchOption {
  stockId: string;
  title: string;
  expiryDate: string;
  /** Eldeki fiziksel adet — "partide 3 var, 5 düşülemez" cevabını ekran önceden söyleyebilsin. */
  physicalQty: number;
  /** Son tarihi geçmiş mi — tasarımın "geçti" rozeti. */
  isExpired: boolean;
}

/** Bugün girilmiş bir düşüm — sağdaki "bugünün kayıtları" şeridi. */
export interface TodayEntry {
  id: string;
  title: string;
  /** Düşülen adet (pozitif sayı olarak yazılır; ekranda başına eksi konur). */
  qty: number;
  /**
   * **Okuma tipi YAZMA tipinden geniş** ve bu bilinçli: depocu `return_restock` GİREMEZ
   * (`WarehouseReason` onu dışlıyor) ama adminin girdiği bir geri-alma kaydı aynı günün
   * defterinde görünebilir. Dar tip seçseydik o satır okunduğu an ekran doğrulamada düşerdi.
   */
  reason: StockAdjustmentReason;
  /** Belge numarası — denetmenin elindeki kâğıdın karşılığı (`IMH-26-0012`). */
  referenceNo: string | null;
  /** Saat "09:40" — gün içinde hangi sırayla girildiği. */
  time: string;
}

export interface AdjustmentsData {
  batches: BatchOption[];
  today: TodayEntry[];
  /**
   * Şerit kırpıldı mı — tavan doldu ve daha eski kayıtlar var.
   *
   * Sessiz kırpma, olmayan bir tamlık sözü vermek olurdu: operatör listeyi "bugünün tamamı" sanır
   * ve girdiği bir kaydı göremeyince ikinci kez girerdi.
   */
  todayTruncated: boolean;
  warehouseName: string | null;
  warehouseId: string | null;
}
