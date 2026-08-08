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

/**
 * Ölçüm noktası ve BUGÜNKÜ hâli (10.6).
 *
 * `temperatureC: null` = **bugün ölçülmedi** — sıfır değil. Ölçülmeyen bir noktayı "0 °C" diye
 * göstermek, bozuk ölçümü sağlıklı gibi okutmanın ders kitabı örneği olurdu (`CLAUDE §1`).
 * Ekran bu `null`'u amber "henüz ölçülmedi" olarak çiziyor — tasarımın kuralı.
 */
export interface TemperaturePoint {
  /** Dolap adı / araç plakası — depo içi konum. */
  name: string;
  /** Günün SON ölçümü (°C); bugün ölçülmediyse `null`. */
  temperatureC: number | null;
  /** Son ölçümün anı (ISO); ölçülmediyse `null`. */
  recordedAt: string | null;
  /**
   * Bu noktanın ALIŞKANLIĞI (°C) — geçmiş ölçümlerinin ortancası. `null` = yeterli geçmiş yok,
   * yani "sıra dışı mı" sorusuna cevap veremiyoruz. Sıfır değil, bilinmiyor.
   */
  usualC: number | null;
  /** Alışkanlığından toleransı aşacak kadar sapmış mı — bir UYARIDIR, kayıt zaten yazılmıştır. */
  outOfRange: boolean;
}

export interface AdjustmentsData {
  batches: BatchOption[];
  today: TodayEntry[];
  /** Ölçüm noktaları + bugünkü durumları. Boş dizi = bu depoda hiç sıcaklık kaydı geçmemiş. */
  points: TemperaturePoint[];
  /**
   * Günün kayıt TARAMASI kesildi mi — tavan doldu.
   *
   * Sessiz kırpma, olmayan bir tamlık sözü vermek olurdu: operatör listeyi "bugünün tamamı" sanır
   * ve girdiği bir kaydı göremeyince ikinci kez girerdi.
   *
   * **"Daha fazlası var" demiyor, "tarama kesildi" diyor** (10.7): depo süzgeci sorguda değil
   * bellekte (gerekçe `adjustments-read.ts`'te), yani kesilen kısımda bu depoya ait kayıt olabilir
   * de olmayabilir de. Bilmediğimiz şeyi biliyormuş gibi yazmak, yanlış bir güven verirdi.
   */
  todayTruncated: boolean;
  /** Çalışılan depo — 10.7'den beri DAİMA dolu; depo seçilmemişken sayfa bu veriyi hiç kurmaz. */
  warehouseName: string;
  warehouseId: string;
}
