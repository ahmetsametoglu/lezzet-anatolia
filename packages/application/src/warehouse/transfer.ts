import { transferDecision, type TransferSuggestion } from '@lezzet/domain-core';
import { StockService, WarehouseTransferService } from '@lezzet/database';
import type { DispatchLine, ReceiveLine, TransferStatus, WarehouseTransferLine } from '@lezzet/types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { displayName, variantNames } from './names';
import { rpcRejectionMessage } from './rpc-error';

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
 * ── ~~ÖNERİ MOTORU (`transferDecision`) BAĞLANMADI~~ → BAĞLANDI (19.08, web 19.6) ────────────
 * Künye "sevk ÖNERİSİ olan bir ekran çizildiğinde motor hazır duruyor" diyordu — o ekran doğdu:
 * web'in sevk penceresi (`/operations/transfers`). `readDispatchCandidate` aşağıda; mobil v2'nin
 * rampa ekranı öneriye hâlâ dokunmaz (o SAYIM ekranıdır), kapı iki yüzeye de açık.
 */

/** Rampadaki transferin tek satırı — depocunun sayacağı şey. */
export interface InboundTransferLine {
  lineId: string;
  sourceStockId: string;
  /** "Ürün (boy)" — operasyon dilinde (Türkçe). */
  name: string;
  /**
   * Kaynak partinin künyesi (19.6): rampada kutunun ÜSTÜNDE yazan şey lottur — satırı kutuyla
   * eşleştiren depocu adı değil lotu okur. Tarih de aynı karşılaştırmanın parçası (T4: hedefte
   * doğacak parti bu tarihi taşıyacak).
   */
  lotNumber: string | null;
  expiryDate: string;
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
  // küçük olduğu için bu bir N+1 değil, sınırlı bir tur. Parti künyesi ise TEK turda: bütün
  // transferlerin partileri toplanıp bir kez sorulur — `getBatchDetails` kimliğin yanına lot ve
  // tarihi de getiriyor (19.6: rampadaki eşleşme lottan yapılır), ikinci bir okuma açılmadı.
  const lineSets = await Promise.all(rows.map((row) => transfers.listLines(row.id)));
  const details = await lineDetails(db, lineSets.flat());

  return rows.map((row, index) => ({
    transferId: row.id,
    referenceNo: row.referenceNo,
    fromWarehouseId: row.fromWarehouseId,
    dispatchedAt: row.dispatchedAt,
    note: row.note,
    lines: (lineSets[index] ?? []).map((line) => toInboundLine(line, details)),
  }));
}

/** Satır künyesinin tek okuması: partiler + adlar bir turda — `listInboundTransfers` ve `readTransferDetail` paylaşır. */
async function lineDetails(db: SupabaseClient, lines: WarehouseTransferLine[]) {
  const stockIds = [...new Set(lines.map((line) => line.sourceStockId))];
  const batches = await new StockService(db).getBatchDetails(stockIds);
  const batchOf = new Map(batches.map((batch) => [batch.id, batch]));
  const names = await variantNames(db, [...new Set(batches.map((batch) => batch.variantId))]);
  return { batchOf, names };
}

function toInboundLine(
  line: WarehouseTransferLine,
  details: Awaited<ReturnType<typeof lineDetails>>,
): InboundTransferLine {
  const batch = details.batchOf.get(line.sourceStockId);
  return {
    lineId: line.id,
    sourceStockId: line.sourceStockId,
    name: displayName(batch ? details.names.get(batch.variantId) : undefined),
    lotNumber: batch?.lotNumber ?? null,
    expiryDate: batch?.expiryDate ?? '',
    dispatchedQty: line.qty,
    receivedQty: line.receivedQty,
  };
}

/** Tek transferin künyeli hâli — durum ne olursa olsun (yolda, kabul edilmiş, geri alınmış). */
export interface TransferDetail {
  transferId: string;
  referenceNo: string;
  fromWarehouseId: string;
  toWarehouseId: string;
  status: TransferStatus;
  dispatchedAt: string;
  note: string | null;
  lines: InboundTransferLine[];
}

/**
 * **Bu sevkiyatta ne var** — satırlar parti künyesiyle (ad · lot · tarih), her durumda (19.6 kabul
 * eleştirisi, 19.08): "2 kalem · 8 ad." satırının arkasını GÖRMENİN tek yolu kabul düğmesiydi;
 * kapsam dışındaki personel ve kapanmış kayıt için hiç yol yoktu. `listInboundTransfers` yalnız
 * yoldakileri okur (rampa listesi); bu kapı tek kaydı durum süzgeçsiz açar — geçmişte "hangi kalem
 * eksik geldi" sorusunun cevabı `receivedQty`dedir. Künye çözümü burada yaşar: web de mobil de
 * aynı kapıdan okur, ikinci bir ad/lot çözümü doğmaz.
 */
export async function readTransferDetail(
  db: SupabaseClient,
  input: { transferId: string },
): Promise<TransferDetail | null> {
  const transfers = new WarehouseTransferService(db);
  const transfer = await transfers.getById(input.transferId);
  if (!transfer) return null;

  const rawLines = await transfers.listLines(input.transferId);
  const details = await lineDetails(db, rawLines);
  return {
    transferId: transfer.id,
    referenceNo: transfer.referenceNo,
    fromWarehouseId: transfer.fromWarehouseId,
    toWarehouseId: transfer.toWarehouseId,
    status: transfer.status,
    dispatchedAt: transfer.dispatchedAt,
    note: transfer.note,
    lines: rawLines.map((line) => toInboundLine(line, details)),
  };
}

/** Sevk penceresinin varyant kartı — partiler + FEFO önerisi, tek turda. */
export interface DispatchCandidate {
  variantId: string;
  /** "Ürün (boy)" — operasyon dilinde; ad çözülemezse `names.ts`in yer tutucusu. */
  title: string;
  /** Kaynak depoda kullanılabilir (fiili − TÜM aktif rezervasyon) — önerinin tavanı. */
  availableQty: number;
  reservedQty: number;
  batches: Array<{
    stockId: string;
    lotNumber: string | null;
    expiryDate: string;
    physicalQty: number;
    /** Ulaşım süresi düşülünce ömrü biter ya da bitmek üzere olur — uyarı, engel değil. */
    arrivesNearExpiry: boolean;
  }>;
  suggestion: TransferSuggestion;
}

/**
 * **Sevk önerisi** — motorun (`transferDecision`) ilk tüketicisi (19.6). Partiler FEFO sırasında
 * gelir; öneri KULLANILABİLİR üzerinden yapılır (söz verilmiş mal başka şehre gitmez — tavanı
 * `available_stock` koyar). Parti-düzeyi çıpalı rezervasyon (`pinnedReservedQty`) bu okumada
 * TAŞINMAZ ve bu ölçülü bir eksiklik: çıpa yalnız near-expiry teklif satırında var, öneri o
 * partiyi serbest sansa bile toplam tavan aşılamaz ve asıl emniyet sevk RPC'sindedir (parti
 * başına fiili−rezerve−yoldaki kontrolü orada). Teklifli parti sevki yaygınlaşırsa çıpa okuması
 * buraya eklenir — bugün eklemek, olmayan bir soruna makine kurmak olurdu.
 *
 * `today` ve `transitDays` DIŞARIDAN gelir: motor saat okumaz (test edilebilirlik), süre ayardır
 * (`transfer_transit_days`) ve ayarı okumak çağıranın katmanının işidir.
 */
export async function readDispatchCandidate(
  db: SupabaseClient,
  input: { warehouseId: string; variantId: string; wantedQty: number; transitDays: number; today: string },
): Promise<DispatchCandidate | { status: 'no_stock' }> {
  const stocks = new StockService(db);
  const [batches, availableMap, names] = await Promise.all([
    stocks.listInStockDetailed([input.variantId], [input.warehouseId]),
    stocks.getAvailableMap(input.warehouseId, [input.variantId]),
    variantNames(db, [input.variantId]),
  ]);
  if (batches.length === 0) return { status: 'no_stock' };

  const available = availableMap.get(input.variantId);
  const suggestion = transferDecision({
    batches: batches.map((b) => ({
      stockId: b.id,
      variantId: b.variantId,
      expiryDate: b.expiryDate,
      physicalQty: b.physicalQty,
    })),
    wantedQty: input.wantedQty,
    availableQty: available?.availableQty ?? 0,
    transitDays: input.transitDays,
    today: input.today,
  });

  const nearExpiry = new Set(suggestion.lines.filter((l) => l.arrivesNearExpiry).map((l) => l.stockId));
  return {
    variantId: input.variantId,
    title: displayName(names.get(input.variantId)),
    availableQty: available?.availableQty ?? 0,
    reservedQty: available?.reservedQty ?? 0,
    batches: batches.map((b) => ({
      stockId: b.id,
      lotNumber: b.lotNumber,
      expiryDate: b.expiryDate,
      physicalQty: b.physicalQty,
      arrivesNearExpiry: nearExpiry.has(b.id),
    })),
    suggestion,
  };
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
    // Ret mesajı OLDUĞU GİBİ taşınır (`rpcRejectionMessage` künyesi): rampadaki depocu "kabul
    // yazılamadı" değil, RPC'nin söylediği fiziksel gerçeği okumalı.
    return { status: 'failed', message: rpcRejectionMessage(error, 'Kabul yazılamadı') };
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
    return { status: 'failed', message: rpcRejectionMessage(error, 'Sevk yazılamadı') };
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
    return { status: 'failed', message: rpcRejectionMessage(error, 'Geri alınamadı') };
  }
}

/** Bu depodan çıkmış, hâlâ yolda olan sevkiyat — satırları YOK (aşağıdaki künye). */
export interface OutboundTransfer {
  transferId: string;
  referenceNo: string;
  toWarehouseId: string;
  dispatchedAt: string;
  lineCount: number;
  /** Tahmini varış günü (`YYYY-MM-DD`) — sevk günü + ulaşım süresi AYARI; taşıyıcıdan gelen söz değil. */
  etaDate: string;
}

/**
 * **"Benden ne çıktı, hâlâ yolda mı"** (v3 · 11'in ikinci bölümü, 30.08).
 *
 * ── NEDEN SATIRSIZ ──────────────────────────────────────────────────────────
 * Gelen transferin satırları rampada SAYILACAK şeydir; çıkanınki çoktan sayılıp yola çıkmıştır ve
 * gönderen depoda yapılacak bir iş kalmamıştır. Bölüm bir kabul ekranı değil, bir hatırlatmadır:
 * "unuttuğum bir sevkiyat yolda mı". Satırları taşımak telefona hiç açılmayacak bir ağaç
 * indirtirdi (`listInboundTransfers` transfer başına bir tur atıyor — o turun bedeli orada kabul
 * edildi çünkü ekran o satırları çiziyor). Tekil kaydın satırı gerekirse kapısı ayrı:
 * `readTransferDetail`.
 *
 * `transitDays` DIŞARIDAN gelir (`readDispatchCandidate` ile aynı kural): süre bir AYARDIR
 * (`transfer_transit_days`) ve ayarı okumak çağıranın katmanının işidir — bu kapı saat de okumaz,
 * `today`i de dışarıdan alır ki aynı okumanın bütün satırları aynı güne göre hesaplansın.
 */
export async function listOutboundTransfers(
  db: SupabaseClient,
  input: { warehouseId: string; transitDays: number },
): Promise<OutboundTransfer[]> {
  const transfers = new WarehouseTransferService(db);
  const rows = await transfers.listDispatchedFrom(input.warehouseId);
  if (rows.length === 0) return [];

  // Satır SAYISI için satırları okumak gerekiyor (kayıtta sayaç kolonu yok) ama künyeleri
  // çözülmüyor: sayı bir uzunluk, ad çözümü ise iki tur daha demekti.
  const lineSets = await Promise.all(rows.map((row) => transfers.listLines(row.id)));

  return rows.map((row, index) => ({
    transferId: row.id,
    referenceNo: row.referenceNo,
    toWarehouseId: row.toWarehouseId,
    dispatchedAt: row.dispatchedAt,
    lineCount: lineSets[index]?.length ?? 0,
    etaDate: addDaysToDate(row.dispatchedAt, input.transitDays),
  }));
}

/**
 * Sevk damgasına ulaşım süresini ekler ve GÜNE indirir (`YYYY-MM-DD`).
 *
 * Saat DÜŞÜRÜLÜR ve bu bilinçli: tahmin bir gündür, bir an değil — "30.08 14:12'de varır" demek,
 * elimizde olmayan bir kesinliği ima ederdi. Ayarın kendisi de gün cinsinden.
 */
function addDaysToDate(from: string, days: number): string {
  const eta = new Date(from);
  eta.setUTCDate(eta.getUTCDate() + days);
  return eta.toISOString().slice(0, 10);
}

/** Kapanmış sevkiyat — kabul edilmiş ya da geri alınmış; iki yön de bu listede. */
export interface ClosedTransfer {
  transferId: string;
  referenceNo: string;
  fromWarehouseId: string;
  toWarehouseId: string;
  /** `in` = bu depo aldı, `out` = bu depo gönderdi. */
  direction: 'in' | 'out';
  status: Extract<TransferStatus, 'received' | 'cancelled'>;
  /** Kabul ya da geri alma damgası — kaydın KAPANDIĞI an, sevk anı değil. */
  closedAt: string;
  lineCount: number;
  /** Sevk edilenden AZ sayılan satır sayısı; `0` = tam kabul. **Geri alınmışta `null`** (aşağıda). */
  shortLineCount: number | null;
}

/**
 * **"Son ne kapandı"** (v3 · 11'in üçüncü bölümü, 30.08) — iki yön birden.
 *
 * ── NEDEN İKİ YÖN ───────────────────────────────────────────────────────────
 * Gönderdiğinin kapanışı da alındığınki kadar depocunun işi: eksik kabul edilen bir sevkiyatın
 * GÖNDEREN tarafı da farkı görmeli, yoksa "ben 8 yolladım" ile "bize 7 geldi" hiçbir ekranda
 * buluşmaz. `direction` alan olarak dönüyor çünkü ekran kendi deposunun kimliğini BİLMEZ — kimlik
 * jetonda, çözümü sunucuda.
 *
 * ── EKSİK SAYIMI YALNIZ KABULDE ANLAMLI ─────────────────────────────────────
 * Geri alınmış transferde `shortLineCount` `null`: iptal bir kabul değildir ve "0 eksik" demek,
 * hiç sayılmamış bir sevkiyatı sorunsuz kabul edilmiş gibi okuturdu (CLAUDE §1 — ölçülemeyen
 * değer sıfır değildir). Kabulde ise ölçüt satır satır `receivedQty < qty`; sayılmamış satır
 * (`null`) EKSİK SAYILIR çünkü kabul kapandığı hâlde o satırın karşılığı yazılmamıştır.
 */
export async function listClosedTransfers(
  db: SupabaseClient,
  input: { warehouseId: string },
): Promise<ClosedTransfer[]> {
  const transfers = new WarehouseTransferService(db);
  const rows = await transfers.listClosedFor([input.warehouseId]);
  if (rows.length === 0) return [];

  const lineSets = await Promise.all(rows.map((row) => transfers.listLines(row.id)));

  return rows.flatMap((row, index) => {
    // Durum daraltması yoklamayla: sorgu ikisini süzüyor ama tipin söylediğini `as` ile ezmek,
    // sorgu bir gün genişlediğinde sessizce yalan söylerdi (`listPendingIntakes` ile aynı karar).
    if (row.status !== 'received' && row.status !== 'cancelled') return [];
    const lines = lineSets[index] ?? [];
    return [
      {
        transferId: row.id,
        referenceNo: row.referenceNo,
        fromWarehouseId: row.fromWarehouseId,
        toWarehouseId: row.toWarehouseId,
        direction: row.toWarehouseId === input.warehouseId ? ('in' as const) : ('out' as const),
        status: row.status,
        // Damga durumdan seçilir; ikisi de boşsa sevk anına düşülür — kaydın kapandığı kesin ama
        // damgası okunamadıysa uydurma bir tarih yerine BİLİNEN en yakın an gösterilir.
        closedAt: (row.status === 'received' ? row.receivedAt : row.cancelledAt) ?? row.dispatchedAt,
        lineCount: lines.length,
        shortLineCount:
          row.status === 'cancelled' ? null : lines.filter((line) => (line.receivedQty ?? 0) < line.qty).length,
      },
    ];
  });
}
