import {
  AddressService,
  DeliveryRunCloseService,
  DeliveryRunService,
  DeliveryZoneService,
  OrderBoxService,
  OrderItemService,
  OrderService,
  OrderStatusLogService,
  ProductService,
  ProductVariantService,
  SettingsService,
  UserProfileService,
  WarehouseService,
} from '@lezzet/database';
import { doorCheckOf } from '@lezzet/address';
import {
  canAccessWarehouse,
  canTransition,
  deliveryRunReferenceNo,
  sortBySequence,
  warehouseScope,
  whatsAppLink,
  type MessageLocale,
} from '@lezzet/domain-core';
import { amountDueCents } from './door-payment';
import { vehicleLabelOf } from './vehicle-label';
import { customerCardsOf } from './names';
import { listCourierRoutes } from './routes';
import { ensureStopOrder } from './stop-order';
import { notifyStatusEffect, type OrderEffects } from '../order/effects';
import { logger } from '@lezzet/observability';
import { resolveLocalizedText } from '@lezzet/types';
import type {
  DiscardDeliveryRunResult,
  DoorCheck,
  Order,
  OrderItem,
  OrderStatusLog,
  StopOrderMetric,
  StopOrderPrecision,
  StopOrderSource,
  SettingScopeContext,
} from '@lezzet/types';
import type { SupabaseClient } from '@supabase/supabase-js';

/*
  Kurye para görür ama yalnız tahsil edeceği tutarı: maliyet, kâr ve müşterinin vade durumu görünüm modelinde hiç yoktur. "Yalnız
  kendi teslimatları" imzada durur, `courierId` süzgeç değil zorunlu parametredir.
*/

export interface CourierStop {
  orderId: string;
  referenceNo: string | null;
  customerName: string;
  /** Kapıyı açacak kişi; `null` hesap sahibiyle aynı demektir. `customerName`in yerine geçmez: ödemenin muhatabı hesap sahibidir. */
  recipient: string | null;
  /** Kapıda teslim onayı beklentisini baştan kurar. */
  channel: Order['channel'];
  /** Sipariş anındaki kopyadan; adres sonradan düzelse de sabit. */
  address: string | null;
  phone: string | null;
  /** Müşterinin dilinde "yoldayım"; numara yoksa `null` ve düğme çizilmez. */
  whatsAppLink: string | null;
  doorCheck: DoorCheck;
  payment: {
    /** `null`: önceden ödenmiş, para konuşulmaz. Birim cent. */
    dueAmountCents: number | null;
    expectedMethod: Order['paymentMethod'];
    /**
     * `null`: kurye bu durakta para almadı. Kapanış görünümüyle (`delivery_run_collection`) aynı kuralı izler ki iki ekran aynı
     * parayı farklı söylemesin.
     */
    collectedAtDoorCents: number | null;
  };
  /** Araçtan doğru koliyi almak için. */
  itemCount: number;
  contentSummary: string;
  /** Kısmi iade `orderItemId` ister; satırlar özetle aynı kalem kayıtlarından türer, ikinci okuma yok. */
  items: CourierStopItem[];
  /** Sistemin iç durumu değil, kuryenin gördüğü hâl. */
  outcome: StopOutcome;
  /** Sefere damgalı ama kutusu yok; yükleme ekranı "kutu yok"u "hazırlanmadı" diye okuyabilsin. */
  awaitingPreparation: boolean;
  /** Durak teslimat değil geri getirme işidir; kutusu binmemiş iptaller listeye girmez. */
  cancelled: boolean;
  /** `null`: sonuçlanmadı. Ulaşılamayanda son `out_for_delivery → ready` dönüşünün damgasıdır. */
  settledAt: string | null;
  /** Kuryenin sonuca yazdığı serbest sebep; aynı geçişin notu. */
  outcomeNote: string | null;
  /** Kutu okutması sayılmaz: onu sunucu kurar, kapıda kimse imzalamaz. */
  hasProof: boolean;
  /** Ulaşılamayan durak listede kalır ve yeniden denenir. */
  attempts: number;
  /** Yükleme sayacı `loadedAt` damgalarından türer; kapıdaki okutma kodu bu listeyle yerelde eşler, son doğrulama sunucuda. */
  boxes: Array<{ boxNo: number; code: string; loadedAt: string | null }>;
  /** 1'den başlar; `null` sıra bilinmiyor demektir ve uydurulmaz. */
  stopSeq: number | null;
  /** Liste sefere göre gruplanır. */
  runId: string;
  /** Rota adı; `null`: bölge kaydı okunamadı. */
  runLabel: string | null;
}

export interface CourierStopItem {
  orderItemId: string;
  /** "Ürün (boy)", Türkçe. */
  name: string;
  /** Sipariş edilen adet; kapıda eksik çıkan bundan indirilir. */
  qty: number;
  /** Birim fiyat ve indirim payı birlikte: ekran geri verilen malın tahsilattan ne kadar düşeceğini hesaplar. */
  unitPriceCents: number;
  lineDiscountAmountCents: number;
  /** Kısmi teslim buradan okunur: `delivered` durakta `fulfilledQty < qty` ise bir kalem araçta kalmıştır. */
  fulfilledQty: number;
}

/** "Ulaşılamadı" ile "sıra gelmedi" ikisi de `ready`dir; ayrım ayrı kolondan değil geçiş geçmişinden türer. */
export type StopOutcome = 'pending' | 'delivered' | 'unreachable' | 'refused';

/** Sonuçlanmış duraklar da listede kalır: "ne yaptım" sorusunun cevabı ve ulaşılamayanların dönüş listesi. */
export async function listCourierDay(
  db: SupabaseClient,
  input: {
    courierId: string;
    date?: string;
    zoneId?: string;
    /** Verilirse gün süzgeci uygulanmaz: dünkü seferin kapanışı bugünden açılabilmeli. */
    runId?: string;
    /** Araçtaki bütün seferler; gün ve rota süzgeçleri uygulanmaz, çünkü yarının seferi de araçta durabilir. */
    runIds?: readonly string[];
    locale?: MessageLocale;
  },
): Promise<CourierStop[]> {
  const date = input.date ?? new Date().toISOString().slice(0, 10);
  const orders = await new OrderService(db).listByCourier(
    input.courierId,
    input.runIds
      ? { deliveryRunIds: input.runIds }
      : input.runId
        ? { deliveryRunId: input.runId }
        : { deliveryDate: date, deliveryZoneId: input.zoneId },
  );
  if (orders.length === 0) return [];

  const orderIds = orders.map((order) => order.id);
  // Kutular da aynı paralel turda okunur, ardından değil.
  const [items, logs, customers, addresses, allBoxes] = await Promise.all([
    new OrderItemService(db).listByOrders(orderIds),
    new OrderStatusLogService(db).listByOrders(orderIds),
    customerCardsOf(db, orders),
    addressTexts(db, orders),
    new OrderBoxService(db).listByOrders(orderIds),
  ]);
  const names = await variantNames(db, items);

  /* Listede birden çok seferin durağı olabilir; sıra ve rota adı sefer başına çözülür. */
  const runIdsInList = [...new Set(orders.map((order) => order.deliveryRunId).filter((id): id is string => id !== null))];
  const runService = new DeliveryRunService(db);
  const runRows = await Promise.all(runIdsInList.map((id) => runService.getById(id)));
  const runById = new Map(runRows.filter((row): row is NonNullable<typeof row> => row !== null).map((row) => [row.id, row]));

  /* Gün ortasında sefere katılan sipariş sırasız kalmasın diye sıra burada tazelenir; bayatlığın ölçütü zaman değil kümedir.
     `ensureStopOrder` fırlatmaz, hesap düşse de gün listesi çizilir. */
  const refreshed = await Promise.all(
    [...runById.values()]
      .filter((run) => run.returnedAt === null)
      .map(async (run) => {
        const outcome = await ensureStopOrder(db, { runId: run.id, actorId: input.courierId });
        return outcome.status === 'written' ? runService.getById(run.id) : null;
      }),
  );
  for (const row of refreshed) if (row) runById.set(row.id, row);
  const zoneNames = await zoneNamesOf(db, [...new Set([...runById.values()].map((row) => row.deliveryZoneId))]);
  /* Seferi olmayan durağın yedeği: süzgeçteki ya da listedeki ilk sefer. */
  const runId = input.runId ?? runIdsInList[0] ?? null;
  const run = runId ? (runById.get(runId) ?? null) : null;

  const stops: CourierStop[] = orders.map((order) => {
    const lines = items.filter((item) => item.orderId === order.id);
    const customer = customers.get(order.customerId);
    const attempts = failedAttempts(logs, order.id);
    const outcome = outcomeOf(order.status, attempts);
    const settled = settlementLog(logs, order.id, outcome);
    const place = addresses.get(order.id) ?? null;
    /* Adreste alıcı yazılıysa hesabın numarası başkasınındır (hediye, iş adresi); yedek numara yalnız alıcı yoksa kullanılır.
       Alıcısı olup numarası olmayan eski kayıtta cevap "bilinmiyor"dur ve ekran arama düğmesini çizmez. */
    const namedRecipient = place?.recipient != null;
    const doorPhone = place?.phone ?? (namedRecipient ? null : customer?.phone ?? null);

    return {
      orderId: order.id,
      referenceNo: order.referenceNo,
      customerName: customer?.name ?? '—',
      // `null`: kurye müşteri adını sorar.
      recipient: place?.recipient ?? null,
      channel: order.channel,
      address: place?.text ?? null,
      phone: doorPhone,
      whatsAppLink: whatsAppLink({
        phone: doorPhone ?? undefined,
        locale: input.locale ?? 'fr',
        customerName: place?.recipient ?? customer?.name,
      }),
      /* Anlık görüntüden okunur: kuryenin gittiği adres siparişin yazıldığı andaki adrestir. Sevkiyat masası da aynı fonksiyonu
         kullanır. */
      doorCheck: doorCheckOf(order.addressSnapshot as Record<string, unknown> | null),
      payment: {
        dueAmountCents: amountDueCents(order, lines),
        expectedMethod: order.paymentMethod,
        collectedAtDoorCents: collectedAtDoorCents(order),
      },
      itemCount: lines.length,
      contentSummary: summarize(lines, names),
      items: lines.map((line) => ({
        orderItemId: line.id,
        name: names.get(line.variantId) ?? '—',
        qty: line.qty,
        fulfilledQty: line.fulfilledQty,
        unitPriceCents: line.unitPriceCents,
        lineDiscountAmountCents: line.lineDiscountAmountCents,
      })),
      outcome,
      awaitingPreparation: order.status === 'confirmed' || order.status === 'preparing',
      cancelled: order.status === 'cancelled',
      /* Saat ve sebep aynı kayıttan: ikisi aynı olayın iki yüzü. */
      settledAt: settled?.createdAt ?? null,
      outcomeNote: settled?.note ?? null,
      hasProof: hasVisualProof(order),
      attempts,
      boxes: allBoxes
        .filter((box) => box.orderId === order.id)
        .map((box) => ({ boxNo: box.boxNo, code: box.code, loadedAt: box.loadedAt })),
      // Numara dizideki yerden değil sıralanmış listedeki yerden gelir; aşağıda yazılır.
      stopSeq: null,
      runId: order.deliveryRunId ?? runId ?? '',
      runLabel: order.deliveryRunId
        ? (zoneNames.get(runById.get(order.deliveryRunId)?.deliveryZoneId ?? '') ?? null)
        : (run ? (zoneNames.get(run.deliveryZoneId) ?? null) : null),
    };
  });

  /*
    İptal edilen durak yalnız kutusu araçtaysa kalır, çünkü o zaman mal depoya geri getirilecektir; kutusuz iptal yalnız gürültüdür.
    Süzgeç sıralamadan önce, yoksa numaralar elenen durağı da sayardı.
  */
  const kalanlar = stops.filter((stop) => !stop.cancelled || stop.boxes.some((box) => box.loadedAt !== null));

  return applyStopOrder(kalanlar, runById);
}

/** Grup başlıkları için; doğal tavanlı küme, tek tur. */
async function zoneNamesOf(db: SupabaseClient, zoneIds: readonly string[]): Promise<Map<string, string>> {
  if (zoneIds.length === 0) return new Map();
  const service = new DeliveryZoneService(db);
  const rows = await Promise.all(zoneIds.map((id) => service.getById(id)));
  return new Map(rows.filter((row): row is NonNullable<typeof row> => row !== null).map((row) => [row.id, row.name]));
}

/**
 * Sıralamayı sunucu yapar ki iki yüzey aynı günü farklı dizmesin. Sıra yoksa numara uydurulmaz: kurye "3" görünce onu günün
 * üçüncü durağı sanar.
 */
function applyStopOrder(
  stops: readonly CourierStop[],
  runById: ReadonlyMap<string, { deliveryZoneId: string; deliveryDate: string; stopOrder: readonly string[] | null }>,
): CourierStop[] {
  /*
    Her seferin kendi sırası var; gruplar seferin gününe göre dizilir. Aynı günün iki seferi arasında öncelik uydurulmaz, hangi
    rotayı önce süreceği kuryenin kararı.
  */
  const groups = new Map<string, CourierStop[]>();
  for (const stop of stops) {
    const bucket = groups.get(stop.runId);
    if (bucket) bucket.push(stop);
    else groups.set(stop.runId, [stop]);
  }

  const ordered = [...groups.keys()].sort((a, b) => {
    const dateA = runById.get(a)?.deliveryDate ?? '';
    const dateB = runById.get(b)?.deliveryDate ?? '';
    return dateA === dateB ? 0 : dateA < dateB ? -1 : 1;
  });

  return ordered.flatMap((id) => {
    const bucket = groups.get(id)!;
    const stopOrder = runById.get(id)?.stopOrder ?? [];
    if (stopOrder.length === 0) return bucket;
    return sortBySequence(bucket, (stop) => stop.orderId, stopOrder).map(({ item, seq }) => ({ ...item, stopSeq: seq }));
  });
}

/** Sözleşme de uuid istiyor (`doorAccountId`). */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Gün başına tekil olduğu için durak dizisinden ayrı okunur. Kullanılamaz ayar `null` döner ve tahsilat kapısı kapalı kalır: para
 * olmayan bir hesaba yazılmaz; log'a anahtar yazılır, değer yazılmaz.
 */
export async function readDoorCashAccountId(db: SupabaseClient, scope: SettingScopeContext = {}): Promise<string | null> {
  // Kapsam: her depo bir kasadır (DOMAIN §17); gel-al tezgâhı deponun satırını, kurye küresel satırı okur.
  const raw = await new SettingsService(db).get<unknown>('door_cash_account_id', null, scope);
  if (typeof raw !== 'string') {
    if (raw !== null && raw !== undefined) {
      logger.warn({ setting: 'door_cash_account_id' }, 'kapı kasası ayarı metin değil — tahsilat kapısı kapalı');
    }
    return null;
  }

  const value = raw.trim();
  if (value.length === 0) return null;
  if (!UUID_PATTERN.test(value)) {
    logger.warn({ setting: 'door_cash_account_id' }, 'kapı kasası ayarı hesap kimliği değil — tahsilat kapısı kapalı');
    return null;
  }
  return value;
}

/**
 * Kısmi başarı görünür: üç durak yola çıkıp dördüncüsü çıkmazsa kurye o durakta neden teslim yazamadığını bilmeli.
 * `already_started` hata değil; rota ve gün başına tek sefer var.
 */
export type CourierDayStart =
  | {
      status: 'ok';
      date: string;
      run: CourierDayRunView;
      /** `ready → out_for_delivery` yazılanlar. */
      started: string[];
      /** Zaten yoldaydı; ikinci çağrı hata değil. */
      alreadyOut: string[];
      /** Araya biri girdi: `ready` okundu, yazarken durum değişmişti. */
      stale: { orderId: string; currentStatus: Order['status'] }[];
      /** Henüz hazırlanmadı ya da gün içinde kapandı. */
      skipped: { orderId: string; currentStatus: Order['status'] }[];
      /** Tüm kutuları binene kadar "yolda" yazılmaz, geçişi son okutma yazar. `skipped`ten ayrı: çare hazırlanmak değil okutmak. */
      awaitingBoxes: { orderId: string; loadedBoxes: number; boxCount: number }[];
    }
  | { status: 'already_started'; runId: string; referenceNo: string; courierId: string; mine: boolean }
  /** Sefer kuruldu ama yola çıkmadı, çünkü kurye başka seferi sürüyor; künye ekran "önce şunu kapat" diyebilsin diye. */
  | { status: 'another_running'; runId: string; referenceNo: string }
  /** Araç aynı anda tek kuryenin yükünü taşır. Alanlar `null` olabilir: kural veride de duruyor ve yarışta künye okunamayabilir. */
  | { status: 'vehicle_taken'; runId: string | null; referenceNo: string | null }
  /** Kuryenin açık seferi başka araçta; karışırsa "araçtaki seferler" iki aracın yükünü tek liste gibi gösterirdi. */
  | { status: 'vehicle_mismatch'; runId: string | null; referenceNo: string | null; vehicleId: string | null }
  | { status: 'route_required' }
  | { status: 'no_route' };

/**
 * Kurulmuş sefer bir niyettir; araçtan çıkarılamasaydı yanlış rotanın tek çıkışı onu başlatıp kapatmak, bedeli de müşteriye giden
 * bildirim olurdu. İş tek anın işi olduğu için RPC'de; burada karar yok.
 */
export async function discardCourierRun(
  db: SupabaseClient,
  input: { runId: string; courierId: string },
): Promise<DiscardDeliveryRunResult> {
  return new DeliveryRunService(db).discard(input);
}

/** `CourierRunBriefSchema`nın aynası. */
export interface CourierRunBriefView {
  runId: string;
  referenceNo: string;
  zoneId: string;
  zoneName: string | null;
  vehicleId: string | null;
  /** `null`: araçsız sefer. */
  vehicleLabel: string | null;
  /** Araç birden çok günün seferini taşıyabilir. */
  deliveryDate: string;
  departedAt: string | null;
  returnedAt: string | null;
  closed: boolean;
}

/** Depo adı künyede değil burada, çünkü rota seçim listesinde o değer rota düzeyinde zaten var. */
export interface CourierDayRunView extends CourierRunBriefView {
  warehouseName: string | null;
  /** `null`: sıra hiç hesaplanmadı. */
  stopOrder: {
    source: StopOrderSource;
    metric: StopOrderMetric;
    precision: StopOrderPrecision;
    generatedAt: string;
    sequenced: number;
    unsequenced: number;
  } | null;
}

/**
 * Claim RPC'de, çünkü iki kuryenin yarışı veride çözülür; durum geçişi burada, çünkü kenarın izni motorundur (`canTransition`).
 * Yalnız `ready` sipariş yola çıkar: hazırlığı atlanan siparişin parti kaydı yoktur.
 */
export async function startCourierDay(
  db: SupabaseClient,
  input: {
    courierId: string;
    date?: string;
    zoneId?: string;
    vehicleId?: string | null;
    depart?: boolean;
    /** Yola çıkan her durağın müşteri haberi buradan gider; geçirilmezse kapı süreç başına bir kez uyarır. */
    effects?: OrderEffects;
  },
): Promise<CourierDayStart> {
  const date = input.date ?? new Date().toISOString().slice(0, 10);
  /*
    Kurma ile başlatma aynı rota çözümünü, claim'i ve kapsam kararını paylaştığı için tek kapıdadır; `depart` bayrağı ikisini ayırır.
  */
  const depart = input.depart ?? true;

  // Depo kapsamı istemciden değil kuryenin profilinden çözülür; profil yoksa kapsam da yoktur.
  const profile = await new UserProfileService(db).getById(input.courierId);
  const scope = profile ? warehouseScope(profile.roles, profile.warehouseIds) : ({ kind: 'none' } as const);

  // Rota verilmemişse seçim listesiyle aynı kaynaktan çözülür; tek adayda soru sorulmaz.
  let zoneId = input.zoneId ?? null;
  if (!zoneId) {
    const routes = await listCourierRoutes(db, { date, scope });
    if (routes.length === 0) return { status: 'no_route' };
    if (routes.length > 1) return { status: 'route_required' };
    zoneId = routes[0]!.zoneId;
  } else {
    // Verilen kimlik de kapsam süzgecinden geçer: kapsam dışı rota bayat ekranın ya da elle kurulmuş isteğin işaretidir.
    const zone = await new DeliveryZoneService(db).getById(zoneId);
    if (!zone || !canAccessWarehouse(scope, zone.warehouseId)) return { status: 'no_route' };
  }

  const runs = new DeliveryRunService(db);
  const year = Number(date.slice(0, 4));

  // Nadir referans çakışması yeni kodla yeniden denenir.
  let start = await runs.open({
    zoneId,
    date,
    courierId: input.courierId,
    referenceNo: deliveryRunReferenceNo(year),
    vehicleId: input.vehicleId ?? null,
    actorId: input.courierId,
  });
  for (let attempt = 0; !start.ok && start.reason === 'reference_collision' && attempt < 3; attempt += 1) {
    start = await runs.open({
      zoneId,
      date,
      courierId: input.courierId,
      referenceNo: deliveryRunReferenceNo(year),
      vehicleId: input.vehicleId ?? null,
      actorId: input.courierId,
    });
  }

  if (!start.ok) {
    if (start.reason === 'already_started' && start.runId && start.referenceNo && start.courierId) {
      return {
        status: 'already_started',
        runId: start.runId,
        referenceNo: start.referenceNo,
        courierId: start.courierId,
        mine: start.courierId === input.courierId,
      };
    }
    /*
      Araç retleri adıyla geçer, `no_route`a katlanmaz: çareleri farklıdır ve rota listesinde kuryenin değiştirebileceği bir şey yok.
    */
    if (start.reason === 'vehicle_taken') {
      return { status: 'vehicle_taken', runId: start.runId ?? null, referenceNo: start.referenceNo ?? null };
    }
    if (start.reason === 'vehicle_mismatch') {
      return {
        status: 'vehicle_mismatch',
        runId: start.runId ?? null,
        referenceNo: start.referenceNo ?? null,
        vehicleId: start.vehicleId ?? null,
      };
    }
    // Silinmiş rota kimliği ve tükenen referans denemesi aynı cevaba çıkar: başlatılacak rota yok, ekran seçim listesine döner.
    return { status: 'no_route' };
  }

  /* Kurulmuş sefer araçta bekler ve `departedAt` boş kalır; ekran onu "araçta, başlamadı" diye gösterir. */
  const departed = depart ? await runs.depart({ runId: start.runId!, courierId: input.courierId }) : null;
  /* Aynı anda tek sefer kuralı veride; sefer kurulu kalır ve geri sarılmaz, çünkü kurma zaten istenen şeydi. */
  if (departed !== null && departed.ok === false && departed.reason === 'another_running') {
    return { status: 'another_running', runId: departed.runId!, referenceNo: departed.referenceNo! };
  }

  // Künye başlatma anından itibaren "hangi aracı süreceğim" sorusunu cevaplasın diye araç adını taşır.
  const [startedZone, startedVehicleLabel] = await Promise.all([
    new DeliveryZoneService(db).getById(zoneId),
    vehicleLabelOf(db, input.vehicleId ?? null),
  ]);
  const startedWarehouseName = startedZone ? await warehouseNameOf(db, startedZone.warehouseId) : null;
  const result: CourierDayStart = {
    status: 'ok',
    date,
    run: {
      runId: start.runId!,
      referenceNo: start.referenceNo!,
      zoneId,
      zoneName: startedZone?.name ?? null,
      vehicleId: input.vehicleId ?? null,
      vehicleLabel: startedVehicleLabel,
      warehouseName: startedWarehouseName,
      deliveryDate: date,
      departedAt: departed?.departedAt ?? null,
      returnedAt: null,
      closed: false,
      /* Sıra bu anda henüz hesaplanmadı; ekran künyeyi bir sonraki okumada alır. */
      stopOrder: null,
    },
    started: [],
    alreadyOut: [],
    stale: [],
    skipped: [],
    awaitingBoxes: [],
  };

  // Araca binmeyen kutu "yolda" görünmez; kutular sipariş başına değil tek turda okunur.
  const claimedIds = (start.claimed ?? []).map((claim) => claim.orderId);
  const boxesByOrder = new Map<string, { loaded: number; total: number }>();
  for (const box of await new OrderBoxService(db).listByOrders(claimedIds)) {
    const entry = boxesByOrder.get(box.orderId) ?? { loaded: 0, total: 0 };
    entry.total += 1;
    if (box.loadedAt !== null) entry.loaded += 1;
    boxesByOrder.set(box.orderId, entry);
  }

  /* Geçişler yalnız yola çıkarken yazılır: kurulan seferde mal henüz yolda değildir ve müşteriye haber gitmez. */
  const orders = new OrderService(db);
  for (const claim of depart ? (start.claimed ?? []) : []) {
    if (claim.status === 'out_for_delivery') {
      result.alreadyOut.push(claim.orderId);
      continue;
    }
    if (claim.status !== 'ready' || !canTransition(claim.status, 'out_for_delivery').allowed) {
      result.skipped.push({ orderId: claim.orderId, currentStatus: claim.status });
      continue;
    }

    /*
      Geçişi son kutunun okutması yazar; kutuları zaten yüklüyse geçiş burada. Kutusuz rota siparişi bir veri hatasıdır ve sessizce
      yola çıkmaz, `awaitingBoxes`ta görünür.
    */
    const boxState = boxesByOrder.get(claim.orderId);
    if (boxState === undefined || boxState.loaded < boxState.total) {
      result.awaitingBoxes.push({
        orderId: claim.orderId,
        loadedBoxes: boxState?.loaded ?? 0,
        boxCount: boxState?.total ?? 0,
      });
      continue;
    }

    const transitioned = await orders.transition({
      orderId: claim.orderId,
      from: claim.status,
      to: 'out_for_delivery',
      actorId: input.courierId,
    });
    if (transitioned.ok) {
      result.started.push(claim.orderId);
      /* Haber durak başına; zaten yoldaki durak `alreadyOut`a düştüğü için yeniden başlatmada haber tekrarlanmaz. */
      await notifyStatusEffect(input.effects, claim.orderId, 'out_for_delivery');
    } else {
      result.stale.push({ orderId: claim.orderId, currentStatus: transitioned.currentStatus });
    }
  }

  /* Sıra hesabı başlatmayı durdurmaz: kapı fırlatmaz, düşerse sıra `null` kalır ve ekran "sırasız" der. */
  await ensureStopOrder(db, { runId: result.run.runId, actorId: input.courierId });

  return result;
}

/**
 * Süzgeç gün değil "kapanmamış": yarının seferi bugünden yüklenebilir ve güne süzülseydi kutuları hiçbir ekranda görünmezdi. Sıra
 * seferin günü, bugünkü üstte.
 */
export async function readCourierRuns(
  db: SupabaseClient,
  input: { courierId: string },
): Promise<CourierDayRunView[]> {
  const runs = await new DeliveryRunService(db).listByCourier(input.courierId, {});
  if (runs.length === 0) return [];

  const closes = await new DeliveryRunCloseService(db).listByRuns(runs.map((run) => run.id));
  const closedIds = new Set(closes.map((close) => close.deliveryRunId));
  const onVan = runs
    .filter((run) => !closedIds.has(run.id))
    .sort((a, b) => (a.deliveryDate === b.deliveryDate ? 0 : a.deliveryDate < b.deliveryDate ? -1 : 1));

  /* Sırasız durak sayısı künyeye yazılır: sessizce sona atılan durak kuryenin atladığı duraktır. */
  const stopsOfRuns = await new OrderService(db).listByRuns(onVan.map((run) => run.id));
  const unsequencedPerRun = new Map<string, number>();
  for (const order of stopsOfRuns) {
    const run = onVan.find((candidate) => candidate.id === order.deliveryRunId);
    if (!run || run.stopOrder.includes(order.id)) continue;
    unsequencedPerRun.set(run.id, (unsequencedPerRun.get(run.id) ?? 0) + 1);
  }

  return Promise.all(onVan.map((run) => detailOf(db, run, false, unsequencedPerRun.get(run.id) ?? 0)));
}

/**
 * Açık sefer sunucudan gelir, uygulama yeniden başlasa da kaybolmaz. Önce yola çıkmış ve kapanmamış sefer seçilir, çünkü "hangi
 * seferi sürüyorum" sorusuna `/day` ucuyla aynı cevap verilmeli.
 */
export async function readCourierRun(
  db: SupabaseClient,
  input: { courierId: string; date?: string },
): Promise<CourierDayRunView | null> {
  const date = input.date ?? new Date().toISOString().slice(0, 10);
  const runs = await new DeliveryRunService(db).listByCourier(input.courierId, { date });
  if (runs.length === 0) return null;

  const closes = await new DeliveryRunCloseService(db).listByRuns(runs.map((run) => run.id));
  const closedIds = new Set(closes.map((close) => close.deliveryRunId));
  // Sürülen yoksa kurulmuş ama başlamamış seferin künyesi de okunabilsin.
  const open = runs.filter((candidate) => !closedIds.has(candidate.id));
  const run = open.find((candidate) => candidate.departedAt !== null) ?? open[0] ?? runs[0]!;
  return detailOf(db, run, closedIds.has(run.id));
}

/**
 * Tekil ve çoğul sefer okuması künyeyi buradan alır ki biri araç ya da depo adını eksik döndürmesin. Bölge okunamazsa depo adı
 * `null`dur: uydurma ad kuryeyi yanlış rampaya gönderirdi.
 */
async function detailOf(
  db: SupabaseClient,
  run: {
    id: string;
    referenceNo: string;
    deliveryZoneId: string;
    deliveryDate: string;
    vehicleId: string | null;
    departedAt: string | null;
    returnedAt: string | null;
    stopOrder?: readonly string[] | null;
    stopOrderSource?: StopOrderSource | null;
    stopOrderMetric?: StopOrderMetric | null;
    stopOrderPrecision?: StopOrderPrecision | null;
    stopOrderGeneratedAt?: string | null;
  },
  closed: boolean,
  unsequenced = 0,
): Promise<CourierDayRunView> {
  const zone = await new DeliveryZoneService(db).getById(run.deliveryZoneId);
  const [vehicleLabel, warehouseName] = await Promise.all([
    vehicleLabelOf(db, run.vehicleId),
    zone ? warehouseNameOf(db, zone.warehouseId) : Promise.resolve(null),
  ]);

  return {
    runId: run.id,
    referenceNo: run.referenceNo,
    zoneId: run.deliveryZoneId,
    zoneName: zone?.name ?? null,
    vehicleId: run.vehicleId,
    vehicleLabel,
    warehouseName,
    deliveryDate: run.deliveryDate,
    departedAt: run.departedAt,
    returnedAt: run.returnedAt,
    closed,
    /* Kuş uçuşuyla ve yol süresiyle dizilmiş sıra ekranda aynı görünür; farkı yalnız bu künye söyler. */
    stopOrder:
      run.stopOrderSource && run.stopOrderMetric && run.stopOrderPrecision && run.stopOrderGeneratedAt
        ? {
            source: run.stopOrderSource,
            metric: run.stopOrderMetric,
            precision: run.stopOrderPrecision,
            generatedAt: run.stopOrderGeneratedAt,
            sequenced: run.stopOrder?.length ?? 0,
            unsequenced,
          }
        : null,
  };
}

/** `null`: kayıt okunamadı; ekran "bilinmiyor" der. */
async function warehouseNameOf(db: SupabaseClient, warehouseId: string): Promise<string | null> {
  return (await new WarehouseService(db).getById(warehouseId))?.name ?? null;
}


/** `ready`e dönmüş sipariş denenmiş ve ulaşılamamıştır; ayrımı deneme sayısı verir. */
function outcomeOf(status: Order['status'], attempts: number): StopOutcome {
  if (status === 'delivered' || status === 'completed') return 'delivered';
  if (status === 'returned') return 'refused';
  return attempts > 0 && status === 'ready' ? 'unreachable' : 'pending';
}

function failedAttempts(logs: readonly OrderStatusLog[], orderId: string): number {
  return logs.filter(
    (log) => log.orderId === orderId && log.fromStatus === 'out_for_delivery' && log.toStatus === 'ready',
  ).length;
}

/**
 * Saat ve not aynı kayıttan okunur ki farklı olaylara düşmesin. Son kayıt seçilir: ulaşılamayan durak yeniden denenip yine
 * dönebilir.
 */
function settlementLog(
  logs: readonly OrderStatusLog[],
  orderId: string,
  outcome: StopOutcome,
): OrderStatusLog | null {
  if (outcome === 'pending') return null;
  const mine = logs.filter((log) => log.orderId === orderId);
  const matches =
    outcome === 'delivered'
      ? mine.filter((log) => log.toStatus === 'delivered')
      : outcome === 'refused'
        ? mine.filter((log) => log.toStatus === 'returned')
        : mine.filter((log) => log.fromStatus === 'out_for_delivery' && log.toStatus === 'ready');
  /* Servisin sırasına güvenilmez: `listByOrders` sözleşmesinde sıra yok. */
  return matches.reduce<OrderStatusLog | null>(
    (latest, log) => (latest === null || log.createdAt > latest.createdAt ? log : latest),
    null,
  );
}

/**
 * Kutu okutması sayılmaz: onu sunucu kurar ve ihtilafta kuryenin arkasında duracak bir kanıt değildir. Tanınmayan şekil `false`
 * döner.
 */
function hasVisualProof(order: Order): boolean {
  const kind = order.deliveryProof?.['kind'];
  return kind === 'signature' || kind === 'photo';
}

/**
 * `delivery_run_collection` görünümüyle aynı kural: yalnız `cash`, `card` ve `cheque` kuryenin eline girer. Net alınır, çünkü iade
 * edilen para kuryenin cebinde değildir.
 */
function collectedAtDoorCents(order: Order): number | null {
  const method = order.paymentMethod;
  if (method !== 'cash' && method !== 'card' && method !== 'cheque') return null;
  const netCents = order.amountCollectedCents - order.amountRefundedCents;
  return netCents > 0 ? netCents : null;
}

export type UndeliveredOutcome =
  | { status: 'ok'; outcome: 'unreachable' | 'refused'; currentStatus: Order['status'] }
  /** Durak bu kuryenin değil ya da geçişe motor izin vermiyor. */
  | { status: 'forbidden'; reason: 'not_assigned' | 'same_status' | 'terminal' | 'not_allowed' }
  | { status: 'stale'; currentStatus: Order['status'] }
  | { status: 'not_found' };

/**
 * Ulaşılamayan `ready`e döner ve mal ayrılmış kalır; reddedilen `returned` olur ve akıbetini depocu seçer. Not serbest, çünkü sahada
 * standart sebep listesi kuryeyi en yakın seçeneğe bastırır ve yanlış veri doğru görünür.
 */
export async function markUndelivered(
  db: SupabaseClient,
  input: {
    orderId: string;
    courierId: string;
    outcome: 'unreachable' | 'refused';
    note?: string | null;
  },
): Promise<UndeliveredOutcome> {
  const orders = new OrderService(db);
  const order = await orders.getById(input.orderId);
  if (!order) return { status: 'not_found' };
  if (order.courierId !== input.courierId) return { status: 'forbidden', reason: 'not_assigned' };

  /*
    Kapıdaki sonuç yalnız yoldaki durağa yazılır: `delivered → returned` iade sürecinin meşru kenarıdır ama o kapı kurye değil,
    teslimde stok düşmüş ve para alınmış olabilir. Cevap `stale`, çünkü durak kuryenindir; bayat olan ekranın gördüğü hâldir.
  */
  if (order.status !== 'out_for_delivery') return { status: 'stale', currentStatus: order.status };

  const to = input.outcome === 'unreachable' ? 'ready' : 'returned';
  const verdict = canTransition(order.status, to);
  if (!verdict.allowed) return { status: 'forbidden', reason: verdict.reason };

  const result = await orders.transition({
    orderId: input.orderId,
    from: order.status,
    to,
    actorId: input.courierId,
    note: input.note ?? null,
  });
  if (!result.ok) return { status: 'stale', currentStatus: result.currentStatus };

  return { status: 'ok', outcome: input.outcome, currentStatus: result.currentStatus };
}

/** Uzun listede ilk üç kalem ve kalanın sayısı. */
function summarize(lines: readonly OrderItem[], names: Map<string, string>): string {
  const shown = lines.slice(0, 3).map((line) => `${line.qty} × ${names.get(line.variantId) ?? '—'}`);
  const rest = lines.length - shown.length;
  return rest > 0 ? `${shown.join(', ')} +${rest}` : shown.join(', ');
}

/** Sözleşmedeki `stranded[]` elemanının aynası. */
export interface CourierStrandedStop {
  orderId: string;
  referenceNo: string | null;
  customerName: string;
  deliveryDate: string;
  boxOnVan: boolean;
}

/**
 * Teslim günü geçmiş ve sonuçlanmamış durak yeniden planlanana kadar başka hiçbir ekranda görünmez, oysa kutusu araçta durabilir.
 * Gün süzgeci TS'te, çünkü `getAll` "küçüktür" bilmez ve küme zaten az.
 */
export async function listStrandedStops(
  db: SupabaseClient,
  input: { courierId: string; today: string },
): Promise<CourierStrandedStop[]> {
  const orders = (await new OrderService(db).listByCourier(input.courierId, { limit: 200 })).filter(
    (order) =>
      order.deliveryType === 'route' &&
      (order.status === 'ready' || order.status === 'confirmed' || order.status === 'preparing') &&
      order.deliveryDate !== null &&
      order.deliveryDate < input.today,
  );
  if (orders.length === 0) return [];

  const [customers, boxes] = await Promise.all([
    customerCardsOf(db, orders),
    new OrderBoxService(db).listByOrders(orders.map((order) => order.id)),
  ]);
  const onVan = new Set(boxes.filter((box) => box.loadedAt !== null).map((box) => box.orderId));

  return orders
    .sort((a, b) => (a.deliveryDate! < b.deliveryDate! ? -1 : a.deliveryDate! > b.deliveryDate! ? 1 : 0))
    .map((order) => ({
      orderId: order.id,
      referenceNo: order.referenceNo,
      customerName: customers.get(order.customerId)?.name ?? '—',
      deliveryDate: order.deliveryDate!,
      boxOnVan: onVan.has(order.id),
    }));
}

/** Siparişin anlık kopyasından okunur: kurye siparişin verildiği andaki adrese, kişiye ve numaraya gider. */
interface StopAddress {
  text: string | null;
  recipient: string | null;
  phone: string | null;
}

async function addressTexts(db: SupabaseClient, orders: readonly Order[]): Promise<Map<string, StopAddress>> {
  const addresses = new AddressService(db);
  const map = new Map<string, StopAddress>();
  const str = (value: unknown): string | null =>
    typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;

  for (const order of orders) {
    const snapshot = order.addressSnapshot as Record<string, unknown> | null;
    const source = snapshot ?? (order.addressId ? await addresses.getById(order.addressId) : null);
    if (!source) continue;

    const parts = [source['line1'], source['line2'], source['postalCode'], source['city']]
      .filter((part): part is string => typeof part === 'string' && part.trim().length > 0);
    map.set(order.id, {
      text: parts.length > 0 ? parts.join(', ') : null,
      recipient: str(source['recipient']),
      phone: str(source['phone']),
    });
  }
  return map;
}

/** Operasyon yüzeyi Türkçe olduğu için adlar `tr` çözülür. */
async function variantNames(db: SupabaseClient, items: readonly OrderItem[]): Promise<Map<string, string>> {
  const variants = await new ProductVariantService(db).listByIds([...new Set(items.map((item) => item.variantId))]);
  const products = await new ProductService(db).listByIds([...new Set(variants.map((variant) => variant.productId))]);
  const productOf = new Map(products.map((product) => [product.id, product]));

  return new Map(
    variants.map((variant) => {
      const name = resolveLocalizedText(productOf.get(variant.productId)?.name ?? {}, 'tr');
      const label = resolveLocalizedText(variant.label, 'tr');
      return [variant.id, label ? `${name} (${label})` : name];
    }),
  );
}
