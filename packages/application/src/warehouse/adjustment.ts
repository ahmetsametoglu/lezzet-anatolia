import { StockMovementService, StockService } from '@lezzet/database';
import { documentPrefixFor, remainingShelfLifePercent } from '@lezzet/domain-core';
import type { AdjustBatchResult, StockDirection, StockMovementKind, StockWriteOffReason } from '@lezzet/types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { displayName, variantNames } from './names';
import { rpcRejectionMessage } from './rpc-error';

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

/**
 * Depocunun seçebileceği sebepler — `return_restock` YOK (admin istisnası).
 *
 * **Tek liste, iki seviye** (06.14): veride imha bir hareket TİPİ (`write_off`) ve DLC/hasar/kayıp
 * onun SEBEBİ; sayım farkı ayrı bir tip. Depocu ise tek bir listeden seçer — tip-sebep ayrımı onun
 * sorunu değil. Çeviriyi bu kapı yapıyor (`kindOf`/`reasonOf`), ekran değil.
 */
export type WarehouseReason = StockWriteOffReason | 'count_diff';

/** Depocunun seçimi → defterin hareket tipi. */
function kindOf(reason: WarehouseReason): Extract<StockMovementKind, 'write_off' | 'count_diff'> {
  return reason === 'count_diff' ? 'count_diff' : 'write_off';
}

/** Depocunun seçimi → imhanın sebebi. Sayım farkının sebebi YOKTUR (kısıt da öyle diyor). */
function reasonOf(reason: WarehouseReason): StockWriteOffReason | null {
  return reason === 'count_diff' ? null : reason;
}

export interface AdjustmentLine {
  stockId: string;
  /** DAİMA pozitif — yön ayrı alanda (06.14). */
  qty: number;
  /** `out` = stoktan düş, `in` = stoğa ekle (yalnız sayım FAZLASI). */
  direction: StockDirection;
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
 * Stoğa geri ekleme (`direction: 'in'`) yalnız **sayım fazlasında** meşrudur ve sebep notu
 * ZORUNLUDUR; kuralı veritabanı zorlar (`adjust_stock_batch`) — burada tekrarlanmaz (v2: *"Geri
 * eklemede sebep notu zorunlu — sistem zorlar"*).
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
    const kind = kindOf(input.reason);
    const result = await new StockMovementService(db).adjustBatch({
      lines: input.lines,
      kind,
      // Önek TİPTEN seçilir, sebepten değil: DLC/hasar/kayıp üçü de aynı imha tutanağına yazılır.
      prefix: documentPrefixFor(kind),
      reason: reasonOf(input.reason),
      note: input.note,
      createdBy: input.actorId,
    });
    return { status: 'ok', result };
  } catch (error) {
    // Fiziksel gerçeğin ihlali bir hata DEĞİL, operatöre söylenecek bir cevaptır ("partide 3 adet
    // var, 5 düşülemez"). Fırlatıp ekranı çökertmek yerine mesajı taşıyoruz (STACK §8).
    // Çıkarım `rpcRejectionMessage`in işi: supabase-js reddi `Error` ÖRNEĞİ DEĞİL (ölçüldü) ve
    // örnek denetimiyle bakan eski süzgeç gerçek cümleyi atıyordu — gerekçe o dosyanın künyesinde.
    return { status: 'failed', message: rpcRejectionMessage(error, 'Kayıt yazılamadı') };
  }
}

/** Rafta okunan etiketin çözümü — sayımın KONUSU. **Para YOK**: partinin alışı depo yolundan geçmez. */
export interface ResolvedBatch {
  stockId: string;
  variantId: string;
  /** "Ürün (boy)" — operasyon dilinde; ekranın üstbaşlığı. */
  name: string;
  /** Eşleşmenin kurulduğu lot; bu yüzden daima dolu. */
  lotNumber: string;
  expiryDate: string;
  physicalQty: number;
  /** Partinin alanının ADI ("Derin dondurucu 2"); rafı seçilmemiş partide `null` (19.29). */
  storageAreaName: string | null;
  /** Kalan raf ömrü yüzdesi; **`null` = ölçülemedi** (ürünün toplam ömrü girilmemiş), sıfır DEĞİL. */
  lifePercent: number | null;
}

export type ResolveBatchOutcome = { status: 'found'; batches: ResolvedBatch[] } | { status: 'unknown' };

/**
 * **RAFTAKİ ETİKETİ OKUT** — D4'ün ikinci çıkış yolu (v3 · 08), 30.08'de açıldı.
 *
 * ── NEDEN `resolveScannedCode` DEĞİL ────────────────────────────────────────
 * O kapı bir kodu VARYANTA çevirir ("bu hangi mal") ve künyesi stok okumasını bilerek dışarıda
 * bırakıyor. Sayımın sorusu başkadır: düzeltme daima bir PARTİYE yazılır ve aynı varyantın aynı
 * depoda birden çok partisi olabilir — varyant cevabı, "hangi partiden düşeyim" sorusunu
 * cevapsız bırakırdı. İki soru tek kapıya yüklenseydi cevabın tipi ikiye ayrılır ve çağıranların
 * yarısı ötekinin dalını hiç kullanmazdı.
 *
 * ── PARTİ KODU = `stock.lot_number`, VE BU ÖLÇÜLDÜ ──────────────────────────
 * Veride sistemin ürettiği bir parti kodu YOK (`stock` tablosunda böyle bir kolon yok; kendi lot
 * etiketimizi basmak bilinçli olarak ertelendi — 23 §3). Rafta okunan şey TEDARİKÇİNİN kutuya
 * yazdığı lot numarasıdır ve o alan zaten kayıtta: `stock.lot_number`. Yani bu kapı olmayan bir
 * alanı uydurmuyor, var olan alanı okutuyor.
 *
 * ── KAPSAM VE STOK SÜZGECİ SORGUDA ──────────────────────────────────────────
 * Yalnız çağıranın deposu (CLAUDE.md §1 — depo süzgeçsiz okuma yok) ve yalnız stoğu duran
 * partiler: tükenmiş bir partiyi göstermek, `recordAdjustment`ın reddedeceği bir satır
 * seçtirirdi. Süzgeçler servisin sorgusunda, elde değil — tavana dayanan bir listeyi sonradan
 * süzmek kapsamdaki partiyi sessizce dışarıda bırakabilirdi.
 *
 * `now` DIŞARIDAN verilir: aynı okumanın bütün satırları aynı ana göre değerlendirilsin
 * (`batch-view`in aynı kararı) — istek ortasında gün dönerse iki satır iki farklı güne bakardı.
 */
export async function resolveBatchCode(
  db: SupabaseClient,
  input: { code: string; warehouseId: string; now?: Date },
): Promise<ResolveBatchOutcome> {
  const code = input.code.trim();
  if (code.length === 0) return { status: 'unknown' };

  const batches = await new StockService(db).findByLot(code, { warehouseId: input.warehouseId, onlyInStock: true });
  if (batches.length === 0) return { status: 'unknown' };

  const now = input.now ?? new Date();
  const names = await variantNames(db, batches.map((batch) => batch.variantId));

  return {
    status: 'found',
    batches: batches.flatMap((batch) => {
      // Lot şemada nullable (kabulde boş bırakmak meşru) ama eşleşme lot ÜZERİNDEN kuruldu: boş
      // lotlu bir satır buraya düşemez. Yine de daraltma bir `as` ile değil yoklamayla — tipin
      // söylediğini görmezden gelen bir dönüşüm, bir gün sorgu değişince sessizce yalan söylerdi.
      if (batch.lotNumber === null) return [];
      return [
        {
          stockId: batch.id,
          variantId: batch.variantId,
          name: displayName(names.get(batch.variantId)),
          lotNumber: batch.lotNumber,
          expiryDate: batch.expiryDate,
          physicalQty: batch.physicalQty,
          storageAreaName: batch.storageArea?.name ?? null,
          // Ömür yüzdesi MOTORDAN (`domain-core`): uygulama katmanı kendi hesabını kurmaz. Ürünün
          // toplam ömrü girilmemişse motor `null` döner ve ekran "bilinmiyor" gösterir.
          lifePercent: remainingShelfLifePercent(batch.expiryDate, batch.variant.product.shelfLifeDays, now),
        },
      ];
    }),
  };
}
