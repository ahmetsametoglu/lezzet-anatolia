import type { SupabaseClient } from '@supabase/supabase-js';
import {
  OrderItemBatchService,
  OrderService,
  ReservationService,
  StockMovementService,
  StockService,
  WarehouseTransferLineService,
} from '@lezzet/database';
import {
  averageBatchLife,
  batchLifeDays,
  dailyExitRate,
  daysOfCover,
  countsAsLoss,
  isCountDiff,
  lossPercent,
} from '@lezzet/domain-core';
import type { StockMovementKind, StockWriteOffReason } from '@lezzet/types';

/**
 * **BİR ÜRÜNÜN STOK GEÇMİŞİ** (22.30) — "bu üründen ne zaman, kaça girdi; ne kadarı satıldı, ne
 * kadarı çöpe gitti, partiler kaç günde eridi".
 *
 * ── BU DOSYA BİR TELAFİ MAKİNESİYDİ (06.14'te söküldü) ──────────────────────
 * Stokta hareket defteri yoktu; "giren − çıkan = elde" denklemi burada, elde, altı servisten gelen
 * satırlar birleştirilerek kuruluyordu. Künyeleri **dört ayrı üretim arızası** anlatıyordu ve
 * dördü de kullanıcı ekran görüntüsüyle yakalanmıştı — hepsi aynı sınıftandı: bir hareketin iki
 * yerde sayılması ya da hiç sayılamaması.
 *
 * `stock_movement` gelince o sınıf kapandı. Denklem artık burada KURULMUYOR, veritabanında zaten
 * tutuyor (`Σin − Σout = physical_qty`) ve bir entegrasyon testi onu koruyor. Bu dosya yalnız
 * okuyup sunuyor.
 *
 * ── NEDEN AĞIR DEĞİL: SORU TEK VARYANTIN ────────────────────────────────────
 * Katalog geneli istatistik ağır bir iştir; bu okuma **seçili tek boyun** geçmişini, tıklandığı an
 * çekiyor. Sorgular indeksli: partiler (`stock_variant_expiry_idx`), hareketler
 * (`stock_movement_stock_idx`). Sayfa açılışında hiç çalışmıyor.
 *
 * ── KARAR MOTORUN, OKUMA BURANIN ────────────────────────────────────────────
 * Hız, yeterlilik, ortalama ömür ve fire oranı `domain-core/stock/history`ten geliyor. Ölçülemeyen
 * her değer `null` döner ve ekran onu "—" diye çizer (`CLAUDE §1`).
 */

/** Geçmişte görünecek parti sayısının tavanı — "son N giriş" bir bakıştır, defter değil. */
const BATCH_LIMIT = 12;

/** Hız penceresi (gün): mevsimsel dalgayı yutmayacak kadar kısa, tek bir günden etkilenmeyecek kadar uzun. */
const RATE_WINDOW_DAYS = 90;

/** Malın MÜŞTERİYE gittiği hareketler — hız hesabının paydası (sevk bir satış değildir). */
const SALE_KINDS: readonly StockMovementKind[] = ['sale', 'counter_sale'];

/** Geçmişteki bir parti — girişi ve akıbeti. */
export interface VariantBatchHistory {
  stockId: string;
  warehouseId: string;
  /** Partinin depoya girdiği an (ISO). */
  createdAt: string;
  expiryDate: string;
  lotNumber: string | null;
  /** Partinin durduğu alanın ADI — geçmiş okuması bir tabela arıyor, kimlik değil (19.29). */
  areaName: string | null;
  /** Girişte yazılan adet — değişmez (`stock.initial_qty`). */
  initialQty: number;
  /** Bugün elde kalan adet. 0 = tükendi (satıldı ya da düşüldü). */
  physicalQty: number;
  /** Birim alış (cent); girilmemişse `null` — 0 ile karıştırılmaz. */
  unitCostCents: number | null;
  /** Bu partiden MÜŞTERİYE giden adet (satış + kapı satışı). */
  soldQty: number;
  /** Bu partiden düşülen adet — imha + sayım farkı (net; sayım fazlası azaltır). */
  lostQty: number;
  /**
   * Partinin ömrü: girişten SON çıkışa kaç gün. `null` = hiç çıkış görmemiş ya da hâlâ elde
   * (tükenmemiş partinin ömrü henüz yazılmadı).
   */
  lifeDays: number | null;
}

/** "Ayrılmış" malın sahibi — hangi sipariş, ne kadar (22.31). */
export interface VariantReservation {
  orderId: string;
  referenceNo: string | null;
  status: string;
  qty: number;
}

export interface VariantStockHistory {
  batches: VariantBatchHistory[];
  /** Tavan doldu mu — "son N" görüyorsunuz demektir, sessiz kırpma yok. */
  truncated: boolean;
  /**
   * **MALIN AKIŞI** (22.31) — "aldığım stok nereye gitti" (kullanıcı tespiti 14.08).
   *
   * ── SAYILAR ARTIK TEK KAYNAKTAN (06.14) ─────────────────────────────────────
   * Çıkışlar ve düşülenler GÖRÜNEN partilerin hareket defterinden geliyor; eskiden üç ayrı tablodan
   * kurulan bir yaklaşıklıktı ve tutmadığı her durumda ekran "kayda geçmemiş bir hareket var" diye
   * uyarıyordu — uyarıların dördü de veri arızası değil, bu hesabın kendi kusuruydu. Giriş ise
   * `initial_qty`den okunuyor (gerekçe aşağıda, `intakeQty`nin künyesinde).
   *
   * Liste tavana dayandıysa (`truncated`) toplamlar eksik kalır ve ekran akış satırını çizmez.
   *
   * **`pickedQty` DENKLEME GİRMEZ** ve sebebi değişmedi: hazırlanmış mal `physical_qty`de DURUYOR
   * (stok teslimde düşer, hazırlıkta değil). Defterde de hareketi yoktur — bir çıkış değil, bir ara
   * hâldir. Ayrı okunur, ayrı gösterilir.
   */
  flow: {
    intakeQty: number;
    deliveredQty: number;
    pickedQty: number;
    lostQty: number;
    /** Yolda — kaynaktan düştü, hedefte henüz parti değil (`inTransitFromStocks` künyesi). */
    inTransitQty: number;
    onHandQty: number;
  };
  /** Penceredeki toplam satış ve günlük ortalama; hiç satış yoksa `null`. */
  rate: { windowDays: number; qty: number; perDay: number } | null;
  /**
   * Eldeki kullanılabilir mal kaç gün yeter — hız bilinmiyorsa `null`.
   * `capped` = gözlem penceresinde takılı; ötesi ölçüm değil tahmin olurdu.
   */
  daysOfCover: { days: number; capped: boolean } | null;
  /** Tükenmiş partilerin ortalama ömrü + kaç partiye dayandığı. */
  averageLife: { days: number; sampleCount: number } | null;
  /**
   * Fire: adet, girene oranı (%) ve kırılımlar.
   *
   * `qty`/`percent` yalnız İMHAYI sayar (`write_off`) ve hep pozitiftir. `byKind` düzeltme
   * tiplerini taşır — iade ve sayım farkı da birer olaydır, kırılımda görünmeleri gerekir.
   * `byReason` imhanın içini açar (DLC · hasar · kayıp), `countDiff` ise sayımın NET sapması (±):
   * ayrı, çünkü *"ne kadarını çöpe attım"* ile *"saydığımda ne kadar saptım"* iki farklı soru
   * (22.34 · kullanıcı kararı 26.08).
   */
  loss: {
    qty: number;
    percent: number | null;
    byKind: Array<{ kind: StockMovementKind; qty: number }>;
    byReason: Array<{ reason: StockWriteOffReason; qty: number }>;
    countDiff: number;
  };
  /** Ayrılmış mal kime ayrılmış — boş dizi = ayrılmış yok. */
  reservations: VariantReservation[];
  /** İlk ve son satışın günü (ISO) — "hiç satılmış mı" sorusunun cevabı. Satış yoksa `null`. */
  firstSaleAt: string | null;
  lastSaleAt: string | null;
}

/**
 * Rezervasyon satırlarını SİPARİŞ başına toplar; numara ve durum künyeden gelir.
 *
 * Sipariş bulunamazsa (satır kapanmış bir siparişe asılı kalmışsa) numara UYDURULMAZ: `null` döner ve
 * ekran "numarasız sipariş" der — sessizce atmak, ayrılmış malın bir kısmını görünmez kılardı.
 */
function groupReservations(
  rows: readonly { orderId: string; qty: number }[],
  orderOf: Map<string, { referenceNo: string | null; status: string }>,
): Map<string, VariantReservation> {
  const byOrder = new Map<string, VariantReservation>();
  for (const row of rows) {
    const seen = byOrder.get(row.orderId);
    if (seen) {
      seen.qty += row.qty;
      continue;
    }
    const order = orderOf.get(row.orderId);
    byOrder.set(row.orderId, {
      orderId: row.orderId,
      referenceNo: order?.referenceNo ?? null,
      status: order?.status ?? 'bilinmiyor',
      qty: row.qty,
    });
  }
  return byOrder;
}

export async function readVariantStockHistory(
  db: SupabaseClient,
  input: { variantId: string; warehouseIds: readonly string[] | undefined; availableQty: number; now: Date },
): Promise<VariantStockHistory> {
  const stocks = new StockService(db);
  const movements = new StockMovementService(db);
  const since = new Date(input.now.getTime() - RATE_WINDOW_DAYS * 86_400_000);

  // Dört okuma TEK turda: hepsi aynı anın gerçeği ve sırayla beklemelerinin sebebi yok.
  // `BATCH_LIMIT + 1` çekilir ki tavana dayanıldığı ANLAŞILSIN (sayfalamanın `limit+1` deseni).
  //
  // **Çıkışlar TÜM ZAMANLAR için okunuyor, pencere için değil** (22.31): "bu ürün hiç satıldı mı"
  // sorusunun cevabı 90 günle sınırlanamaz — pencereyi tarih süzgeci değil, aşağıdaki hesap kuruyor.
  const [batchRows, exits, picked, reservationRows] = await Promise.all([
    stocks.listVariantHistory(input.variantId, input.warehouseIds, BATCH_LIMIT + 1),
    movements.exitsByVariant(input.variantId),
    new OrderItemBatchService(db).pickedByVariant(input.variantId),
    new ReservationService(db).listActiveByVariantScoped(input.variantId, input.warehouseIds),
  ]);

  // Sipariş künyesi İKİNCİ turda: `reservation.order_id`nin FK'sı yok (tablo `order`dan önce doğdu),
  // yani gömülü okuma kurulamıyor. Tur TEK: satır başına sorgu N+1 olurdu.
  const reservedOrders =
    reservationRows.length > 0
      ? await new OrderService(db).listByIds([...new Set(reservationRows.map((row) => row.orderId))])
      : [];
  const orderOf = new Map(reservedOrders.map((order) => [order.id, order]));

  const truncated = batchRows.length > BATCH_LIMIT;
  const batches = truncated ? batchRows.slice(0, BATCH_LIMIT) : batchRows;
  const stockIds = batches.map((batch) => batch.id);
  const visible = new Set(stockIds);

  // **GÖRÜNEN partilerin BÜTÜN hareketleri, tek sorguda** — eskiden burada yalnız düzeltmeler
  // okunuyordu (`StockAdjustmentService.listByStocks`) ve satışlar başka tablodan kurulup elde
  // birleştiriliyordu. Defter tek olunca birleştirme de kalktı.
  const ledger = stockIds.length > 0 ? await movements.listByStocks(stockIds) : [];

  // **Yoldaki mal** — kaynaktan düşmüş, hedefte henüz parti değil. Defterde `transfer_out` olarak
  // görünüyor ve akış denklemine zaten dahil; bu okuma AYRI bir soruyu cevaplıyor ("şu an nerede"),
  // denklemi düzeltmek için değil (`inTransitFromStocks` künyesi).
  const inTransitLines = stockIds.length > 0 ? await new WarehouseTransferLineService(db).inTransitFromStocks(stockIds) : [];
  const inTransitQty = inTransitLines.reduce((sum, line) => sum + line.qty, 0);

  // Parti başına: bu partiden müşteriye ne kadar gitti ve en SON ne zaman çıktı.
  const soldQty = new Map<string, number>();
  const lastExit = new Map<string, string>();
  for (const exit of exits) {
    if (SALE_KINDS.includes(exit.kind)) soldQty.set(exit.stockId, (soldQty.get(exit.stockId) ?? 0) + exit.qty);
    // Ömür HER çıkışa bakar (sevk de partiyi eritir), satışa değil.
    const seen = lastExit.get(exit.stockId);
    if (!seen || exit.at > seen) lastExit.set(exit.stockId, exit.at);
  }

  /**
   * Parti satırının DÜŞÜLENİ — imha + sayım farkı, işaretli (sayım fazlası azaltır).
   *
   * Sayım farkının burada olması bilinçli (ölçüldü ve düzeltildi 26.08): rapor ayrımı fiziksel
   * hareketi silmez — rafta fazla çıkan mal stoğu gerçekten artırır. Satış ve sevk BURADA YOK;
   * onlar `soldQty`de ve akış denkleminde kendi kalemleriyle duruyor.
   */
  const movedQty = new Map<string, number>();
  /** FİRE ORANININ payı — yalnız imha, hep pozitif. */
  const lostQty = new Map<string, number>();
  const byKind = new Map<StockMovementKind, number>();
  const byReason = new Map<StockWriteOffReason, number>();
  /** Sayımın NET sapması (±) — fire toplamının dışında, kendi satırında gösterilir. */
  let countDiff = 0;
  for (const row of ledger) {
    if (!visible.has(row.stockId)) continue;
    const signed = row.direction === 'out' ? row.qty : -row.qty;

    // Düzeltme tiplerinin kırılımı — satış/sevk buraya girmez, onlar akışın kendi kalemleri.
    if (countsAsLoss(row.kind) || isCountDiff(row.kind) || row.kind === 'return_restock') {
      byKind.set(row.kind, (byKind.get(row.kind) ?? 0) + row.qty);
    }
    if (countsAsLoss(row.kind)) {
      lostQty.set(row.stockId, (lostQty.get(row.stockId) ?? 0) + row.qty);
      if (row.reason) byReason.set(row.reason, (byReason.get(row.reason) ?? 0) + row.qty);
    }
    if (countsAsLoss(row.kind) || isCountDiff(row.kind)) {
      movedQty.set(row.stockId, (movedQty.get(row.stockId) ?? 0) + signed);
    }
    if (isCountDiff(row.kind)) countDiff += signed;
  }

  const history: VariantBatchHistory[] = batches.map((batch) => ({
    stockId: batch.id,
    warehouseId: batch.warehouseId,
    createdAt: batch.createdAt,
    expiryDate: batch.expiryDate,
    lotNumber: batch.lotNumber,
    areaName: batch.storageArea?.name ?? null,
    initialQty: batch.initialQty,
    physicalQty: batch.physicalQty,
    unitCostCents: batch.purchasePriceCents,
    soldQty: soldQty.get(batch.id) ?? 0,
    lostQty: movedQty.get(batch.id) ?? 0,
    // **Ömür yalnız TÜKENMİŞ partide yazılır.** Elde duran partinin son çıkışı bir bitiş değil, ara
    // bir andır; onu ömür sayarsak "3 günde eridi" diyen bir parti yarın hâlâ rafta olur.
    lifeDays: batch.physicalQty === 0 ? batchLifeDays(batch.createdAt, lastExit.get(batch.id) ?? null) : null,
  }));

  // Hız YALNIZ pencere içindeki SATIŞLARDAN; liste tüm zamanları taşıyor, süzgeç burada. Sevk
  // dışarıda: başka depoya giden mal satılmadı, yalnız yer değiştirdi — hıza sayılsaydı bir
  // transferden sonra ürün "hızlı satıyor" görünür ve yeterlilik yanlış hesaplanırdı.
  const sales = exits.filter((exit) => SALE_KINDS.includes(exit.kind));
  const rate = dailyExitRate(
    sales.filter((exit) => new Date(exit.at) >= since),
    RATE_WINDOW_DAYS,
  );

  /**
   * **GİRİŞ `initial_qty`den, defterden DEĞİL** — ve bu bilinçli bir tercih (06.14).
   *
   * Defterde parti doğuşu da bir hareket (`intake`/`transfer_in`) ve gerçek akışta ikisi birebir
   * aynı. Ama `stock` satırı doğrudan da yazılabiliyor (`StockService.insert` — testler, fikstürler,
   * elle kurulan veri) ve o yol deftere satır düşürmüyor. Payda oradan gelseydi böyle bir partide
   * fire oranı olmayan bir girişe bölünür ve saçmalardı.
   *
   * `initial_qty` zaten tam bu iş için var: *"partiye girişte yazılan miktar — tarihtir, değişmez"*
   * (`0006` künyesi). Defterin kendi mutabakatı ayrı bir testin konusu ve orada gerçek akış koşuyor.
   */
  const intakeQty = history.reduce((sum, batch) => sum + batch.initialQty, 0);
  const totalLost = history.reduce((sum, batch) => sum + (lostQty.get(batch.stockId) ?? 0), 0);
  const deliveredQty = history.reduce((sum, batch) => sum + batch.soldQty, 0);
  const pickedQty = picked.filter((row) => visible.has(row.stockId)).reduce((sum, row) => sum + row.qty, 0);
  const saleDays = sales.map((exit) => exit.at).sort();

  return {
    batches: history,
    truncated,
    flow: {
      intakeQty,
      deliveredQty,
      pickedQty,
      lostQty: history.reduce((sum, batch) => sum + batch.lostQty, 0),
      inTransitQty,
      // Elde kalan EKRANIN sayısıdır (görünüm), defterin farkı değil: ikisi ayrışırsa yanlış olan
      // liste değil okumadır ve o zaman akış satırı sorunu gizlemek yerine göstermeli.
      onHandQty: history.reduce((sum, batch) => sum + batch.physicalQty, 0),
    },
    rate: rate ? { windowDays: RATE_WINDOW_DAYS, ...rate } : null,
    daysOfCover: daysOfCover(input.availableQty, rate?.perDay ?? null, RATE_WINDOW_DAYS),
    averageLife: averageBatchLife(history.flatMap((batch) => (batch.lifeDays === null ? [] : [batch.lifeDays]))),
    loss: {
      qty: totalLost,
      percent: lossPercent(totalLost, intakeQty),
      byKind: [...byKind].map(([kind, qty]) => ({ kind, qty })).sort((a, b) => b.qty - a.qty),
      byReason: [...byReason].map(([reason, qty]) => ({ reason, qty })).sort((a, b) => b.qty - a.qty),
      countDiff,
    },
    // Aynı siparişin birden çok rezervasyon satırı olabilir (parti-çıpalı teklif + normal satır);
    // ekranda tek satır olarak toplanır — aynı siparişi iki kez listelemek bir tekrar olurdu.
    reservations: [...groupReservations(reservationRows, orderOf).values()].sort((a, b) => b.qty - a.qty),
    firstSaleAt: saleDays[0] ?? null,
    lastSaleAt: saleDays[saleDays.length - 1] ?? null,
  };
}
