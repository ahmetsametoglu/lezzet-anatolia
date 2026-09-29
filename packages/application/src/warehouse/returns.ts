import { OrderItemReturnService, OrderItemService, OrderService, OrderStatusLogService, UserProfileService } from '@lezzet/database';
import type { WarehouseScope } from '@lezzet/domain-core';
import type { CourierReturnDraft, OrderItem, OrderItemReturn, ReturnDropLineContract } from '@lezzet/types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { readCourierReturn } from '../courier/return';
import { displayName, variantNames } from './names';

/**
 * Kurye dönüşünün okuma yarısı: bu depoda `returned` durumunda ve akıbeti bekleyen kalemi olan siparişler; anahtar
 * deponun rampasıdır, kuryenin günü değil, çünkü aynı rampaya iki kurye döner ve sipariş kuryesiz de dönebilir.
 * Karar telefonda verilir, masaüstü yalnız görünürlük sağlar; görünümde tutar yok, iadeyi yönetim akışı okur.
 */

/** Dönen kolinin tek satırı — şekli uç sözleşmesinden; akıbet satır satır, bir satırın adetleri farklı akıbetlerle işaretlenir. */
export type ReturnDropLine = ReturnDropLineContract;

/** Depoya geri gelen bir sipariş — D6'nın "dökümü". Tutar, adres, iletişim YOK. */
export interface ReturnDrop {
  orderId: string;
  referenceNo: string | null;
  /**
   * Malın döndüğü depo. Telefondaki depocu için gereksizdi (kapsamı zaten tek depo), masaüstündeki
   * yönetici için ZORUNLU: kapsamı bir liste olan kişiye "iki koli döndü" demek, hangi rampada
   * durduklarını söylememektir.
   */
  warehouseId: string;
  /** Malı getiren kuryenin KİMLİĞİ — rampa listesi bununla kümeler; adaşlar ada göre birleşirdi. */
  courierId: string | null;
  /** `null` = sipariş bir kuryeye hiç atanmamış (kargo/mağaza yolu). */
  courierName: string | null;
  /** Kuryenin kapıdaki serbest notu — depocunun akıbet kararının tek bağlamı. */
  note: string | null;
  /** `returned`'a geçiş anı; liste bununla sıralanır. Geçiş kaydı yoksa `null`. */
  returnedAt: string | null;
  lines: ReturnDropLine[];
}

/**
 * Depoya geri gelenler: yalnız akıbeti bekleyen kalemi olan siparişler, satırlarının tamamıyla, çünkü depocu neyi karara
 * bağladığını görmeden kalanı işaretleyemez. Ulaşılamayanlar burada yok: mal araçta kalır, sipariş `ready`e döner.
 *
 * @param db service-role istemci — çağıran enjekte eder (`serviceDb()`)
 */
export async function listWarehouseReturns(
  db: SupabaseClient,
  input: { warehouseId: string | readonly string[] | undefined; limit?: number },
): Promise<ReturnDrop[]> {
  const orders = await new OrderService(db).listByStatus(['returned'], {
    warehouseId: input.warehouseId,
    limit: input.limit ?? 50,
    // Tavan en yeniden dolar: en eskiden dolsaydı birikmiş bir rampada bugün dönen koli hiç görünmezdi.
    orderDirection: 'desc',
  });
  if (orders.length === 0) return [];

  const orderIds = orders.map((order) => order.id);
  const courierIds = [...new Set(orders.map((order) => order.courierId).filter((id): id is string => id !== null))];

  const [items, logs, couriers, returns] = await Promise.all([
    new OrderItemService(db).listByOrders(orderIds),
    new OrderStatusLogService(db).listByOrders(orderIds),
    // Boş listede servis kendi kısa devresini yapıyor (`listByIds`), ayrı bir dal gerekmiyor.
    new UserProfileService(db).listByIds(courierIds),
    new OrderItemReturnService(db).listByOrders(orderIds),
  ]);
  const names = await variantNames(db, items.map((item) => item.variantId));
  const toLine = toDropLine(names, returns);
  const courierOf = new Map(couriers.map((courier) => [courier.id, courier.name]));

  const drops: ReturnDrop[] = [];
  for (const order of orders) {
    const lines = items.filter((item) => item.orderId === order.id).map(toLine);
    // Ölçüt "hiç kalem var mı" değil, "AKIBETİ BEKLEYEN adet var mı": tamamı işaretlenmiş sipariş
    // depocunun işi olmaktan çıkmıştır ve listede kalırsa gerçek işi gölgeler.
    if (!lines.some((line) => line.pendingQty > 0)) continue;

    const returnedLog = logs.filter((log) => log.orderId === order.id && log.toStatus === 'returned').at(-1);
    drops.push({
      orderId: order.id,
      referenceNo: order.referenceNo,
      warehouseId: order.warehouseId,
      courierId: order.courierId,
      courierName: order.courierId ? (courierOf.get(order.courierId) ?? null) : null,
      note: returnedLog?.note ?? null,
      returnedAt: returnedLog?.createdAt ?? null,
      lines,
    });
  }

  // En YENİ dönüş önce: rampadaki koli hâlâ ortadayken işaretlenir. Geçiş kaydı olmayan satır
  // (elle yazılmış durum) en sona düşer — uydurma bir zaman vermektense sırayı kaybetsin.
  return drops.sort((a, b) => (b.returnedAt ?? '').localeCompare(a.returnedAt ?? ''));
}

/**
 * Kalem → döküm satırı; ad çözümü kuyruğun ortak okumasından (`names.ts`) gelir. İade ve imha karşılanan adedi zaten
 * düşürdüğü için bekleyen adet, karşılanandan müşteride kalan (jest) adedin çıkmasıdır.
 */
function toDropLine(names: Awaited<ReturnType<typeof variantNames>>, returns: readonly OrderItemReturn[]) {
  return (item: OrderItem): ReturnDropLine => ({
    orderItemId: item.id,
    name: displayName(names.get(item.variantId)),
    fulfilledQty: item.fulfilledQty,
    pendingQty: item.fulfilledQty - item.goodwillQty,
    returns: returns.flatMap((entry) =>
      entry.orderItemId === item.id && entry.disposition !== null
        ? [{ qty: entry.qty, disposition: entry.disposition, note: entry.note }]
        : [],
    ),
  });
}

// ── RAMPA LİSTESİ (D6) ────────────────────────────────────────────────────────

/**
 * Rampada teslim vermeyi bekleyen bir kurye — listenin tek satırı. Satır kuryedir, sefer değil: araç o gün tek kuryenin
 * yükünü taşır ve bir kez boşalır; sefere bağlasaydık aynı aracın serbest ürünü iki kez sayılırdı.
 */
export interface ReturningCourier {
  /** `null` = kuryeye hiç atanmamış dönüşlerin kümesi (kargo/tezgâh yolu). */
  courierId: string | null;
  courierName: string | null;
  vehicleLabel: string | null;
  pendingLines: number;
  boxesDownCount: number;
  boxesStayCount: number;
  freeGoodsQty: number;
  drivingRuns: number;
  lastReturnAt: string | null;
}

/**
 * Rampada kim bekliyor: akıbet bekleyen kalem, inecek kutu ya da araçta serbest ürünü olan kuryeler, kurye başına; yalnız
 * araçta malı olan kurye de listededir, yoksa serbest ürün hiçbir mutabakata girmezdi. Kapsam dışı kuryenin dönen malı da
 * bu rampadadır, o satır araç bölümü olmadan çizilir.
 *
 * @param db service-role istemci — çağıran enjekte eder (`serviceDb()`)
 */
export async function listReturningCouriers(
  db: SupabaseClient,
  input: { warehouseId: string; scope: WarehouseScope },
): Promise<ReturningCourier[]> {
  const drops = await listWarehouseReturns(db, { warehouseId: input.warehouseId });

  // Adaylar: bu tesisin kuryeleri + dönüşlerde adı geçen kuryeler. İkinci küme birinciyi kapsamaz
  // (kapsam dışı kurye) ve birinci ikinciyi kapsamaz (dönüşü olmayan ama araçta malı olan kurye).
  const staff = await new UserProfileService(db).listByRole('courier');
  const candidateIds = new Set<string>([
    ...staff.filter((person) => person.warehouseIds.includes(input.warehouseId)).map((person) => person.id),
    ...drops.map((drop) => drop.courierId).filter((id): id is string => id !== null),
  ]);

  const rows: ReturningCourier[] = [];
  for (const courierId of candidateIds) {
    const own = drops.filter((drop) => drop.courierId === courierId);
    const draft = await readCourierReturn(db, { courierId, warehouseId: input.warehouseId, scope: input.scope });
    const van = 'status' in draft ? null : draft;

    const row: ReturningCourier = {
      courierId,
      courierName: van?.courierName ?? own[0]?.courierName ?? null,
      vehicleLabel: van?.vehicleLabel ?? null,
      pendingLines: pendingLinesOf(own),
      boxesDownCount: countBoxes(van?.boxesDown),
      boxesStayCount: countBoxes(van?.boxesStay),
      freeGoodsQty: (van?.freeGoods ?? []).reduce((sum, line) => sum + line.onVanQty, 0),
      drivingRuns: van?.drivingRuns ?? 0,
      lastReturnAt: own[0]?.returnedAt ?? null,
    };
    if (row.pendingLines > 0 || row.boxesDownCount > 0 || row.freeGoodsQty > 0) rows.push(row);
  }

  // Kuryesiz dönüşler TEK satırda: kargo ya da tezgâh yoluyla dönen siparişin kuryesi yoktur ama
  // akıbeti yine işaretlenir. Araç ve kutu bölümü olmadığı için sayaçları sıfırdır.
  const orphans = drops.filter((drop) => drop.courierId === null);
  if (orphans.length > 0) {
    rows.push({
      courierId: null,
      courierName: null,
      vehicleLabel: null,
      pendingLines: pendingLinesOf(orphans),
      boxesDownCount: 0,
      boxesStayCount: 0,
      freeGoodsQty: 0,
      drivingRuns: 0,
      lastReturnAt: orphans[0]?.returnedAt ?? null,
    });
  }

  // En YENİ dönüş önce (dönüş kuyruğunun kendi sırası). Dönüşü olmayan satır — yalnız araçta malı
  // olan kurye — sona düşer: uydurma bir zaman vermektense sırayı kaybetsin (`listWarehouseReturns`
  // ile aynı kural).
  return rows.sort((a, b) => (b.lastReturnAt ?? '').localeCompare(a.lastReturnAt ?? ''));
}

/** Tek kuryenin dönüşü — döküm + araç, tek okumada (`WarehouseCourierReturnResponse`in şekli). */
export interface ReturningCourierDetail extends Omit<ReturningCourier, 'pendingLines' | 'boxesDownCount' | 'boxesStayCount' | 'freeGoodsQty' | 'lastReturnAt'> {
  vehicleWarehouseId: string | null;
  freeGoods: CourierReturnDraft['freeGoods'];
  boxesDown: CourierReturnDraft['boxesDown'];
  boxesStay: CourierReturnDraft['boxesStay'];
  drops: ReturnDrop[];
}

/**
 * Bir kuryenin rampadaki her şeyi: ekran tek dokunuşla iki kapının işini yazdığı için iki cevap burada birleşir.
 * `courierId: null` kuryesiz kümedir; yalnız döküm döner, araç bölümleri boştur.
 */
export async function readReturningCourier(
  db: SupabaseClient,
  input: { courierId: string | null; warehouseId: string; scope: WarehouseScope },
): Promise<ReturningCourierDetail | { status: 'forbidden'; reason: 'out_of_scope' | 'not_courier' }> {
  const drops = (await listWarehouseReturns(db, { warehouseId: input.warehouseId })).filter(
    (drop) => drop.courierId === input.courierId,
  );

  if (input.courierId === null) {
    return { courierId: null, courierName: null, vehicleLabel: null, vehicleWarehouseId: null, drivingRuns: 0, freeGoods: [], boxesDown: [], boxesStay: [], drops };
  }

  const draft = await readCourierReturn(db, { courierId: input.courierId, warehouseId: input.warehouseId, scope: input.scope });
  /* Kurye künyesi çözülemezse araç bölümleri boş döner ama döküm durur: ret araç verisini korur, döküm zaten bu deponun
     rampasıdır. Döküm de boşsa ret olduğu gibi geçer, orada doğru cevap "senin değil"dir. */
  if ('status' in draft) {
    if (drops.length === 0) return draft;
    return {
      courierId: input.courierId,
      courierName: drops[0]?.courierName ?? null,
      vehicleLabel: null,
      vehicleWarehouseId: null,
      drivingRuns: 0,
      freeGoods: [],
      boxesDown: [],
      boxesStay: [],
      drops,
    };
  }

  return {
    courierId: draft.courierId,
    courierName: draft.courierName,
    vehicleLabel: draft.vehicleLabel,
    vehicleWarehouseId: draft.vehicleWarehouseId,
    drivingRuns: draft.drivingRuns,
    freeGoods: draft.freeGoods,
    boxesDown: draft.boxesDown,
    boxesStay: draft.boxesStay,
    drops,
  };
}

/** Akıbeti BEKLEYEN kalem sayısı — işaretlenmiş satır işin dışındadır. */
function pendingLinesOf(drops: readonly ReturnDrop[]): number {
  return drops.reduce((sum, drop) => sum + drop.lines.filter((line) => line.pendingQty > 0).length, 0);
}

/** Sipariş başına gruplu kutuların TOPLAM adedi — kart "kaç kutu" der, "kaç sipariş" değil. */
function countBoxes(cards: ReadonlyArray<{ boxes: readonly unknown[] }> | undefined): number {
  return (cards ?? []).reduce((sum, card) => sum + card.boxes.length, 0);
}
