import type { StockAdjustmentReason } from '@lezzet/types';

/**
 * İmha/sayım OLAY belgesi (10.5) — `IMH-26-0012`, `SAY-26-0043`. **Saf karar**, I/O yok.
 *
 * Burada yaşayan tek şey **sınıflandırmadır**: hangi sebep hangi belgeye düşer. Numaranın kendisi
 * (sıra, benzersizlik, atomiklik) veritabanının işidir (`next_document_no`) — motor onu garanti
 * edemez, iki eşzamanlı imha aynı sayıyı üretirdi.
 *
 * **Belge OLAY başınadır, satır başına değil:** bir imhada üç parti çöpe gidebilir; üçüne üç numara
 * vermek, eşleştirilmek istenen kâğıdı üçe bölerdi (`design/BACKLOG.md §1c`).
 */

/** Belge türü — kâğıtta ve tedarikçi yazışmasında okunan önek. */
export type AdjustmentDocumentPrefix = 'IMH' | 'SAY' | 'IAD';

/**
 * Sebep hangi belgeye düşer.
 *
 * Üç grup üç ayrı kâğıttır ve karıştırılmaz: **imha tutanağı** (mal çöpe gitti — denetimin konusu),
 * **sayım tutanağı** (fiziksel sayım farkı, iki yönlü olabilir) ve **iade girişi** (mal geri geldi,
 * stoğa döndü). Sayım farkını imha tutanağına yazmak, hiç imha edilmemiş malı imha edilmiş
 * göstermek olurdu.
 */
export function documentPrefixFor(reason: StockAdjustmentReason): AdjustmentDocumentPrefix {
  if (reason === 'count_diff') return 'SAY';
  if (reason === 'return_restock') return 'IAD';
  return 'IMH';
}

/**
 * Biçim doğrulaması — elle girilen numaranın (denetmenin okuduğu kâğıt) şekli doğru mu.
 *
 * Önek artık DEPO KODU taşır (`IMH-STR-26-0012`, DOMAIN §17): kâğıt klasör fiziksel olarak o
 * depoda durur ve seriler depo başına ayrışır. Kodu SQL ekliyor (`adjust_stock_batch`) ama
 * doğrulama burada kalmak zorunda — biçimin ne olduğunu bilen tek yer motordur.
 *
 * Depo segmenti İSTEĞE BAĞLI kalıyor: tek depolu dünyada üretilmiş eski numaralar (`IMH-26-0007`)
 * hâlâ geçerli kâğıtlardır ve denetmen onları da yazabilir.
 */
export function isValidDocumentNo(value: string): boolean {
  return /^(IMH|SAY|IAD)(-[A-Z0-9]+)?-\d{2}-\d{4,}$/.test(value);
}
