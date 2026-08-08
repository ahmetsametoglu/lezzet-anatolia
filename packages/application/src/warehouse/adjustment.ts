import { StockAdjustmentService, StockService } from '@lezzet/database';
import { documentPrefixFor } from '@lezzet/domain-core';
import type { AdjustBatchResult, StockAdjustmentReason } from '@lezzet/types';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * **İmha / sayım — D4** (10.5), terfi 21.11. Kaynağı `apps/web/lib/stock/adjustment.ts`;
 * `design/pages/depo-imha-sayim.md` + `design/BACKLOG.md §1c` + DOMAIN §4 + mobil v2 "Sayım /
 * Düzeltme" ekranı bağlayıcı.
 *
 * Kapının eklediği ÜÇ şey var; üçü de kural, üçü de yapısal:
 *
 * 1. **OLAY belgesi.** Bir imhada üç parti çöpe gidebilir; üçü tek numarayı paylaşır ve o numara
 *    kâğıt tutanakla eşleşir (v2: *"OLAY REFERANSI … kâğıt tutanakla eşleşir"*). Öneki motor seçer
 *    (sınıflandırma), numarayı DB üretir (atomiklik).
 *
 * 2. **Depocuya restok seçeneği SUNULMAZ.** Teslim sonrası geri gelen malın stoğa iadesi bir admin
 *    istisnasıdır (DOMAIN §4/§8): soğuk zincir belgelenemediği için varsayılan imhadır. Kural bir
 *    arayüz disiplini olarak bırakılsaydı er geç bir ekranda o seçenek belirirdi — burada TİPTE
 *    duruyor (v2: *"'İade stoğa döndü' depocuya açılmaz — yönetim istisnasıdır"*).
 *
 * 3. **Parti BAŞKA DEPONUNSA yazım yapılmaz** (21.11 · CLAUDE.md §1). Web kopyasında bu soru hiç
 *    sorulmuyordu, çünkü ekranın guard'ı zaten kapıda duruyordu. Mobil depocunun kapısında o guard
 *    "hangi depo" sorusunu cevaplamıyor: `stockId` bir kimliktir ve başka şehrin partisini
 *    gösterebilir. Kapı kimliği ister, kapsam dışını GÖRÜNÜR retle döner.
 */

/** Depocunun seçebileceği sebepler — `return_restock` YOK (admin istisnası). */
export type WarehouseReason = Exclude<StockAdjustmentReason, 'return_restock'>;

export interface AdjustmentLine {
  stockId: string;
  /** + stoktan düşüm (imha/fire/kayıp), − stoğa geri ekleme (yalnız sayım FAZLASI). */
  qty: number;
}

export type AdjustmentOutcome =
  | { status: 'ok'; result: AdjustBatchResult }
  /** Tek satır bile yazılmadı — sebep operatöre aynen gösterilir (partide o kadar mal yok gibi). */
  | { status: 'failed'; message: string }
  /**
   * Satırlardan biri (ya da birkaçı) BAŞKA deponun partisi — hiçbiri yazılmadı. Hangi parti olduğu
   * dönüyor: "kapsam dışı" tek başına ekranda çözülemeyen bir cümledir, operatör hangi satırı
   * sileceğini bilmeli.
   */
  | { status: 'forbidden'; reason: 'out_of_scope'; stockIds: string[] }
  /** Verilen kimlikte parti yok — "başka deponun" ile aynı şey DEĞİL, teşhisi de farklı. */
  | { status: 'not_found'; stockIds: string[] }
  | { status: 'empty' };

/**
 * **İmha / sayım kaydı.** Bütün satırlar tek transaction'da yazılır ve tek belge numarasını
 * paylaşır; bir satır düşerse HİÇBİRİ yazılmaz — yarım tutanak, hiç tutanak olmamasından kötüdür
 * (kâğıtla eşleşmez ve stok da yarı düşmüş kalır).
 *
 * Stoğa geri ekleme (negatif adet) yalnız **sayım fazlasında** meşrudur ve sebep notu ZORUNLUDUR;
 * kuralı veritabanı zorlar (0010/0033) — burada tekrarlanmaz (v2: *"Geri eklemede sebep notu
 * zorunlu — sistem zorlar"*).
 *
 * @param db service-role istemci — çağıran enjekte eder (`serviceDb()`), `auth/otp` deseni.
 */
export async function recordAdjustment(
  db: SupabaseClient,
  input: {
    /** Depocunun çalıştığı depo — satırların hepsi buranın partisi olmalı (CLAUDE.md §1). */
    warehouseId: string;
    lines: readonly AdjustmentLine[];
    reason: WarehouseReason;
    note?: string | null;
    actorId?: string | null;
  },
): Promise<AdjustmentOutcome> {
  if (input.lines.length === 0) return { status: 'empty' };

  const stockIds = [...new Set(input.lines.map((line) => line.stockId))];
  const batches = await new StockService(db).listByIds(stockIds);
  const warehouseOf = new Map(batches.map((batch) => [batch.id, batch.warehouseId]));

  const missing = stockIds.filter((id) => !warehouseOf.has(id));
  if (missing.length > 0) return { status: 'not_found', stockIds: missing };

  const foreign = stockIds.filter((id) => warehouseOf.get(id) !== input.warehouseId);
  if (foreign.length > 0) return { status: 'forbidden', reason: 'out_of_scope', stockIds: foreign };

  try {
    const result = await new StockAdjustmentService(db).adjustBatch({
      lines: input.lines,
      reason: input.reason,
      prefix: documentPrefixFor(input.reason),
      note: input.note,
      createdBy: input.actorId,
    });
    return { status: 'ok', result };
  } catch (error) {
    // Fiziksel gerçeğin ihlali bir hata DEĞİL, operatöre söylenecek bir cevaptır ("partide 3 adet
    // var, 5 düşülemez"). Fırlatıp ekranı çökertmek yerine mesajı taşıyoruz (STACK §8).
    return { status: 'failed', message: error instanceof Error ? error.message : 'Kayıt yazılamadı' };
  }
}
