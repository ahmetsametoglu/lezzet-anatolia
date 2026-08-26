import type { SupabaseClient } from '@supabase/supabase-js';
import {
  OrderItemBatchService,
  OrderService,
  ReservationService,
  StockAdjustmentService,
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
  hasLeftShelf,
  lossPercent,
} from '@lezzet/domain-core';
import type { StockAdjustmentReason } from '@lezzet/types';

/**
 * **BİR ÜRÜNÜN STOK GEÇMİŞİ** (22.30) — "bu üründen ne zaman, kaça girdi; ne kadarı satıldı, ne
 * kadarı çöpe gitti, partiler kaç günde eridi".
 *
 * ── NEDEN AĞIR DEĞİL: SORU TEK VARYANTIN ────────────────────────────────────
 * Katalog geneli istatistik ağır bir iştir; bu okuma **seçili tek boyun** geçmişini, tıklandığı an
 * çekiyor. Üç sorgu ve üçü de indeksli: partiler (`stock_variant_expiry_idx`), çıkışlar
 * (`order_item_variant_idx`), düzeltmeler (`stock_adjustment_stock_idx`). Hiçbiri kataloğu taramıyor
 * ve sayfa açılışında hiç çalışmıyor.
 *
 * ── ÇIKIŞ = HAZIRLIKTA YAZILAN GERÇEK ───────────────────────────────────────
 * Satış hızı `order_item`ten değil `order_item_batch`ten geliyor: birincisi "sipariş edildi",
 * ikincisi "depodan fiilen çıktı". Stok sorusunun paydası ikincisidir — hazırlanmamış sipariş malı
 * henüz raftan almadı.
 *
 * ── KARAR MOTORUN, OKUMA BURANIN ────────────────────────────────────────────
 * Hız, yeterlilik, ortalama ömür ve fire oranı `domain-core/stock/history`ten geliyor; bu dosya
 * satırları getirip soruyor. Ölçülemeyen her değer `null` döner ve ekran onu "—" diye çizer
 * (`CLAUDE §1` — ölçülemeyen değer sıfır değildir).
 */

/** Geçmişte görünecek parti sayısının tavanı — "son N giriş" bir bakıştır, defter değil. */
const BATCH_LIMIT = 12;

/** Hız penceresi (gün): mevsimsel dalgayı yutmayacak kadar kısa, tek bir günden etkilenmeyecek kadar uzun. */
const RATE_WINDOW_DAYS = 90;

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
  /** Bu partiden fiilen çıkan (satılan) adet — hazırlık kaydından. */
  soldQty: number;
  /** Bu partiden düşülen (imha/sayım) adet; işaretli toplam — geri alma azaltır. */
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
   * Girenden çıkanı ve düşüleni ayırınca elde kalması gereken sayı çıkar; ekran bunu tek satırda
   * gösteriyor. `intakeQty`/`lostQty` GÖRÜNEN partilerin toplamıdır — liste tavana dayandıysa
   * (`truncated`) eksik kalır ve ekran o zaman akış satırını çizmez, çünkü tutmayan bir denklem
   * tutuyormuş gibi görünür.
   *
   * `deliveredQty` varyant düzeyinde ve TÜM ZAMANLAR: parti listesinden bağımsız okunuyor.
   *
   * **`pickedQty` DENKLEME GİRMEZ** ve sebebi ölçüldü (14.08): hazırlanmış mal `physical_qty`de
   * DURUYOR — stok teslimde düşüyor (`deliver_order`), hazırlıkta değil (`record_preparation`).
   * Denklemden düşseydik her hazırlıktaki sipariş sahte bir "tutmuyor" uyarısı üretirdi.
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
  /** Penceredeki toplam çıkış ve günlük ortalama; hiç çıkış yoksa `null`. */
  rate: { windowDays: number; qty: number; perDay: number } | null;
  /**
   * Eldeki kullanılabilir mal kaç gün yeter — hız bilinmiyorsa `null`.
   * `capped` = gözlem penceresinde takılı; ötesi ölçüm değil tahmin olurdu.
   */
  daysOfCover: { days: number; capped: boolean } | null;
  /** Tükenmiş partilerin ortalama ömrü + kaç partiye dayandığı. */
  averageLife: { days: number; sampleCount: number } | null;
  /**
   * Fire: işaretli toplam adet, sebep kırılımı ve girene oranı (%).
   *
   * `qty`/`percent` yalnız GERÇEK kayıpları sayar (imha · hasar · kayıp) ve hep pozitiftir.
   * `byReason` hepsini taşır — iade ve sayım farkı da birer olaydır, kırılımda görünmeleri gerekir.
   * `countDiff` sayımın NET sapması (±): ayrı, çünkü *"ne kadarını çöpe attım"* ile *"saydığımda ne
   * kadar saptım"* iki farklı soru (22.34 · kullanıcı kararı 26.08).
   */
  loss: {
    qty: number;
    percent: number | null;
    byReason: Array<{ reason: StockAdjustmentReason; qty: number }>;
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
  const since = new Date(input.now.getTime() - RATE_WINDOW_DAYS * 86_400_000);

  // Üç okuma TEK turda: hepsi aynı anın gerçeği ve sırayla beklemelerinin sebebi yok.
  // `BATCH_LIMIT + 1` çekilir ki tavana dayanıldığı ANLAŞILSIN (sayfalamanın `limit+1` deseni).
  //
  // **Çıkışlar TÜM ZAMANLAR için okunuyor, pencere için değil** (22.31): "bu ürün hiç satıldı mı"
  // sorusunun cevabı 90 günle sınırlanamaz — pencereyi tarih süzgeci değil, aşağıdaki hesap kuruyor.
  const [batchRows, exits, reservationRows] = await Promise.all([
    stocks.listVariantHistory(input.variantId, input.warehouseIds, BATCH_LIMIT + 1),
    new OrderItemBatchService(db).exitsByVariant(input.variantId),
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

  // Düzeltmeler yalnız GÖRÜNEN partiler için: fire oranının paydası da aynı partilerin girişi —
  // iki tarafı farklı kümeden almak, oranı sessizce yanlış yapardı.
  const adjustments = stockIds.length > 0 ? await new StockAdjustmentService(db).listByStocks(stockIds) : [];

  // **Yoldaki mal** — kaynaktan düşmüş, hedefte henüz parti değil. Hiçbir `physical_qty`de
  // görünmediği için denklem onsuz tam o kadar sapıyordu (`inTransitFromStocks` künyesi).
  const inTransitLines = stockIds.length > 0 ? await new WarehouseTransferLineService(db).inTransitFromStocks(stockIds) : [];
  const inTransitQty = inTransitLines.reduce((sum, line) => sum + line.qty, 0);

  // Parti başına: bu partiden ne kadar çıktı ve en SON ne zaman çıktı.
  const soldQty = new Map<string, number>();
  const lastExit = new Map<string, string>();
  for (const exit of exits) {
    soldQty.set(exit.stockId, (soldQty.get(exit.stockId) ?? 0) + exit.qty);
    const seen = lastExit.get(exit.stockId);
    if (!seen || exit.at > seen) lastExit.set(exit.stockId, exit.at);
  }

  const lostQty = new Map<string, number>();
  const byReason = new Map<StockAdjustmentReason, number>();
  /** Sayımın NET sapması (±) — fire toplamının dışında, kendi satırında gösterilir. */
  let countDiff = 0;
  for (const row of adjustments) {
    // Kırılım HEPSİNİ taşır (iade de bir olaydır ve görünmeli); fire TOPLAMI ise yalnız gerçek
    // kayıpları sayar — iade restokunun karşılığı `order_item_batch`ten zaten düşülmüştür
    // (`countsAsLoss` künyesi). İkisini ayırmamak aynı iadeyi iki kez saydırıyordu.
    if (countsAsLoss(row.reason)) lostQty.set(row.stockId, (lostQty.get(row.stockId) ?? 0) + row.qty);
    // Sayım farkı AYRI toplanır (22.34 · kullanıcı kararı 26.08): iki yönlü olduğu için fire
    // toplamını eksiye düşürüyordu (`%−2,1` — hesap doğru, "FİRE" başlığı altında okunmuyordu).
    if (isCountDiff(row.reason)) countDiff += row.qty;
    byReason.set(row.reason, (byReason.get(row.reason) ?? 0) + row.qty);
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
    lostQty: lostQty.get(batch.id) ?? 0,
    // **Ömür yalnız TÜKENMİŞ partide yazılır.** Elde duran partinin son çıkışı bir bitiş değil, ara
    // bir andır; onu ömür sayarsak "3 günde eridi" diyen bir parti yarın hâlâ rafta olur.
    lifeDays: batch.physicalQty === 0 ? batchLifeDays(batch.createdAt, lastExit.get(batch.id) ?? null) : null,
  }));

  // Hız YALNIZ pencere içindeki çıkışlardan; liste tüm zamanları taşıyor, süzgeç burada.
  const inWindow = exits.filter((exit) => new Date(exit.at) >= since);
  const rate = dailyExitRate(inWindow, RATE_WINDOW_DAYS);

  const intakeQty = history.reduce((sum, batch) => sum + batch.initialQty, 0);
  const totalLost = history.reduce((sum, batch) => sum + batch.lostQty, 0);
  // Raftan AYRILMIŞ ↔ hazırlanmış ama hâlâ depoda: ikisi ayrı sayılır (`hasLeftShelf` künyesi).
  const deliveredQty = exits.filter((exit) => hasLeftShelf(exit.status)).reduce((sum, exit) => sum + exit.qty, 0);
  const pickedQty = exits.filter((exit) => !hasLeftShelf(exit.status)).reduce((sum, exit) => sum + exit.qty, 0);
  const saleDays = exits.map((exit) => exit.at).sort();

  return {
    batches: history,
    truncated,
    flow: {
      intakeQty,
      deliveredQty,
      pickedQty,
      lostQty: totalLost,
      inTransitQty,
      // Elde kalan EKRANIN sayısıdır (görünüm), partilerin toplamı değil: ikisi ayrışırsa yanlış olan
      // liste değil okumadır ve o zaman akış satırı sorunu gizlemek yerine göstermeli.
      onHandQty: history.reduce((sum, batch) => sum + batch.physicalQty, 0),
    },
    rate: rate ? { windowDays: RATE_WINDOW_DAYS, ...rate } : null,
    daysOfCover: daysOfCover(input.availableQty, rate?.perDay ?? null, RATE_WINDOW_DAYS),
    averageLife: averageBatchLife(history.flatMap((batch) => (batch.lifeDays === null ? [] : [batch.lifeDays]))),
    loss: {
      qty: totalLost,
      percent: lossPercent(totalLost, intakeQty),
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
