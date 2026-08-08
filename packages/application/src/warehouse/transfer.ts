import { StockService, WarehouseTransferService } from '@lezzet/database';
import type { DispatchLine, ReceiveLine, TransferStatus } from '@lezzet/types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { displayName, variantNames } from './names';

/**
 * **Depolar arası transfer — D5** (19.1/19.6), terfi 21.11. DOMAIN §17, K11/T4; mobil v2 "Transfer"
 * ekranı bağlayıcı.
 *
 * ── BU KAPI HİÇBİR YERDE YOKTU ───────────────────────────────────────────────
 * Ölçüldü (08.08): web'de transfer için bir uygulama kapısı YOK — `/operations/warehouses/page.tsx`
 * `WarehouseTransferService.listInTransit()`i doğrudan çağırıyor ve `dispatch`/`receive`/`cancel`in
 * hiç çağıranı yok. Yani burası bir "terfi" değil, **ilk kez yazılan** kapı: servis satır getirir,
 * kapı üç şeyi ekler — depo kimliği kontrolü, eksik satır reddi ve rampadaki ekranın okuması.
 *
 * ── ÜÇ FİİLİN ÜÇÜ DE DEPO KİMLİĞİ İSTER ──────────────────────────────────────
 * Sevkte kaynak, kabulde hedef, geri almada yine kaynak. Kimlik parametredir, süzgeç değil:
 * "personelin sabit deposu" uç katmanda çözülür (CLAUDE.md §1 — varsayılan depo YOKTUR). Yanlış
 * deponun transferini kapatmak, iki depoda birden görünmeyen mal demektir.
 *
 * ── ÖNERİ MOTORU (`transferDecision`) BAĞLANMADI ─────────────────────────────
 * `domain-core/stock/transfer.ts` bir sevk önerisi üretiyor (FEFO + yolda ömür yanması) ve bugün
 * SIFIR tüketicisi var. Mobil v2'nin transfer ekranı **rampada sayım** ekranıdır: "RAMPADA SAY —
 * GELEN ADEDİ GİR". Ne öneri gösteriyor ne de sevk kurgusu barındırıyor. Ölçüldü, bağlanmadı:
 * kullanılmayan bir motoru kapıya takmak, olmayan bir soruna makine kurmaktır (CLAUDE.md §0).
 * Sevk ÖNERİSİ olan bir ekran çizildiğinde motor hazır duruyor.
 */

/** Rampadaki transferin tek satırı — depocunun sayacağı şey. */
export interface InboundTransferLine {
  lineId: string;
  sourceStockId: string;
  /** "Ürün (boy)" — operasyon dilinde (Türkçe). */
  name: string;
  /** Kaynak deponun yola çıkardığı adet; ekranda "sevk edilen" olarak görünür. */
  dispatchedQty: number;
  /**
   * Kabulde sayılan adet. **`null` = henüz sayılmadı, `0` = geldi ama kayıp** — ikisi ayrı şeydir
   * ve ayrımı veri taşır (0042).
   */
  receivedQty: number | null;
}

/** Yoldaki transfer — künye + satırlar. Para YOK: transfer bir mal hareketidir, alım değil. */
export interface InboundTransfer {
  transferId: string;
  /** TRF-COL-26-0007 — KAYNAK deponun kodu; kâğıt klasör orada durur. */
  referenceNo: string;
  fromWarehouseId: string;
  dispatchedAt: string;
  note: string | null;
  lines: InboundTransferLine[];
}

/**
 * **Bana ne geliyor** — bu depoya yolda olan transferler, satırlarıyla.
 *
 * Sayfalanmaz ve bu bilinçli (servisin künyesiyle aynı gerekçe): küme FİZİKSEL gerçekle sınırlı —
 * aynı anda yolda olan sevkiyat sayısı kadar. Bir sevkiyatı kaçırmak, iki depoda da görünmeyen mal
 * demektir; bu listenin TAM olması gerekir.
 *
 * @param db service-role istemci — çağıran enjekte eder (`serviceDb()`), `auth/otp` deseni.
 */
export async function listInboundTransfers(
  db: SupabaseClient,
  input: { warehouseId: string },
): Promise<InboundTransfer[]> {
  const transfers = new WarehouseTransferService(db);
  const rows = await transfers.listInTransit(input.warehouseId);
  if (rows.length === 0) return [];

  // Satırlar transfer başına okunur (servisin kapısı öyle); yoldaki sevkiyat sayısı fiziksel olarak
  // küçük olduğu için bu bir N+1 değil, sınırlı bir tur. Ad çözümü ise TEK turda: bütün transferlerin
  // partileri toplanıp bir kez sorulur.
  const lineSets = await Promise.all(rows.map((row) => transfers.listLines(row.id)));
  const stockIds = [...new Set(lineSets.flat().map((line) => line.sourceStockId))];
  const batches = await new StockService(db).listByIds(stockIds);
  const variantOf = new Map(batches.map((batch) => [batch.id, batch.variantId]));
  const names = await variantNames(db, [...variantOf.values()]);

  return rows.map((row, index) => ({
    transferId: row.id,
    referenceNo: row.referenceNo,
    fromWarehouseId: row.fromWarehouseId,
    dispatchedAt: row.dispatchedAt,
    note: row.note,
    lines: (lineSets[index] ?? []).map((line) => {
      const variantId = variantOf.get(line.sourceStockId);
      return {
        lineId: line.id,
        sourceStockId: line.sourceStockId,
        name: displayName(variantId ? names.get(variantId) : undefined),
        dispatchedQty: line.qty,
        receivedQty: line.receivedQty,
      };
    }),
  }));
}

export type ReceiveTransferOutcome =
  | { status: 'ok'; transferId: string; createdBatches: number }
  /** Transfer bu depoya gelmiyor — başka deponun kabulü buradan kapatılamaz. */
  | { status: 'forbidden'; reason: 'out_of_scope' }
  /** Araya biri girdi: transfer artık yolda değil (kabul edilmiş ya da geri alınmış). */
  | { status: 'stale'; currentStatus: TransferStatus }
  /**
   * **Sayılmamış satır var** — kabul YAPILMADI. v2'nin cümlesi birebir: *"0 = geldi ama kayıp; boş
   * = sayılmadı — boş satır kabulü bloklar, ikisi ayrı şeydir."* Eksik satır transferi kapatırsa
   * mal kaynaktan düşmüş, hedefte doğmamış ve "yolda" listesinden de çıkmış olurdu.
   */
  | { status: 'incomplete'; missingLineIds: string[]; unknownLineIds: string[] }
  | { status: 'failed'; message: string }
  | { status: 'not_found' };

/**
 * **Transfer kabulü** (D5). Hedefte tarih/lot/alış kopyalanmış YENİ parti doğar (T4: parti kimliği
 * korunur, birleşmez).
 *
 * Kapının eklediği kural EKSİK SATIR REDDİ: RPC de reddeder ama oradan dönen şey bir istisnadır,
 * ekranın gösterebileceği bir cevap değil. Burada hangi satırın sayılmadığı GÖRÜNÜR döner —
 * depocunun rampada arayacağı bilgi tam olarak budur.
 */
export async function receiveTransfer(
  db: SupabaseClient,
  input: {
    transferId: string;
    /** Kabul eden depo — transferin HEDEFİ değilse yazım hiç yapılmaz. */
    warehouseId: string;
    lines: readonly ReceiveLine[];
    actorId?: string | null;
  },
): Promise<ReceiveTransferOutcome> {
  const transfers = new WarehouseTransferService(db);
  const transfer = await transfers.getById(input.transferId);
  if (!transfer) return { status: 'not_found' };
  if (transfer.toWarehouseId !== input.warehouseId) return { status: 'forbidden', reason: 'out_of_scope' };
  if (transfer.status !== 'in_transit') return { status: 'stale', currentStatus: transfer.status };

  const expected = new Set((await transfers.listLines(input.transferId)).map((line) => line.id));
  const given = new Set(input.lines.map((line) => line.lineId));
  const missingLineIds = [...expected].filter((id) => !given.has(id));
  const unknownLineIds = [...given].filter((id) => !expected.has(id));
  if (missingLineIds.length > 0 || unknownLineIds.length > 0) {
    return { status: 'incomplete', missingLineIds, unknownLineIds };
  }

  try {
    const result = await transfers.receive({ transferId: input.transferId, lines: [...input.lines], actorId: input.actorId });
    return { status: 'ok', transferId: result.transferId, createdBatches: result.createdBatches };
  } catch (error) {
    return { status: 'failed', message: error instanceof Error ? error.message : 'Kabul yazılamadı' };
  }
}

export type DispatchTransferOutcome =
  | { status: 'ok'; transferId: string; referenceNo: string }
  /**
   * `out_of_scope` — parti çağıranın deposunda değil (kaynak KALEMLERDEN türer, bu yüzden kontrol
   * partilerin üstünde). `same_warehouse` — hedef kaynakla aynı; bir transfer değil, hiçbir şey.
   */
  | { status: 'forbidden'; reason: 'out_of_scope' | 'same_warehouse'; stockIds?: string[] }
  | { status: 'not_found'; stockIds: string[] }
  | { status: 'failed'; message: string }
  | { status: 'empty' };

/**
 * **Sevk** (D5'in "ver" yarısı). Mal kaynaktan DÜŞER ve yolda hiçbir deponun stoğunda değildir —
 * sanal bir transit depo yoktur, "yolda ne var" sorusunun kaynağı transfer kaydıdır.
 *
 * Sevk edilebilecek miktarın ölçüsü fiili değil KULLANILABİLİR stoktur: müşteriye söz verilmiş mal
 * başka şehre gidemez. Kuralı RPC zorlar; reddi burada `failed` olarak taşınır (STACK §8).
 */
export async function dispatchTransfer(
  db: SupabaseClient,
  input: {
    /** Malın çıktığı depo — partilerin hepsi buranın olmalı. */
    fromWarehouseId: string;
    toWarehouseId: string;
    lines: readonly DispatchLine[];
    actorId?: string | null;
    note?: string | null;
  },
): Promise<DispatchTransferOutcome> {
  if (input.lines.length === 0) return { status: 'empty' };
  if (input.fromWarehouseId === input.toWarehouseId) return { status: 'forbidden', reason: 'same_warehouse' };

  const stockIds = [...new Set(input.lines.map((line) => line.sourceStockId))];
  const batches = await new StockService(db).listByIds(stockIds);
  const warehouseOf = new Map(batches.map((batch) => [batch.id, batch.warehouseId]));

  const missing = stockIds.filter((id) => !warehouseOf.has(id));
  if (missing.length > 0) return { status: 'not_found', stockIds: missing };

  const foreign = stockIds.filter((id) => warehouseOf.get(id) !== input.fromWarehouseId);
  if (foreign.length > 0) return { status: 'forbidden', reason: 'out_of_scope', stockIds: foreign };

  try {
    const result = await new WarehouseTransferService(db).dispatch({
      toWarehouseId: input.toWarehouseId,
      lines: [...input.lines],
      actorId: input.actorId,
      note: input.note,
    });
    return { status: 'ok', transferId: result.transferId, referenceNo: result.referenceNo };
  } catch (error) {
    return { status: 'failed', message: error instanceof Error ? error.message : 'Sevk yazılamadı' };
  }
}

export type CancelTransferOutcome =
  | { status: 'ok'; transferId: string; restoredLines: number }
  /** Geri almayı yalnız KAYNAK depo yapar: "mal hiç çıkmadı" cümlesini ancak gönderen kurabilir. */
  | { status: 'forbidden'; reason: 'out_of_scope' }
  | { status: 'stale'; currentStatus: TransferStatus }
  | { status: 'failed'; message: string }
  | { status: 'not_found' };

/**
 * **Sevk kaydını geri al** (19.6) — "mal hiç çıkmadı" hâli. Miktar kaynak PARTİYE geri yazılır.
 *
 * Adı bilerek "iptal" değil: mal çıkıp SONRA geri döndüyse yol burası değil, ters yönlü yeni bir
 * transferdir — tek kayda indirmek soğuk zincir geçmişini silerdi. Kabul edilmiş transfer geri
 * alınamaz (RPC reddeder; durum kontrolü burada da var, çünkü `stale` ekranın göstereceği cevaptır).
 */
export async function cancelTransfer(
  db: SupabaseClient,
  input: { transferId: string; warehouseId: string; actorId?: string | null; reason?: string | null },
): Promise<CancelTransferOutcome> {
  const transfers = new WarehouseTransferService(db);
  const transfer = await transfers.getById(input.transferId);
  if (!transfer) return { status: 'not_found' };
  if (transfer.fromWarehouseId !== input.warehouseId) return { status: 'forbidden', reason: 'out_of_scope' };
  if (transfer.status !== 'in_transit') return { status: 'stale', currentStatus: transfer.status };

  try {
    const result = await transfers.cancel({ transferId: input.transferId, actorId: input.actorId, reason: input.reason });
    return { status: 'ok', transferId: result.transferId, restoredLines: result.restoredLines };
  } catch (error) {
    return { status: 'failed', message: error instanceof Error ? error.message : 'Geri alınamadı' };
  }
}
