import 'server-only';
import { StockAdjustmentService, serviceDb } from '@lezzet/database';
import { documentPrefixFor } from '@lezzet/domain-core';
import type { AdjustBatchResult, StockAdjustment, StockAdjustmentReason } from '@lezzet/types';

/**
 * İmha / sayım kapısı (10.5) — **uygulama katmanı orkestrasyonu**.
 * `design/pages/depo-imha-sayim.md` + `design/BACKLOG.md §1c` + DOMAIN §4.
 *
 * Kapının eklediği iki şey var; ikisi de kural, ikisi de yapısal:
 *
 * 1. **OLAY belgesi.** Bir imhada üç parti çöpe gidebilir; üçü tek numarayı paylaşır ve o numara
 *    kâğıt tutanakla eşleşir. Öneki motor seçer (sınıflandırma), numarayı DB üretir (atomiklik).
 *
 * 2. **Depocuya restok seçeneği SUNULMAZ.** Teslim sonrası geri gelen malın stoğa iadesi bir admin
 *    istisnasıdır (DOMAIN §4/§8): soğuk zincir belgelenemediği için varsayılan imhadır. Kural bir
 *    arayüz disiplini olarak bırakılsaydı er geç bir ekranda o seçenek belirirdi — burada TİPTE
 *    duruyor: depo kapısı `return_restock` sebebini kabul etmez, ayrı bir kapıdan geçer.
 */

/** Depocunun seçebileceği sebepler — `return_restock` YOK (admin istisnası). */
export type WarehouseReason = Exclude<StockAdjustmentReason, 'return_restock'>;

export interface AdjustmentLine {
  stockId: string;
  /** + stoktan düşüm (imha/fire/kayıp), − stoğa geri ekleme (yalnız sayım FAZLASI). */
  qty: number;
}

type AdjustmentOutcome =
  | { status: 'ok'; result: AdjustBatchResult }
  /** Tek satır bile yazılmadı — sebep operatöre aynen gösterilir (partide o kadar mal yok gibi). */
  | { status: 'failed'; message: string }
  | { status: 'empty' };

/**
 * **İmha / sayım kaydı.** Bütün satırlar tek transaction'da yazılır ve tek belge numarasını
 * paylaşır; bir satır düşerse HİÇBİRİ yazılmaz — yarım tutanak, hiç tutanak olmamasından kötüdür
 * (kâğıtla eşleşmez ve stok da yarı düşmüş kalır).
 *
 * Stoğa geri ekleme (negatif adet) yalnız **sayım fazlasında** meşrudur ve sebep notu ZORUNLUDUR;
 * kuralı veritabanı zorlar (0010/0033) — burada tekrarlanmaz.
 */
export async function recordAdjustment(input: {
  lines: readonly AdjustmentLine[];
  reason: WarehouseReason;
  note?: string | null;
  actorId?: string | null;
}): Promise<AdjustmentOutcome> {
  if (input.lines.length === 0) return { status: 'empty' };

  try {
    const result = await new StockAdjustmentService(serviceDb()).adjustBatch({
      lines: input.lines,
      reason: input.reason,
      prefix: documentPrefixFor(input.reason),
      note: input.note,
      createdBy: input.actorId,
    });
    return { status: 'ok', result };
  } catch (error) {
    // Fiziksel gerçeğin ihlali bir hata DEĞİL, operatöre söylenecek bir cevaptır ("partide 3 adet
    // var, 5 düşülemez"). Fırlatıp sayfayı çökertmek yerine mesajı taşıyoruz (STACK §8).
    return { status: 'failed', message: error instanceof Error ? error.message : 'Kayıt yazılamadı' };
  }
}

/** Bir belgenin bütün satırları — denetmenin elindeki kâğıdın ekrandaki karşılığı. */
export function findByDocument(referenceNo: string): Promise<StockAdjustment[]> {
  return new StockAdjustmentService(serviceDb()).listByReference(referenceNo);
}
