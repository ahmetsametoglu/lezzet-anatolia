import { OrderItemService, OrderService, OrderStatusLogService, UserProfileService } from '@lezzet/database';
import type { WarehouseScope } from '@lezzet/domain-core';
import type { CourierReturnDraft, OrderItem, ReturnDisposition } from '@lezzet/types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { readCourierReturn } from '../courier/return';
import { displayName, variantNames } from './names';

/**
 * **Kurye dönüşü — D6'nın OKUMA yarısı** (21.11d). Yazma yarısı zaten vardı
 * (`order/refund.adjustFulfillment` + `POST /warehouse/returns/:orderId`); eksik olan tek şey
 * *"bugün rampama ne geri geldi"* sorusunun cevabıydı ve o yokluk ekranda bir fixture'a dönüşmüştü
 * (`apps/mobile/.../courier-return-fixture.ts`).
 *
 * ── ANAHTAR KURYENİN GÜNÜ DEĞİL, DEPONUN RAMPASI (ölçüldü) ──────────────────
 * İlk akla gelen kapı `courier/day-close.openDayClose`ın `returned` listesiydi. ELENDİ, iki ölçümle:
 *   1. O kapı `courierId` ZORUNLU alıyor (imzanın kendisi "yalnız kendi günü" kuralı) ve depocunun
 *      elinde kurye kimliği yok — uydurmak, deponun listesini bir kuryenin gününe daraltmak olurdu.
 *      Aynı rampaya iki kurye döner; biri günü hiç kapatmamış olabilir.
 *   2. `courier_day_close` ile sipariş arasında FK YOK — bağ ancak "aynı kurye + aynı gün" üzerinden
 *      DOLAYLI kurulurdu. Dolaylı bir bağ üstüne kurulan liste, kurye atanmadan dönen bir siparişi
 *      sessizce yutar.
 *
 * Deponun gerçek sorusu tek satır: **`returned` durumunda, BU depoda, akıbeti işaretlenmemiş kalemi
 * olan siparişler.** Üçü de gerçek kolon; hiçbiri türetilmiş bir varsayım değil.
 *
 * ── AYNI KAPI İKİ YÜZEYE BAKAR (25.08) ──────────────────────────────────────
 * Kapı doğduğunda tek okuyanı telefondaki depocuydu ve `warehouseId` tekildi. Masaüstü de aynı
 * soruyu soruyor — ama yöneticinin kapsamı bir LİSTEdir (`ctx.warehouseIds`), tek depo değil. İkinci
 * bir okuma yazmak yerine imza küme kabul ediyor: aynı gerçeği iki kapıdan okutmak, birini bir gün
 * güncellemeyi unutmaktır. Yüzeylerin işi ayrışıyor ve bu bilinçli: **karar telefonda verilir**
 * (depocu koliyi elinde tutar), masaüstü yalnız **görünürlük** sağlar — akıbeti bekleyen dönüş hiçbir
 * ekranda görünmezse `returned` sipariş sessizce asılı kalır, ve tam olarak öyle oluyordu (10.5).
 *
 * Süzgeç sözleşmesi web bağlamının kendisidir (`CLAUDE §1` · `WarehouseContext.warehouseIds`):
 * **tek kimlik ya da dizi = o depo(lar) · boş dizi = hiçbiri · `undefined` = depo-üstü.** Sonuncusu
 * yalnız kapsamı sınırsız yönetici içindir ve bir kestirme DEĞİL: kapsamı olmayan kişiye boş liste
 * göstermek, kapsamı sınırsız olana da boş liste göstermek olurdu — biri doğru, öteki yanlış cevap.
 *
 * ── LİSTE NEDEN SINIRSIZ BÜYÜMEZ ────────────────────────────────────────────
 * `returned` kalıcı bir durum DEĞİL: durum makinesi `returned → completed` diyor (*"depo aksiyonu +
 * para iadesi bitince sipariş kapanır; kalıcı `returned`'da kalmaz"*). Küme, açık iade süreçleri
 * kadardır — transfer listesiyle aynı sınıf (CLAUDE.md §1'in "doğal tavanı olan küme" dalı).
 * **Bilinen sınır:** okuma yine de tavanlı (`limit`) — ama tavan artık EN YENİDEN dolar (25.08).
 * Eskiden en eski satırlardan doluyordu ve bu, tavanın en kötü uygulanışıydı: liste zaten "en yeni
 * başta" sıralanıyor, yani birikmiş bir rampada bugün dönen koli hiç görünmüyor, üstelik liste dolu
 * göründüğü için yokluğu da fark edilmiyordu. Kayan uç şimdi en eskiler; iade süreci kapatılmadan
 * biriken en eski dönüşler pencerenin dışında kalır ve bu doğru ödünleşme — imleç açmak, kümenin
 * büyümemesi gerektiği gerçeğini gizlemek olurdu.
 *
 * ── PARA BU DOSYADAN GEÇMEZ ─────────────────────────────────────────────────
 * Depo kapılarının kuralı burada da geçerli: dönen görünümde tutar YOK. İade tutarı yalnız YAZIM
 * cevabında (`adjustFulfillment`) döner ve onu yönetim akışı okur — dönüşü karşılayan depocu değil.
 */

/** Dönen kolinin tek satırı — kimliğiyle, çünkü akıbet satır satır işaretlenir. */
export interface ReturnDropLine {
  orderItemId: string;
  /** "Ürün (boy)" — operasyon dili Türkçe (CLAUDE.md §2). */
  name: string;
  /**
   * **Hâlihazırda karşılanmış adet** — ekranın tavanı budur, sipariş edilen adet DEĞİL.
   *
   * Kural yazımın kendisinde: `adjust_fulfillment` (0020) hedef değeri mevcut karşılanan adedin
   * üstüne çıkaramaz (*"karşılanan miktar artırılamaz"*). Sipariş adedini göstermek, depocuya
   * kapının reddedeceği bir sayı girdirirdi.
   */
  fulfilledQty: number;
  /** Doluysa bu satırın akıbeti ZATEN işaretlenmiş — ekran onu ikinci kez göndermez. */
  disposition: ReturnDisposition | null;
}

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
 * **Depoya geri gelenler** (D6). Yalnız akıbeti BEKLEYEN kalemi olan siparişler döner.
 *
 * Tamamı işaretlenmiş bir sipariş listeden düşer: depocunun işi bitmiştir, kalanı (iade ve kapanış)
 * yönetim akışının. Ama **yarısı işaretlenmiş sipariş satırlarının TAMAMIYLA** döner — bir kolinin
 * yarısı iade, yarısı jest olabilir ve depocu neyi karara bağladığını görmeden kalanı işaretleyemez.
 *
 * **Ulaşılamayanlar bu listede YOK ve olmamalı:** o mal kabul edilmedi, araçta kaldı ve yarına
 * devroldu (v2:505) — sipariş `ready`'e döner, deponun rampasına hiç girmez.
 *
 * @param db service-role istemci — çağıran enjekte eder (`serviceDb()`), `auth/otp` deseni.
 */
export async function listWarehouseReturns(
  db: SupabaseClient,
  input: { warehouseId: string | readonly string[] | undefined; limit?: number },
): Promise<ReturnDrop[]> {
  const orders = await new OrderService(db).listByStatus(['returned'], {
    warehouseId: input.warehouseId,
    limit: input.limit ?? 50,
    // Tavan EN YENİDEN dolar (düzeltildi 25.08). Varsayılan `asc` ile en eski 50 alınıyordu ve
    // aşağıdaki sıralama onları "en yeni başta" diye diziyordu — tavana dayanan bir rampada bugün
    // dönen koli hiç görünmezdi, üstelik liste dolu göründüğü için kimse fark etmezdi.
    orderDirection: 'desc',
  });
  if (orders.length === 0) return [];

  const orderIds = orders.map((order) => order.id);
  const courierIds = [...new Set(orders.map((order) => order.courierId).filter((id): id is string => id !== null))];

  const [items, logs, couriers] = await Promise.all([
    new OrderItemService(db).listByOrders(orderIds),
    new OrderStatusLogService(db).listByOrders(orderIds),
    // Boş listede servis kendi kısa devresini yapıyor (`listByIds`), ayrı bir dal gerekmiyor.
    new UserProfileService(db).listByIds(courierIds),
  ]);
  const names = await variantNames(db, items.map((item) => item.variantId));
  const courierOf = new Map(couriers.map((courier) => [courier.id, courier.name]));

  const drops: ReturnDrop[] = [];
  for (const order of orders) {
    const lines = items.filter((item) => item.orderId === order.id);
    // Ölçüt "hiç kalem var mı" değil, "AKIBETİ BEKLEYEN kalem var mı": tamamı işaretlenmiş sipariş
    // depocunun işi olmaktan çıkmıştır ve listede kalırsa gerçek işi gölgeler.
    if (!lines.some((line) => line.returnDisposition === null)) continue;

    const returnedLog = logs.filter((log) => log.orderId === order.id && log.toStatus === 'returned').at(-1);
    drops.push({
      orderId: order.id,
      referenceNo: order.referenceNo,
      warehouseId: order.warehouseId,
      courierId: order.courierId,
      courierName: order.courierId ? (courierOf.get(order.courierId) ?? null) : null,
      note: returnedLog?.note ?? null,
      returnedAt: returnedLog?.createdAt ?? null,
      lines: lines.map(toDropLine(names)),
    });
  }

  // En YENİ dönüş önce: rampadaki koli hâlâ ortadayken işaretlenir. Geçiş kaydı olmayan satır
  // (elle yazılmış durum) en sona düşer — uydurma bir zaman vermektense sırayı kaybetsin.
  return drops.sort((a, b) => (b.returnedAt ?? '').localeCompare(a.returnedAt ?? ''));
}

/** Kalem → döküm satırı. Ad çözümü kuyruğun ortak okumasından (`names.ts`), ikinci kez kurulmaz —
    tip de oradan türer: haritanın şekli elle ikinci kez yazılırsa alan eklendiğinde ayrışır (yaşandı 23.08). */
function toDropLine(names: Awaited<ReturnType<typeof variantNames>>) {
  return (item: OrderItem): ReturnDropLine => ({
    orderItemId: item.id,
    name: displayName(names.get(item.variantId)),
    fulfilledQty: item.fulfilledQty,
    disposition: item.returnDisposition,
  });
}

// ── RAMPA LİSTESİ (D6 · tasarım "D6 Rampa Listesi", 04.09) ───────────────────

/**
 * Rampada teslim vermeyi bekleyen bir kurye — listenin tek satırı.
 *
 * ── NEDEN SATIR KURYE, SEFER DEĞİL ──────────────────────────────────────────
 * Para SEFER başına kapanır (18.08 K1: *"fark hangi seferde doğdu"*), mal ise KURYE başına teslim
 * alınır. Ayrım keyfî değil fiziksel: araç bir yerdedir ve o gün tek kuryenin yükünü taşır (veri
 * kuralı `assert_vehicle_single_courier`), yani iki sefer sürmüş kurye rampaya BİR KEZ döner ve
 * araç BİR KEZ boşalır. Satırı sefere bağlasaydık aynı aracın serbest ürünü iki satırda iki kez
 * sayılırdı — ikisi de aynı araç deposunu okuyor.
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
 * **Rampada kim bekliyor.** Dönen siparişler + araçtan inecek kutular + araçtaki serbest ürün, tek
 * listede ve kurye başına toplanmış hâlde.
 *
 * ── LİSTEYE GİRME ÖLÇÜTÜ: YAPILACAK BİR İŞ VAR MI ───────────────────────────
 * Satır yalnız akıbet bekleyen kalem, inecek kutu ya da araçta serbest ürün varsa çizilir. **Yalnız
 * araçta malı olan kurye de listededir** ve bu, listenin en kolay unutulacak yarısı: kurye
 * denetiminin ölçtüğü "kaybolan mal" tam orada doğuyordu (03.09 bulgu 5) — araçtaki serbest ürün
 * hiçbir mutabakata girmiyordu. Yalnız ARAÇTA KALAN kutusu olan kurye ise listede YOK: o kutular
 * tanımı gereği kalıyor, yapılacak bir iş yok.
 *
 * ── KAPSAM DIŞI KURYE SESSİZCE DÜŞMEZ ───────────────────────────────────────
 * Dönen bir siparişin kuryesi bu tesise bağlı olmayabilir (personel taşınmış, sipariş devredilmiş).
 * Mal yine bu rampada duruyor ve akıbeti burada işaretlenir; o satır araç bölümü olmadan çizilir.
 * Kuryeyi listeden atmak, elimizdeki koliyi görünmez yapardı.
 *
 * @param db service-role istemci — çağıran enjekte eder (`serviceDb()`), `auth/otp` deseni.
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
 * **Bir kuryenin rampadaki her şeyi.** İki kapının cevabı burada birleşiyor çünkü ekran tek
 * dokunuşla ikisini birden yazıyor; iki ayrı okuma, tek görünen işi iki yarım fotoğraftan kurmak
 * olurdu.
 *
 * `courierId: null` = kuryesiz küme: yalnız döküm döner, araç bölümleri boştur. Ayrı bir tip
 * yazılmadı — fark tipin şeklinde değil, hangi bölümlerin boş olduğunda ve ekran boş bölümü zaten
 * çizmiyor.
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
  /*
    ── ARAÇ REDDEDİLDİ, DÖKÜM REDDEDİLMEZ (kusur, ölçüldü 04.09) ──────────────
    Kurye künyesi çözülemeyebilir: rolü alınmış, başka tesise taşınmış, ya da sipariş devredilirken
    kurye bağı eskimiş olabilir. İlk yazımda bu hâlde kapı `forbidden` dönüyordu ve liste ile detay
    ÇELİŞİYORDU — liste o kuryeye satır açıyor (mal bu rampada duruyor, akıbeti burada işaretlenir)
    ama satıra dokunulunca ekran "başka deponun" diyordu. Dönen koli o an hiçbir yerden
    işaretlenemez hâle gelirdi.

    Reddin koruduğu şey ARAÇ verisidir (başka bir tesisin aracının stoğu), döküm değil: döküm zaten
    `warehouseId` ile süzülmüş, yani bu deponun kendi rampasıdır. O yüzden künye düşerse araç
    bölümleri BOŞ döner, döküm durur. Gerçekten gösterilecek bir şey yoksa (döküm de boşsa) ret
    olduğu gibi geçer — orada söylenecek doğru cevap "senin değil"dir.
  */
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
  return drops.reduce((sum, drop) => sum + drop.lines.filter((line) => line.disposition === null).length, 0);
}

/** Sipariş başına gruplu kutuların TOPLAM adedi — kart "kaç kutu" der, "kaç sipariş" değil. */
function countBoxes(cards: ReadonlyArray<{ boxes: readonly unknown[] }> | undefined): number {
  return (cards ?? []).reduce((sum, card) => sum + card.boxes.length, 0);
}
