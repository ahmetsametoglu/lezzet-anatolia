import type { WarehouseReason } from '@/lib/stock/adjustment';

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
  reason: WarehouseReason;
  /** Belge numarası — denetmenin elindeki kâğıdın karşılığı (`IMH-26-0012`). */
  referenceNo: string | null;
  /** Saat "09:40" — gün içinde hangi sırayla girildiği. */
  time: string;
}

export interface AdjustmentsData {
  batches: BatchOption[];
  today: TodayEntry[];
  warehouseName: string | null;
  warehouseId: string | null;
}
