import type { IntakeDifference, IntakeWarning, StorageMismatch } from '@lezzet/application';

/**
 * Mal kabulün YÜZEYDEN BAĞIMSIZ tipleri (22.26).
 *
 * Eskiden `operations/receiving/receiving-types.ts`teydi ve kaydeden kapı (`lib/warehouse`) oradan
 * import ediyordu — kütüphane katmanının bir sayfa klasörüne bağlanması, sayfa taşındığı gün kapıyı
 * da kırardı. Mal kabul artık Stok'un bir sekmesi; tip o yüzden yüzeyin değil işin yanında duruyor.
 */

/** Kabulün sonucu — uyarılar ve farklar ekrana taşınır, ikisi de İŞ DURDURMAZ (`DOMAIN §4`). */
export interface ReceiveOutcome {
  warnings: IntakeWarning[];
  /** Saklama rejimine uymayan alana konan partiler (19.29) — uyarır, engellemez. */
  storageMismatches: StorageMismatch[];
  differences: IntakeDifference[];
  /** Kaç parti yazıldı. */
  batches: number;
}
