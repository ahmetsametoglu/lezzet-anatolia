// Sıcaklık kaydının görünüm modeli (10.6).
//
// Bu dosya eskiden stoktan düşme masasının tip evi de olduğu için beş tip taşıyordu; düşüm Stok
// ekranına taşınınca (22.26) geriye yalnız ölçüm noktası kaldı.

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

/**
 * Ekranın notları — girişin neden kısa olması gerektiği ve nokta kümesinin SINIRI.
 *
 * Sınır GÖRÜNÜR yazılıyor: küme geçmiş kayıtlardan türüyor, yani hiç ölçülmemiş bir dolap listede
 * yoktur ve operatör onu "yok" değil "henüz yazılmamış" diye okumalı.
 */
export const TEMPERATURE_NOTES = {
  hint: 'Nokta seçin, dereceyi yazın. Sıra dışı değer uyarır ama kaydı engellemez.',
  newPoint: 'Listede olmayan bir nokta adını yazabilirsiniz — ilk kayıttan sonra listeye girer.',
} as const;
