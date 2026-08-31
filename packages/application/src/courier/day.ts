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
import {
  canAccessWarehouse,
  canTransition,
  deliveryRunReferenceNo,
  sortBySequence,
  warehouseScope,
  whatsAppLink,
  type MessageLocale,
} from '@lezzet/domain-core';
// Araç adının kuralı rota seçim listesiyle ORTAK — künyesi kendi dosyasında.
import { vehicleLabelOf } from './vehicle-label';
import { listCourierRoutes } from './routes';
import { ensureStopOrder } from './stop-order';
import { logger } from '@lezzet/observability';
import { resolveLocalizedText } from '@lezzet/types';
import type { Order, OrderItem, OrderStatusLog } from '@lezzet/types';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Kuryenin gün listesi (11.1), günü başlatması (K1) ve kapıdaki iki olumsuz sonuç (11.4) —
 * **uygulama katmanı orkestrasyonu**. `design/pages/kurye-gun.md` + `kurye-teslimat.md` bağlayıcı.
 *
 * Terfi 21.10 (kaynağı `apps/web/lib/courier/day.ts`): aynı gün listesini hem operasyon web ekranı
 * hem mobil "Yol" bölümü (K1/K5) okuyacak — paketin kabul ölçütü tam olarak bu (`index.ts`). Web
 * kopyası geçiş köprüsüdür, benimsemesi ayrı talep dosyasıyla gider.
 *
 * **Kurye para GÖRÜR ama yalnız bir tanesini:** tahsil edeceği tutarı. Maliyet, kâr, marj, alış
 * fiyatı, müşterinin vade/limit/borç durumu dönen görünüm modelinde YOKTUR — depo kuyruğuyla aynı
 * yapısal sınır (tasarım §6). Ekran isteseydi bile gösteremez.
 *
 * **"Yalnız kendi teslimatları" imzada durur:** `courierId` zorunlu parametredir, süzgeç değil.
 */

/** Kapıdaki durak — sipariş künyesi + teslimat için gereken her şey; fazlası yok. */
export interface CourierStop {
  orderId: string;
  referenceNo: string | null;
  customerName: string;
  /**
   * **Kapıda sorulacak kişi** — adresin alıcısı; `null` = hesap sahibiyle aynı, söylenecek fazlası yok.
   *
   * `customerName`in yerine GEÇMEZ, yanında durur: hesabın sahibi ödemenin muhatabıdır, alıcı ise
   * kapıyı açacak kişi (hediye, iş adresi, aile büyüğü — `address.schema`nın kendi örnekleri).
   * İkisini tek alana sıkıştırmak, kuryenin kime "borcunuz var" diyeceğini belirsizleştirirdi.
   */
  recipient: string | null;
  /** B2B/B2C — kapıda teslim onayı beklentisini baştan kurar. */
  channel: Order['channel'];
  /** Navigasyon bu metin üzerinden açılır; sipariş anındaki kopya (adres sonradan düzelse de sabit). */
  address: string | null;
  phone: string | null;
  /** Tek dokunuşluk "yoldayım" — müşterinin DİLİNDE. Numara yoksa null: düğme hiç gösterilmez. */
  whatsAppLink: string | null;
  /** Kapıda ödenecek mi, ödendi mi — kuryenin duraktaki en kritik bilgisi. */
  payment: {
    /** `null` = önceden ödenmiş; para konuşulmaz. Birim **cent** (02.9). */
    dueAmountCents: number | null;
    expectedMethod: Order['paymentMethod'];
    /**
     * Kapıda FİİLEN alınan para (**cent**) — `null` = kurye bu durakta para almadı.
     *
     * `dueAmountCents`in zıddı: o alınacak olanı, bu alınmış olanı söyler. Türetimi
     * `delivery_run_collection` görünümüyle AYNI kuralı izler (yöntem `cash|card|cheque`), yoksa
     * gün listesiyle kapanış ekranı aynı parayı iki farklı hesapla söylerdi.
     */
    collectedAtDoorCents: number | null;
  };
  /** Araçtan doğru koliyi almak için: kaç kalem, ne var. */
  itemCount: number;
  contentSummary: string;
  /**
   * Kapıdaki KALEM SATIRLARI (21.10d). `orderItemId` olmadan kısmi iade yazılamaz — kapı
   * (`confirmDoorDelivery`) `adjustments[].orderItemId` istiyor ve mobil istemcinin o kimliği
   * öğrenebileceği başka bir yol yoktu.
   *
   * **İKİNCİ OKUMA AÇILMADI:** satırlar özetin (`contentSummary`) türetildiği AYNI kalem
   * kayıtlarından ve AYNI ad haritasından çıkıyor — ekstra bir sorgu yok.
   */
  items: CourierStopItem[];
  /** Kapıdaki sonuç — sistemin iç durumu değil, kuryenin gördüğü hâl. */
  outcome: StopOutcome;
  /**
   * Durağın SONUÇLANDIĞI an (ISO) — `null` = daha sonuçlanmadı.
   *
   * Geçiş geçmişinden okunur (`attempts` ile AYNI dizi, ikinci sorgu yok): teslimde/iadede o
   * geçişin damgası, ulaşılamayanda son `out_for_delivery → ready` dönüşününki.
   */
  settledAt: string | null;
  /** Kuryenin sonuca yazdığı serbest sebep ("zil bozuk") — aynı geçişin notu; yoksa `null`. */
  outcomeNote: string | null;
  /**
   * Kapıda GÖRSELLİ kanıt (imza/fotoğraf) alındı mı. Kutu okutması (`box_scan`) SAYILMAZ — o
   * sunucunun kendi kurduğu kayıttır, kapıda kimsenin imzaladığı bir şey değil.
   */
  hasProof: boolean;
  /** Ulaşılamadıysa kaçıncı denemede olduğu; listede kaybolmaz, tekrar denenir. */
  attempts: number;
  /**
   * Siparişin KUTULARI (23.8) — boş dizi = kutusuz akış. Yükleme sayacı `loadedAt` damgalarından
   * türer (karar §1.11: ayrı tablo yok); kapıda okutma ekranı okutulan kodu bu listeyle yerelde
   * eşler, son doğrulama sunucuda (`confirmDoorDelivery` kutu kapısı).
   */
  boxes: Array<{ boxNo: number; code: string; loadedAt: string | null }>;
  /**
   * **Rota sırası** (11.9) — 1'den başlar. `null` = SIRA BİLİNMİYOR: sefer henüz hesaplanmadı,
   * koordinat çözülemedi ya da hesap düştü. Uydurulmaz (`CLAUDE §1`) — bugüne dek ekranlar dizi
   * indeksini rota sırasıymış gibi gösteriyordu ve o sıra aslında SİPARİŞİN VERİLME sırasıydı.
   */
  stopSeq: number | null;
  /** Durak hangi seferin — liste sefere göre gruplanıyor (31.08 · v3:14). */
  runId: string;
  /** Grubun okunur başlığı: rota adı. `null` = bölge kaydı okunamadı. */
  runLabel: string | null;
}

/** Durağın tek kalemi — kapıda işaretlenebilmesi için KİMLİĞİYLE. */
export interface CourierStopItem {
  orderItemId: string;
  /** Kuryeye görünen ad — "Ürün (boy)"; operasyon dili Türkçe (CLAUDE.md §2). */
  name: string;
  /** SİPARİŞ EDİLEN adet; kapıda eksik çıkan miktar bundan indirilerek gönderilir. */
  qty: number;
  /**
   * Birim fiyat ve indirim payı (**cent**) — kapıda geri verilen malın tahsilattan ne kadar
   * düşeceğini EKRAN hesaplayabilsin diye (sözleşme künyesi). İkisi birlikte, çünkü hesap
   * (`lineAmountCents`) ikisini birden ister.
   */
  unitPriceCents: number;
  lineDiscountAmountCents: number;
  /**
   * FİİLEN teslim edilen adet (`adjustFulfillment`in yazdığı hedef değer). Teslim edilmemiş
   * durakta 0 — kolonun kendisi `not null default 0` ve mal daha kapıya gitmemiştir.
   *
   * KISMİ TESLİM BURADAN OKUNUR: `outcome` `delivered` ama `fulfilledQty < qty` ise bir kalem
   * araçta kalmıştır. Ayrı bir `StopOutcome` değeri açılmadı — kısmi bir geçiş değil, teslim
   * edilmiş durağın niteliğidir.
   */
  fulfilledQty: number;
}

/**
 * Durağın sonucu. **Sistemin `status`'ü doğrudan yansıtılmaz:** "ulaşılamadı" ile "henüz sıra
 * gelmedi" ikisi de `ready`'dir (ulaşılamayan sipariş `ready`'e geri döner, mal ayrılmış kalır) —
 * ayrım geçiş geçmişinden TÜRETİLİR, ayrı bir kolon tutulmaz.
 */
export type StopOutcome = 'pending' | 'delivered' | 'unreachable' | 'refused';

/**
 * **Kuryenin günü.** Gün verilmezse bugün. Sonuçlanmış duraklar da listede kalır: gün ortasında
 * "ne yaptım" sorusunun cevabı ve ulaşılamayanların geri dönülecek listesi budur.
 *
 * @param db service-role istemci — çağıran enjekte eder (`serviceDb()`), `auth/otp` deseni.
 */
export async function listCourierDay(
  db: SupabaseClient,
  input: {
    courierId: string;
    date?: string;
    /** Rota süzgeci (18.08): iki rotalı gün artık karışık tek liste değil. */
    zoneId?: string;
    /**
     * SEFER süzgeci (18.08): kapanış SEFERİN duraklarını sayar. Verilirse gün süzgeci uygulanmaz —
     * dünkü seferin kapanışı bugünden açılabilmeli, duraklar güne değil sefere bağlı.
     */
    runId?: string;
    /**
     * SEFER KÜMESİ (31.08) — araçtaki bütün seferlerin durakları tek listede. Gün ekranı artık
     * güne değil ARACA bakıyor: iki-üç günlük yolculukta yarının seferi de araçta duruyor ve
     * güne süzülseydi hiçbir ekranda görünmezdi. Verilirse gün ve rota süzgeçleri uygulanmaz.
     */
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
  // Kutu okuması mevcut dalganın İÇİNE giriyor (hazırlık kuyruğunun 21.11d dersi) — arkalarına değil.
  const [items, logs, customers, addresses, allBoxes] = await Promise.all([
    new OrderItemService(db).listByOrders(orderIds),
    new OrderStatusLogService(db).listByOrders(orderIds),
    customerCards(db, orders),
    addressTexts(db, orders),
    new OrderBoxService(db).listByOrders(orderIds),
  ]);
  const names = await variantNames(db, items);

  /*
    SEFERLER ARTIK ÇOĞUL (31.08). Eskiden "siparişler zaten tek bir sefere ait" varsayılıyordu ve
    ilk dolu kimlik yetiyordu; araç bir ara depo olunca bu varsayım düştü — listede iki, üç seferin
    durağı olabiliyor. Sıra da rota adı da SEFER BAŞINA çözülüyor, tek turda.
  */
  const runIdsInList = [...new Set(orders.map((order) => order.deliveryRunId).filter((id): id is string => id !== null))];
  const runService = new DeliveryRunService(db);
  const runRows = await Promise.all(runIdsInList.map((id) => runService.getById(id)));
  const runById = new Map(runRows.filter((row): row is NonNullable<typeof row> => row !== null).map((row) => [row.id, row]));
  const zoneNames = await zoneNamesOf(db, [...new Set([...runById.values()].map((row) => row.deliveryZoneId))]);
  /* Sıra okuması TEK seferin işi kalıyor: `stopOrderOf` bir turun sırasını getiriyor ve tur
     kimliğini süzgeçten ya da listedeki tek seferden alıyor. Çok seferli listede her seferin
     kendi sırası ayrı okunuyor — sıralar birbirine karışamaz. */
  const runId = input.runId ?? runIdsInList[0] ?? null;
  const run = runId ? (runById.get(runId) ?? null) : null;

  const stops: CourierStop[] = orders.map((order) => {
    const lines = items.filter((item) => item.orderId === order.id);
    const customer = customers.get(order.customerId);
    const attempts = failedAttempts(logs, order.id);
    const outcome = outcomeOf(order.status, attempts);
    const settled = settlementLog(logs, order.id, outcome);
    const place = addresses.get(order.id) ?? null;
    /* ADRESİN NUMARASI ÖNCE — AMA YEDEK KOŞULLU (22.08'de düzeltildi).
       Dün (21.08) yedek koşulsuzdu (`adres.phone ?? hesap.phone`) ve ölçünce yanlış çıktı: adreste
       ALICI yazılıysa ama telefon yazılı değilse, hesabın numarası BAŞKASININDIR (hediye/iş
       adresi) ve ekran o numarayı "kapıda aranacak numara" diye sunuyordu — üstelik WhatsApp
       bağlantısı alıcıyı ADIYLA selamlayıp sipariş verenin numarasına gönderiyordu. Bir kişinin
       adını başka birinin numarasının üstüne yazmak, bilgiyi tamamlamak değil UYDURMAKTIR.
       Web aynı veride aynı gün ters kararı vermişti (`09-admin.md`: *"telefon hesabınkine
       DÜŞMEZ… hesabın numarası hediye adresinde başkasının olabilir"*) — iki yüzey ayrışmıştı.

       Kural artık koşullu ve ikisini de karşılıyor: alıcı YOKSA kapıyı açan zaten hesap sahibidir,
       numarası da gerçekten onundur → yedek doğru. Alıcı VARSA yedek yok; cevap "bilinmiyor"dur
       (CLAUDE §1) ve ekran arama düğmesini hiç çizmez.

       Bu hâl GEÇİCİ: kullanıcı kararıyla (22.08) adres artık teslim alacak kişi VE numarayla
       birlikte kaydediliyor, yani "alıcısı var ama numarası yok" satırı yalnız eski kayıtlarda
       kalıyor. O yüzden buraya ikinci bir "sipariş sahibinin numarası" alanı EKLENMEDİ — sözleşmeyi
       ve ekranı, kapanmakta olan bir boşluk için büyütmek olurdu. */
    const namedRecipient = place?.recipient != null;
    const doorPhone = place?.phone ?? (namedRecipient ? null : customer?.phone ?? null);

    return {
      orderId: order.id,
      referenceNo: order.referenceNo,
      customerName: customer?.name ?? '—',
      /* Kapıda SORULACAK kişi — `customerName`i EZMEZ, yanına durur. İkisi ayrı gerçek: hesabın
         sahibi ödemenin/vadenin muhatabı, alıcı ise kapıyı açacak kişi (hediye, iş adresi, aile
         büyüğü). `null` = söylenecek fazladan bir şey yok, kurye müşteri adını sorar. */
      recipient: place?.recipient ?? null,
      channel: order.channel,
      address: place?.text ?? null,
      phone: doorPhone,
      whatsAppLink: whatsAppLink({
        phone: doorPhone ?? undefined,
        locale: input.locale ?? 'fr',
        customerName: place?.recipient ?? customer?.name,
      }),
      payment: {
        dueAmountCents: amountDueCents(order),
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
      /* Saat ve sebep TEK kayıttan (`settlementLog`) — ikisi aynı olayın iki yüzü. Dizi zaten
         `attempts` için okunuyor, ikinci sorgu doğmuyor. */
      settledAt: settled?.createdAt ?? null,
      outcomeNote: settled?.note ?? null,
      hasProof: hasVisualProof(order),
      attempts,
      boxes: allBoxes
        .filter((box) => box.orderId === order.id)
        .map((box) => ({ boxNo: box.boxNo, code: box.code, loadedAt: box.loadedAt })),
      // Sıra aşağıda, tüm duraklar kurulduktan SONRA yazılıyor: numara dizideki yerden değil,
      // sıralanmış listedeki yerden gelir.
      stopSeq: null,
      runId: order.deliveryRunId ?? runId ?? '',
      runLabel: order.deliveryRunId
        ? (zoneNames.get(runById.get(order.deliveryRunId)?.deliveryZoneId ?? '') ?? null)
        : (run ? (zoneNames.get(run.deliveryZoneId) ?? null) : null),
    };
  });

  return applyStopOrder(stops, runById);
}

/** Bölge adları — grup başlıkları için, tek turda (doğal tavanlı küme, CLAUDE §1). */
async function zoneNamesOf(db: SupabaseClient, zoneIds: readonly string[]): Promise<Map<string, string>> {
  if (zoneIds.length === 0) return new Map();
  const service = new DeliveryZoneService(db);
  const rows = await Promise.all(zoneIds.map((id) => service.getById(id)));
  return new Map(rows.filter((row): row is NonNullable<typeof row> => row !== null).map((row) => [row.id, row.name]));
}

/**
 * Kayıtlı sırayı uygular — **sıralamayı SUNUCU yapar, ekran yalnız çizer.** İki yüzey kendi
 * sıralamasını yapsaydı bir gün ayrışırlardı ve aynı gün iki farklı rota gösterirlerdi.
 *
 * Sıra yoksa dizi olduğu gibi kalır ve her durağın `stopSeq`i `null`dur: **numara UYDURULMAZ**
 * (`CLAUDE §1`). Ekran bu hâlde rayı çizmez ve "sırasız" der — kısmen numaralanmış bir liste,
 * numarasızdan kötüdür: kurye "3" görünce onu günün üçüncü durağı sanar.
 */
function applyStopOrder(
  stops: readonly CourierStop[],
  runById: ReadonlyMap<string, { deliveryZoneId: string; deliveryDate: string; stopOrder: readonly string[] | null }>,
): CourierStop[] {
  /*
    SIRA SEFER BAŞINA (31.08) — araçta birden çok sefer olabiliyor ve her birinin KENDİ sırası var.
    Eskiden tek bir `stopOrder` bütün listeye uygulanıyordu; iki seferli araçta bu, ikinci seferin
    duraklarını "sırasız" (numarasız) bırakır ve birincinin numaralarını onların üstüne taşırdı.

    Gruplar arası sıra SEFERİN GÜNÜ: bugünün seferi önce, yarınınki sonra. Aynı günün iki seferi
    arasında listedeki mevcut sıra korunur — uydurma bir öncelik kurmak, kuryenin hangi rotayı
    önce süreceğine burada karar vermek olurdu (o karar onun).
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

/**
 * **Kapıda tahsil edilen paranın gireceği hesap** (21.10d) — `door_cash_account_id` ayarından.
 *
 * Ayrı bir kapı olmasının sebebi imza: `listCourierDay` durak DİZİSİ döndürüyor ve bu değer gün
 * başına tekildir; dizinin her elemanına kopyalamak aynı kimliği N kez taşımak ve "durakta başka
 * hesap olabilir" diye yanlış bir beklenti kurmak olurdu. Çağıran ikisini birlikte okur (mobil uç
 * `/courier/day` cevabında birleştiriyor; operasyon web ekranı aynı anahtarı kendi okumasında
 * okuyor — `deliveries/[orderId]/delivery-read.ts`).
 *
 * **Kullanılamaz ayar `null` döner, uydurma bir kimlik DÖNMEZ.** Ayar elle yazılabilir bir jsonb
 * değeridir; operatör oraya bir hesap ADI yazarsa `null` döner ve tahsilat kapısı kapalı kalır —
 * kapıda alınan paranın olmayan bir hesaba yazılmasından iyidir. Sessiz de değil: kayıt düşer
 * (anahtar yazılır, değer YAZILMAZ — teşhis için anahtar yeter, CLAUDE.md §1).
 */
/** Ayarın hesap kimliği olup olmadığının tek ölçütü — sözleşme de uuid istiyor (`doorAccountId`). */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function readDoorCashAccountId(db: SupabaseClient): Promise<string | null> {
  const raw = await new SettingsService(db).get<unknown>('door_cash_account_id', null);
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
 * **"Seferi başlat"ın sonucu** (K1 · 18.08) — ayrımlı birleşim: dört liste + sefer künyesi, ya da
 * başlatılamama SEBEBİ. `already_started` bir hata değil (rota+gün başına tek sefer — 0046 kısıtı);
 * `route_required` ekranı `/courier/routes` seçimine gönderir; `no_route` o gün koşan rota yok.
 *
 * Toplu yazımın en tehlikeli hâli "kısmen oldu"dur: üç durak yola çıkıp dördüncüsü çıkmazsa ve
 * cevap yalnız "başladı" derse, kurye o durakta teslim yazamadığında sebebini bilemez (kapı sırası:
 * teslim yalnız YOLDAKİ siparişten olur). Bu yüzden kısmi başarı GÖRÜNÜR.
 */
export type CourierDayStart =
  | {
      status: 'ok';
      date: string;
      run: CourierDayRunView;
      /** `ready → out_for_delivery` yazılanlar. */
      started: string[];
      /** Zaten yoldaydı — ikinci çağrı hata değil, "yeni bir şey yok" cevabı. */
      alreadyOut: string[];
      /** Araya biri girdi: `ready` okundu, yazarken durum değişmişti. */
      stale: { orderId: string; currentStatus: Order['status'] }[];
      /** Durumu uygun değil — henüz hazırlanmadı ya da gün içinde kapandı. */
      skipped: { orderId: string; currentStatus: Order['status'] }[];
      /**
       * KUTULU sipariş — tüm kutuları binene kadar "yolda" yazılmaz (23.8, etüt 2.4). Geçişi son
       * kutunun okutması yazar (`loadBox`); burada yalnız sayaç döner ki ekran "3 kutu bekliyor"
       * diyebilsin. `skipped`ten ayrı: çare hazırlanmak değil OKUTMAK.
       */
      awaitingBoxes: { orderId: string; loadedBoxes: number; boxCount: number }[];
    }
  | { status: 'already_started'; runId: string; referenceNo: string; courierId: string; mine: boolean }
  | { status: 'route_required' }
  | { status: 'no_route' };

/** Seferin ekranlara giden künyesi — sözleşmedeki `CourierRunBriefSchema`nın aynası. */
export interface CourierRunBriefView {
  runId: string;
  referenceNo: string;
  zoneId: string;
  zoneName: string | null;
  vehicleId: string | null;
  /** Aracın okunur adı ya da plakası; `null` = araçsız sefer. Kural `vehicle-label.ts`te tek yerde. */
  vehicleLabel: string | null;
  /** Seferin GÜNÜ (`YYYY-MM-DD`) — araç birden çok günün seferini taşıyabiliyor (31.08). */
  deliveryDate: string;
  departedAt: string | null;
  returnedAt: string | null;
  closed: boolean;
}

/**
 * Günün seferi — künye + **çıkış deposunun adı** (30.08 · uyuşmazlık #12).
 *
 * Depo adı künyenin kendisinde DEĞİL: rota seçim listesinde o değer rota düzeyinde zaten var ve
 * seferi olmayan rotada da bulunması gerekiyor; künyeye koysaydık o yanıtta iki kez taşınırdı
 * (CLAUDE §1). Kurye günü tek bir seferi anlatıyor — orada tek yer seferin kendisidir.
 */
export interface CourierDayRunView extends CourierRunBriefView {
  warehouseName: string | null;
}

/**
 * **Seferi başlat** (K1 · 18.08) — rotayı KURYE seçer, sefer kaydı doğar, seferin hazır siparişleri
 * yola çıkar. Eski "günü başlat"ın halefi: fiil aynı (araca günün kolileri yüklenir), öznesi
 * netleşti — gün değil SEFER, ve kurye artık atamayla değil seçimiyle bağlanır.
 *
 * ── ROTA ÇÖZÜMÜ: TEK ADAYDA SORU SORULMAZ ───────────────────────────────────
 * `zoneId` verilmezse o gün koşan rotalara bakılır: sıfır → `no_route`; tek → otomatik seçilir
 * (dispatch'in "tek adayda soru sorulmaz" ilkesi — tek rotalı operasyon hiç soru görmez); birden
 * çok → `route_required`, ekran seçtirir.
 *
 * ── CLAIM RPC'DE, GEÇİŞ BURADA ──────────────────────────────────────────────
 * `start_delivery_run` sefer satırını açar ve siparişleri damgalar (`delivery_run_id` +
 * `courier_id` — "siparişin kuryesi seferin kuryesinden gelir") — TEK transaction, iki kuryenin
 * yarışı veride çözülür. Durum geçişi RPC'ye GÖMÜLMEZ: `ready → out_for_delivery` kenarının izni
 * motorundur (`canTransition`) ve bir gün o kenar kapanırsa bu kapı yazmayı bırakır, RPC'deki bir
 * kopyaya göre yazmaya devam etmez.
 *
 * **Yalnız `ready` olanlar yola çıkar.** `confirmed`/`preparing` motorca çıkarılabilir olsa da
 * hazırlığı atlanan siparişin parti kaydı yazılmamıştır — teslimde mal hangi partiden düşecek
 * sorusu cevapsız kalır. Atlanan durak gizlenmez, `skipped` listesinde durumuyla döner.
 *
 * @param db service-role istemci — çağıran enjekte eder (`serviceDb()`), `auth/otp` deseni.
 */
export async function startCourierDay(
  db: SupabaseClient,
  input: { courierId: string; date?: string; zoneId?: string; vehicleId?: string | null; depart?: boolean },
): Promise<CourierDayStart> {
  const date = input.date ?? new Date().toISOString().slice(0, 10);
  /*
    YOLA ÇIKMA AYRI BİR EYLEM (kullanıcı kararı 31.08) — ama bu kapı İKİSİNİ de taşıyor.

    Model: sefer KURULUR (satır doğar, siparişler damgalanır, kutular okutulabilir) ve ayrıca
    BAŞLATILIR (damga vurulur, duraklar açılır, müşteriye haber gider). `depart` bayrağı bu ikisini
    ayırıyor. Varsayılanı `true` çünkü bugünkü tek çağıran (`/day/start`) tek düğmeye bağlı; ekranlar
    ikiye ayrıldığında (21.190) `depart:false` ile kurma, sonra `depart:true` ile başlatma çağrılır.

    Bayrak geçici bir köprü DEĞİL: "kur" ile "başlat" aynı rota çözümünü, aynı claim'i ve aynı
    kapsam kararını paylaşıyor. İki ayrı kapı yazmak o üç kararı kopyalamak olurdu (CLAUDE §1).
  */
  const depart = input.depart ?? true;

  /**
   * Kuryenin DEPO KAPSAMI sunucuda, kendi profilinden çözülür (11.7 · kullanıcı kuralı 21.08:
   * "kurye hangi depoya aitse o depoya ait rotaları görebilmeli ve alabilmeli"). Parametre olarak
   * alınmaz — hazırlık kapılarının aynı gerekçesi: istemciden gelen kapsam, kapsam kontrolünü
   * kandırmanın kendisidir. Profil yoksa kapsam da yoktur (fail-closed).
   */
  const profile = await new UserProfileService(db).getById(input.courierId);
  const scope = profile ? warehouseScope(profile.roles, profile.warehouseIds) : ({ kind: 'none' } as const);

  // Rota çözümü — verilmemişse o gün koşanlardan; seçim listesiyle AYNI kaynaktan gelir ki ekranın
  // gösterdiği ile kapının seçtiği ayrışamasın.
  let zoneId = input.zoneId ?? null;
  if (!zoneId) {
    const routes = await listCourierRoutes(db, { date, scope });
    if (routes.length === 0) return { status: 'no_route' };
    if (routes.length > 1) return { status: 'route_required' };
    zoneId = routes[0]!.zoneId;
  } else {
    // Kimlik VERİLMİŞSE de aynı süzgeçten geçer: seçim listesi kapsamla daraldı, buraya kapsam
    // dışı bir kimliğin gelmesi bayat bir ekranın ya da elle kurulmuş bir isteğin işaretidir.
    // Cevap `zone_not_found`un emsali — başlatılacak rota yok, ekran seçim listesine döner ve o
    // liste zaten yalnız kuryenin kendi deposunu gösterir. Yazım HİÇ yapılmaz.
    const zone = await new DeliveryZoneService(db).getById(zoneId);
    if (!zone || !canAccessWarehouse(scope, zone.warehouseId)) return { status: 'no_route' };
  }

  const runs = new DeliveryRunService(db);
  const year = Number(date.slice(0, 4));

  // Referans çakışması (26^6 içinde nadir) yeni kodla denenir — sipariş referansının deseni.
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
    // `zone_not_found` (silinmiş/bozuk kimlik) ve tükenen referans denemesi aynı kapıya çıkar:
    // başlatılacak rota yok. Ekran seçim listesine döner — o liste zaten yalnız var olanı gösterir.
    return { status: 'no_route' };
  }

  /* YOLA ÇIKMA DAMGASI — yalnız `depart` istendiğinde. Kurulmuş sefer araçta bekler ve
     `departedAt` NULL kalır; ekran onu "araçta, başlamadı" diye gösterir (v3:15). */
  const departed = depart ? await runs.depart({ runId: start.runId!, courierId: input.courierId }) : null;

  // Başlatılan seferin künyesi de ARAÇ ADINI taşıyor: ekran başlatma anından itibaren "hangi
  // aracı süreceğim" sorusunu cevaplayabilmeli (30.08 · uyuşmazlık #12).
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
    },
    started: [],
    alreadyOut: [],
    stale: [],
    skipped: [],
    awaitingBoxes: [],
  };

  // Kutulu sipariş toplu geçişten AYRILIR (23.8, etüt 2.4): araca binmeyen kutu "yolda" görünmez.
  // Tek okuma, sipariş başına tur değil — kutusuz veride (bugünün baskın hâli) harita boş kalır.
  const claimedIds = (start.claimed ?? []).map((claim) => claim.orderId);
  const boxesByOrder = new Map<string, { loaded: number; total: number }>();
  for (const box of await new OrderBoxService(db).listByOrders(claimedIds)) {
    const entry = boxesByOrder.get(box.orderId) ?? { loaded: 0, total: 0 };
    entry.total += 1;
    if (box.loadedAt !== null) entry.loaded += 1;
    boxesByOrder.set(box.orderId, entry);
  }

  /* GEÇİŞLER YALNIZ YOLA ÇIKARKEN (31.08). Sefer kurulurken siparişler damgalanır ama `ready`
     kalır: araçtaki mal henüz "yolda" değildir ve müşteriye haber gitmemiştir. Dört liste bu dalda
     boş döner ve bu bir eksiklik değil — kurma anının doğru fotoğrafı budur. */
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
      ── ARACA KUTUSUYLA BİNER (kullanıcı kararı 30.08) ────────────────────────────────────────
      Geçişi son kutunun okutması yazar (`loadBox`); hepsi zaten yüklüyse (sefer yeniden
      başlatıldı, kutular dünden araçta) beklemeye gerek yok, geçiş burada.

      **KUTUSUZ SİPARİŞ ARTIK YOLA ÇIKMAZ.** Eskiden `boxState` yoksa koşul atlanıyordu ve sipariş
      hiç okutulmadan "yolda" yazılıyordu — araçta olup olmadığını hiçbir kayıt söylemiyordu.
      Kutusuz kalan bir rota siparişi bugün bir VERİ HATASIDIR (hazırlık kapısı onu `ready`
      yapmıyor, `box_required` diyor); buraya düşerse `awaitingBoxes`ta görünür ve kurye "kutuları
      okut" cevabını alır — sessizce yola çıkmaz.
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
    if (transitioned.ok) result.started.push(claim.orderId);
    else result.stale.push({ orderId: claim.orderId, currentStatus: transitioned.currentStatus });
  }

  /* Sıra hesabı BURADA, claim'den sonra — ve sefer başlatmayı BLOKE ETMEZ (11.9): kapı hiçbir hâlde
     fırlatmıyor, düşerse sıra `null` kalır ve ekran "sırasız" der. Bir rota iyileştirici, aracın
     yola çıkmasını durduramaz. */
  await ensureStopOrder(db, { runId: result.run.runId, actorId: input.courierId });

  return result;
}

/**
 * **Kuryenin o günkü seferi** — `/courier/day` cevabının `run` alanı (18.08). Eski yerel "başladı"
 * bayrağının halefi: uygulama yeniden başlasa da açık sefer sunucudan gelir. Birden çok sefer
 * sürülmüş günde KAPANMAMIŞ olan önceliklidir (akış sıralı: kapat → yeni sefer); hepsi kapalıysa
 * en yenisi döner (salt-okunur gösterim).
 */
/**
 * **ARAÇTAKİ SEFERLER** (31.08 · v3:15) — kurulmuş ve henüz KAPANMAMIŞ olanların hepsi.
 *
 * Kullanıcının modeli: *"bir çeşit araba ara depo gibi oluyor ve içinde birden fazla sefere ait
 * sipariş taşıyor. Ve kurye istediği bir seferi başlatabiliyor."* İki senaryo besliyor bunu — dağ
 * bölümünün ayrı rota olması (aynı gün, iki sefer) ve iki-üç günlük yolculuk (rotalar tek günlük).
 *
 * ── KÜME GÜNE DEĞİL ARACA BAKAR ─────────────────────────────────────────────
 * Süzgeç `date` DEĞİL "kapanmamış": yarının seferi bugünden yüklenebiliyor ve güne süzülseydi o
 * kutular hiçbir ekranda görünmezdi. Kapanan sefer listeden düşer — işi bitmiştir, kutuları da
 * inmiştir (v3:13'ün kuralı: *"yalnız kapanan seferin dönenleri iner"*).
 *
 * Sıra SEFERİN GÜNÜ: bugünün seferi üstte, yarınınki altta — kurye rampada ne taşıdığını okurken
 * zaman sırasını bekler.
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

  return Promise.all(onVan.map((run) => detailOf(db, run, false)));
}

export async function readCourierRun(
  db: SupabaseClient,
  input: { courierId: string; date?: string },
): Promise<CourierDayRunView | null> {
  const date = input.date ?? new Date().toISOString().slice(0, 10);
  const runs = await new DeliveryRunService(db).listByCourier(input.courierId, { date });
  if (runs.length === 0) return null;

  const closes = await new DeliveryRunCloseService(db).listByRuns(runs.map((run) => run.id));
  const closedIds = new Set(closes.map((close) => close.deliveryRunId));
  const run = runs.find((candidate) => !closedIds.has(candidate.id)) ?? runs[0]!;
  return detailOf(db, run, closedIds.has(run.id));
}

/**
 * Sefer satırından KÜNYE — iki okuma da (tekil `readCourierRun`, çoğul `readCourierRuns`) buradan
 * geçer. Ortak olması bilinçli: ikisi ayrı kurulsaydı biri bir gün araç adını ya da depo adını
 * eksik döndürürdü ve ekran hangisinden geldiğine göre farklı davranırdı (CLAUDE §1).
 *
 * ARAÇ ADI VE ÇIKIŞ DEPOSU (30.08 · uyuşmazlık #12) — künye ADSIZ eksikti. Ekran `vehicleId`nin
 * uuid'sinden hangi aracın önüne gideceğini çıkaramaz. İkisi de PARALEL okunuyor: biri ötekini
 * beklemek zorunda değil. Depo adı ZONE üzerinden geliyor (sefer bölgesine, bölge depoya bağlı);
 * zone okunamazsa ikisi de `null` — "bilinmiyor"u uydurma bir ada düşürmek, kuryeyi yanlış rampaya
 * gönderirdi (CLAUDE §1).
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
  },
  closed: boolean,
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
  };
}

/** Deponun adı — `null` = kayıt okunamadı; ekran "bilinmiyor" der, uydurma bir ad yazmaz. */
async function warehouseNameOf(db: SupabaseClient, warehouseId: string): Promise<string | null> {
  return (await new WarehouseService(db).getById(warehouseId))?.name ?? null;
}

/**
 * Kapıda tahsil edilecek tutar. **Hesap burada yapılmaz, okunur:** sipariş toplamından tahsil
 * edilmiş net düşülür — eksik kalem işaretlendiğinde tutarı düşüren de aynı türetimdir (07.8),
 * kurye ayrıca bir hesap görmez.
 *
 * `null` = borç yok (önceden ödenmiş).
 *
 * "Kuruş altı kalıntı sıfır sayılır" kuralı KALKTI (02.9) ve kalkması gerekiyordu: hesap artık
 * tamsayı cent üstünde yapılıyor, yani 0,004 € gibi bir kalıntı ARTIK DOĞAMAZ. O eşik kayan nokta
 * çıkarmasının ürettiği çöpü süpürmek içindi; sebep ortadan kalkınca eşik de bir sayıyı sessizce
 * yutan gereksiz bir kapıya dönüşürdü.
 */
function amountDueCents(order: Order): number | null {
  const dueCents = order.totalCents - (order.amountCollectedCents - order.amountRefundedCents);
  return dueCents > 0 ? dueCents : null;
}

/**
 * Kapıdaki sonuç. `out_for_delivery` yolda demektir; `ready`'e dönmüş sipariş DENENMİŞ ve
 * ulaşılamamıştır — ayrımı deneme sayısı verir.
 */
function outcomeOf(status: Order['status'], attempts: number): StopOutcome {
  if (status === 'delivered' || status === 'completed') return 'delivered';
  if (status === 'returned') return 'refused';
  return attempts > 0 && status === 'ready' ? 'unreachable' : 'pending';
}

/** Kaç kez yola çıkılıp geri dönüldü — `out_for_delivery → ready` geçişlerinin sayısı. */
function failedAttempts(logs: readonly OrderStatusLog[], orderId: string): number {
  return logs.filter(
    (log) => log.orderId === orderId && log.fromStatus === 'out_for_delivery' && log.toStatus === 'ready',
  ).length;
}

/**
 * **Durağı SONUÇLANDIRAN geçiş** — saatin ve sebep notunun ortak kaynağı.
 *
 * İkisini ayrı ayrı aramak, aynı diziyi iki kez tarayıp bir gün FARKLI kayıtlara düşmek demekti:
 * "14:12'de teslim edildi" ile "zil bozuk" aynı durakta yazılırsa kurye iki ayrı olayı tek olay
 * sanırdı. Tek kayıt döner, iki alan ondan okunur.
 *
 * `pending` durakta `null`: sonuçlanmamış durağın sonuçlanma anı da yoktur (CLAUDE §1 — ölçülemeyen
 * değer sıfır/şimdi değildir).
 *
 * **SON kayıt seçilir, ilk değil:** ulaşılamayan durak ertesi gün tekrar denenip yine dönebilir ve
 * kurye en son ne olduğunu okumalıdır.
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
  /* Sıralama BURADA yapılıyor ve servisin sırasına güvenilmiyor: `listByOrders` sırayı sözleşmesinde
     söylemiyor, yani bugün doğru gelen sıra yarın bir index değişikliğiyle sessizce bozulabilir. */
  return matches.reduce<OrderStatusLog | null>(
    (latest, log) => (latest === null || log.createdAt > latest.createdAt ? log : latest),
    null,
  );
}

/**
 * Kapıda GÖRSELLİ kanıt alındı mı — `signature` ya da `photo`.
 *
 * **`box_scan` SAYILMAZ** (23.8): o kanıdı sunucu okutulan kutu kodlarından kendisi kuruyor, kapıda
 * kimse bir şey imzalamıyor. Gün listesi "imza var" derken kuryeye ihtilafta arkasında duracak bir
 * kanıt vaat ediyor; kutu okutmasını oraya saymak o vaadi boşa çıkarırdı.
 *
 * Kayıt `jsonb` ve ŞEMASIZ okunuyor (`Record<string, unknown>`): eski kayıtlarda `kind` hiç
 * olmayabilir. Tanınmayan şekil `false` döner — "kanıt var" demek, olmayan bir kanıdı vaat etmekten
 * daha pahalıdır.
 */
function hasVisualProof(order: Order): boolean {
  const kind = order.deliveryProof?.['kind'];
  return kind === 'signature' || kind === 'photo';
}

/**
 * **Kapıda FİİLEN alınan para** (cent) — `null` = kurye bu durakta para almadı.
 *
 * Kural `delivery_run_collection` görünümünün AYNISI: kapıda alınan para, yöntemi `cash|card|cheque`
 * olan siparişin tahsilatıdır. `online`/`transfer` kuryenin eline hiç girmez ve burada `null`
 * görünür — gün listesi o durağa "ödendi · online" der, "kurye aldı" demez.
 *
 * Net alınır (tahsil − iade): kapıda alınıp sonra iade edilen para kuryenin cebinde değildir.
 */
function collectedAtDoorCents(order: Order): number | null {
  const method = order.paymentMethod;
  if (method !== 'cash' && method !== 'card' && method !== 'cheque') return null;
  const netCents = order.amountCollectedCents - order.amountRefundedCents;
  return netCents > 0 ? netCents : null;
}

export type UndeliveredOutcome =
  | { status: 'ok'; outcome: 'unreachable' | 'refused'; currentStatus: Order['status'] }
  /** Sipariş bu kuryenin değil — başkasının durağı bu ekrandan kapatılamaz. */
  | { status: 'forbidden'; reason: 'not_assigned' | 'same_status' | 'terminal' | 'not_allowed' }
  | { status: 'stale'; currentStatus: Order['status'] }
  | { status: 'not_found' };

/**
 * **Ulaşılamadı / reddedildi** (11.4). İki ayrı işaret, iki ayrı akıbet — tek "teslim edilemedi"
 * düğmesine sıkıştırılmaz, çünkü ayrım stok ve iade sürecinin temelidir:
 *
 * - **Ulaşılamadı** (evde yok, kapı açılmadı) → `ready`. Mal araçta, **ayrılmış kalır**; stok HİÇ
 *   değişmez (ORDER_LIFECYCLE). Sipariş yarın yeniden denenir.
 * - **Reddedildi** (müşteri kabul etmedi) → `returned`. Mal depoya döner; stoğa geri alma/imha
 *   kararı **depocunundur** (DOMAIN §8) — kurye yalnız işaret koyar, akıbeti seçmez.
 *
 * Not kısa ve serbesttir ("zil bozuk"): sebebi standartlaştırmak sahada doğru seçeneği aramaya
 * zorlar, kurye de en yakınına basar — yanlış veri, doğru görünümlü olur. **Not durum kaydına
 * yazılır** (`order_status_log.note`, düzeltme 95428fb): yazılmasaydı kuryenin kapıda girdiği tek
 * serbest bilgi hiçbir yere düşmezdi.
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

/** Koli özeti: "2 × Fıstıklı Baklava, 1 × Mantı". Uzun listede ilk üç kalem + kalanın sayısı. */
function summarize(lines: readonly OrderItem[], names: Map<string, string>): string {
  const shown = lines.slice(0, 3).map((line) => `${line.qty} × ${names.get(line.variantId) ?? '—'}`);
  const rest = lines.length - shown.length;
  return rest > 0 ? `${shown.join(', ')} +${rest}` : shown.join(', ');
}

/** Müşteri künyesi — ad ve telefon. Vade/limit/borç ve sipariş geçmişi OKUNMAZ (tasarım §6). */
async function customerCards(
  db: SupabaseClient,
  orders: readonly Order[],
): Promise<Map<string, { name: string; phone: string | null }>> {
  const profiles = new UserProfileService(db);
  const map = new Map<string, { name: string; phone: string | null }>();
  for (const customerId of new Set(orders.map((order) => order.customerId))) {
    const profile = await profiles.getById(customerId);
    if (profile) map.set(customerId, { name: profile.name, phone: profile.phone });
  }
  return map;
}

/**
 * Durağın ADRES BİLGİSİ — metin + kapıda sorulacak kişi + aranacak numara.
 *
 * Önce siparişin **anlık kopyası** (`addressSnapshot`) okunur: adres kaydı sonradan düzeltilse bile
 * kuryenin gideceği yer siparişin verildiği andaki adrestir. Aynı öncelik `recipient`/`phone` için
 * de geçerli ve aynı sebepten — sipariş anında kime, hangi numaraya söz verildiyse o.
 *
 * ── ÜÇÜ TEK OKUMADAN (21.08) ────────────────────────────────────────────────
 * Alanlar bir süre YAZILIYOR ama HİÇ OKUNMUYORDU: `address.schema` künyesi *"kurye kapıda kimi
 * soracağını buradan bilir"* / *"kapıya teslimde kurye önce arar"* diyordu, oysa durak yalnız
 * `customer.phone`u taşıyordu ve `recipient` kod tabanında hiçbir yerde tüketilmiyordu (ölçüldü
 * 21.08). Yani şemanın vaat ettiği davranışın tüketen ucu hiç bağlanmamıştı.
 *
 * Ayrı bir sorgu AÇILMADI: bu döngü zaten aynı kaynağı okuyor, tek yaptığımız aynı nesneden iki
 * alan daha almak.
 */
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

/** Varyant → "Ürün (boy)". Operasyon yüzeyi Türkçedir (CLAUDE.md §2). */
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
