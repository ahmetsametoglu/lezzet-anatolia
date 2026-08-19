import 'server-only';
import { listPreparationQueue } from '@lezzet/application';
import {
  DeliveryZoneService,
  OrderItemService,
  OrderService,
  UserProfileService,
  WarehouseService,
  serviceDb,
} from '@lezzet/database';
import { titleOf } from '@/lib/catalog/title';
import { readStaff } from '@/lib/staff';
import { setupGapOf } from '@/lib/warehouse/setup-gap';
import {
  PREPARATION_LANES,
  type PreparationData,
  type PreparationLane,
  type PreparationLineView,
  type PreparationOrderView,
  type WarehouseChoiceView,
  type WarehouseWorkData,
  type WarehouseWorkView,
} from './preparation-types';

/**
 * **Hazırlık masasının okuması** (10.1–10.3) — `design/project/Operasyon - Depo Hazirlik.dc.html`.
 *
 * ── İŞ YOK, TÜRETİM VAR ─────────────────────────────────────────────────────
 * Kuyruğun kendisi kapıdan geliyor (`listPreparationQueue`: gün süzgeci, depo süzgeci, kalem başına
 * bölünmüş parti önerisi, ilerleme). Bu dosya tek bir şey yapıyor — ekranın okuduğu künyeleri ve
 * sayaçları türetmek. Sipariş ya da parti kararı BURADA verilmiyor.
 *
 * ── PARA BU YOLDAN GEÇMEZ ───────────────────────────────────────────────────
 * Kapı para alanı döndürmüyor ve bu dosya ikinci bir okuma açmıyor. Rol duvarı (tasarım: *"fiyat/
 * tutar/maliyet ve müşteri adresi/telefonu bu yüzeyde yoktur"*) böylece bir arayüz disiplini değil,
 * verinin şekli olarak duruyor.
 *
 * ── KUYRUK TEK BİR DEPONUNDUR ───────────────────────────────────────────────
 * Depo kimliği ZORUNLU (10.7 · `CLAUDE §1`). Eskiden opsiyoneldi ve boş bırakıldığında süzgeçsiz
 * okuma yapılırdı ("depo-üstü, yöneticiye açık"); o okuma tek depolu veride DOĞRU cevap verir ve
 * çok depoluda sessizce başka şehrin işini gösterirdi. Hangi depoda çalışıldığı sayfanın kararıdır
 * (`readWorkWarehouse`), bu dosyanınki değil — buraya artık yalnız kesinleşmiş bir kimlik gelir.
 */
export async function readPreparation(
  warehouse: { id: string; name: string },
  deliveryDate: string,
): Promise<PreparationData> {
  /**
   * **Gün süzgeci KAPIDAN kaldırıldı, kulvara çevrildi** (10.9, ölçüldü 19.08).
   *
   * Eskiden kapıya `deliveryDate = bugün` geçiyordu ve bu bir EŞİTLİK süzgeci: kargo siparişinin
   * teslim günü `NULL`dur ve eşitlik `NULL`u hiçbir zaman tutmaz. Ölçüm — STR'de hazırlanmayı
   * bekleyen 9 siparişin **3'ü kargoydu ve hiçbir günde görünmüyordu**; ekran 2 gösteriyordu.
   * Aynı süzgeç dünün hazırlanmamış siparişini de sessizce düşürüyordu: yapılmamış iş, ertesi gün
   * yok oluyordu.
   *
   * Tasarımın *"liste yalnız bugünün işi, arşiv yığılmaz"* kuralı BOZULMUYOR — tam tersine ilk kez
   * eksiksiz uygulanıyor: **geciken iş arşiv değildir, yapılmamış iştir**; kargonun ise bir günü
   * hiç yoktur. Yığılmaması gereken şey İLERİ tarihli sipariş ve o hâlâ dışarıda (aşağıda düşer).
   */
  const orders = await listPreparationQueue(serviceDb(), { warehouseId: warehouse.id });

  const views: PreparationOrderView[] = orders.flatMap((order) => {
    const lane = laneOf(order.deliveryDate, deliveryDate);
    // İleri tarihli sipariş kuyruğa GİRMEZ: bugünün işi değil ve listede görünmesi, bugün
    // hazırlanacakmış gibi okunurdu (tasarım §6 — arşiv/ileri tarih bu ekrana yığılmaz).
    if (lane === null) return [];
    const lines: PreparationLineView[] = order.lines.map((line) => {
      const remainingQty = Math.max(0, line.orderedQty - line.pickedQty);
      return {
        ...line,
        title: titleOf(line.productName, line.variantLabel),
        remainingQty,
        isPicked: remainingQty === 0,
        isPinned: line.pinnedStockId !== null,
        hasShortfall: line.shortfallQty > 0,
      };
    });

    return [
      {
        ...order,
        lines,
        lane,
        // "84 paket" — istenen adetlerin toplamı, toplanan değil: başlık siparişin BÜYÜKLÜĞÜNÜ
        // söylüyor (B2B'de hacim beklentisi kurar), ilerlemeyi ayrı sayaç söylüyor.
        totalQty: lines.reduce((sum, line) => sum + line.orderedQty, 0),
        isComplete: lines.every((line) => line.isPicked),
      },
    ];
  });

  // Sıra kulvarın ACİLİYETİDİR: geciken önce (dünün işi bugünün önüne geçer), sonra bugün, sonra
  // kargo (günü olmayan, yani bugüne yetişmesi gerekmeyen iş). Kulvar içinde kapının sırası korunur.
  const sirali = PREPARATION_LANES.flatMap((lane) => views.filter((order) => order.lane === lane));

  return {
    orders: sirali,
    readyCount: sirali.filter((order) => order.isComplete).length,
    deliveryDate,
    warehouseName: warehouse.name,
    warehouseId: warehouse.id,
  };
}

/**
 * Siparişin kulvarı — `null` ise kuyruğa hiç girmez (ileri tarihli).
 *
 * Karar SİPARİŞİN kendi verisinden çıkıyor: günü yok → kargo · günü geçmiş → geciken · günü bugün
 * → bugün. `delivery_type` kolonuna BAKILMIYOR ve bu kasıtlı — kulvarı belirleyen şey siparişin
 * nasıl gideceği değil, hazırlığın ne zaman gerektiğidir. Günü olmayan bir rota siparişi (veri
 * hatası) da kargo kulvarında görünür, yani görünmez olmaz.
 */
function laneOf(deliveryDate: string | null, today: string): PreparationLane | null {
  if (deliveryDate === null) return 'shipping';
  if (deliveryDate < today) return 'overdue';
  return deliveryDate === today ? 'today' : null;
}

/**
 * **Kapsamdaki her deponun bekleyen işi** (10.8, kullanıcı kararı 19.08).
 *
 * İki ekranın ortak zemini: karşılama ekranının satırları ve kuyruk ekranının kalıcı şeridi
 * buradan besleniyor. İkisine ayrı okuma yazmak, aynı deponun iki ekranda iki farklı sayıyla
 * görünmesine giden yoldu.
 *
 * ── TEK TUR, DEPO BAŞINA SORGU DEĞİL ────────────────────────────────────────
 * Kapsamdaki bütün depoların bekleyen siparişleri TEK sorguda geliyor, kalemleri ikinci bir
 * turda; kırılım burada yapılıyor. Depo başına sorgu (N+1) üç depoda altı tur demekti ve hepsi
 * aynı iki tabloya bakardı.
 *
 * ── KUYRUĞUN KENDİSİ BURADAN OKUNMAZ ────────────────────────────────────────
 * `listPreparationQueue` kalem başına parti önerisi çıkarıyor ve o hesap SİPARİŞ başına birkaç
 * sorgu demek — seçim ekranı için depo sayısıyla çarpılırdı. Buradaki sorular sayılabilir
 * sorular: kaç sipariş, kaç adet, en eskisi ne kadar geride. "Stoğu yetmeyen kalem var mı"
 * sorusu bu okumanın DIŞINDA ve bilerek: cevabı ancak tam kuyruk okumasıyla verilir.
 */
export async function readWarehouseWork(
  warehouseIds: readonly string[],
  today: string,
): Promise<WarehouseWorkData> {
  if (warehouseIds.length === 0) return { rows: [], truncated: false };
  const db = serviceDb();

  const [warehouses, page] = await Promise.all([
    new WarehouseService(db).list({ activeOnly: true, warehouseIds: [...warehouseIds] }),
    // Bekleyen iş KÜÇÜK bir kümedir (hazırlanınca kuyruktan düşer); tavan yine de veriliyor —
    // bozuk bir süzgecin tabloyu belleğe çekmesini engelliyor.
    new OrderService(db).listPage({ status: ['confirmed', 'preparing'], warehouseIds }, { limit: WORK_SCAN_LIMIT }),
  ]);

  // Kuyruğa GİREN siparişler: ileri tarihli olan hiçbir kulvara girmiyor (aşağıdaki `laneOf`),
  // dolayısıyla adedi ve B2B sayısı da onsuz hesaplanmalı. Aksi hâlde "340 adet" bugün
  // toplanmayacak malı da sayardı.
  const queued = page.rows.filter((order) => order.warehouseId !== null && laneOf(order.deliveryDate, today) !== null);

  // Kalemler TEK turda ve yalnız kuyruğa girenler için: adet, siparişin kendisinde durmuyor.
  const items = queued.length > 0 ? await new OrderItemService(db).listByOrders(queued.map((o) => o.id)) : [];
  const unitsByOrder = new Map<string, number>();
  for (const item of items) unitsByOrder.set(item.orderId, (unitsByOrder.get(item.orderId) ?? 0) + item.qty);

  const bos = (): Sayac => ({ today: 0, shipping: 0, overdue: 0, overdueOldestDays: null, inProgress: 0, unitCount: 0, b2bCount: 0 });
  const kova = new Map(warehouses.map((w) => [w.id, bos()]));

  for (const order of queued) {
    const k = kova.get(order.warehouseId!);
    if (!k) continue;

    // Üç kulvarın ayrımı SİPARİŞİN kendisinden geliyor, ekranın yorumundan değil:
    // günü yok → kargo · günü geçmiş → geciken · günü bugün → bugün.
    if (order.deliveryDate === null) k.shipping += 1;
    else if (order.deliveryDate < today) {
      k.overdue += 1;
      // En ESKİ gecikme kazanır: iki geciken siparişten kararı veren, daha uzun bekleyendir.
      const yas = gunFarki(order.deliveryDate, today);
      k.overdueOldestDays = k.overdueOldestDays === null ? yas : Math.max(k.overdueOldestDays, yas);
    } else k.today += 1;

    // Yarım kalmış = durumu `preparing`. Kulvardan BAĞIMSIZ sayılıyor: yarım bir kargo siparişi de
    // yarım bir bugün siparişi de aynı şeyi söyler — biri başlamış, bırakmış.
    if (order.status === 'preparing') k.inProgress += 1;
    if (order.channel === 'b2b') k.b2bCount += 1;
    k.unitCount += unitsByOrder.get(order.id) ?? 0;
  }

  return {
    rows: warehouses.map((w) => ({ id: w.id, code: w.code, name: w.name, ...(kova.get(w.id) ?? bos()) })),
    // Tavana dayanıldıysa sayılar EKSİK ve ekran bunu yazar (`CLAUDE §1` — sessiz kırpma yok).
    truncated: page.nextCursor !== null,
  };
}

/** İç sayaç — görünüm tipiyle aynı alanlar, künye alanları (id/kod/ad) olmadan. */
type Sayac = Omit<WarehouseWorkView, 'id' | 'code' | 'name'>;

/**
 * İki ISO tarih (`YYYY-MM-DD`) arasındaki tam gün farkı.
 *
 * `Date.parse` ISO tarihini UTC gece yarısı okur, yani ikisi de aynı dilimde — yaz saati geçişi
 * farkı bozmaz. Yerel saatle kurulan bir tarih, saat farkının denk geldiği günlerde 1 gün sapardı.
 */
function gunFarki(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
}

/**
 * **Depo seçim satırlarının okuması** (10.8, kullanıcı isteği 19.08).
 *
 * ── NEDEN BİR KAPI DEĞİL DE SATIRLAR ────────────────────────────────────────
 * Burası eskiden boş bir kapı ekranıydı ("Önce depo seçin") ve operatörü üst bardaki seçiciye
 * yolluyordu. Kural doğruydu — **varsayılan depo yoktur** — ama ekran o kuralı bir DUVAR olarak
 * uyguluyordu: koca bir alan, tek cümle, ve seçim başka bir yerde. Depo seçmek bir engel değil
 * sayfanın İLK ADIMIdır; satırlar o adımı ekranın içine alıyor ve seçimi bilgiyle besliyor —
 * operatör hangi depoda iş olduğunu görerek seçiyor, adını hatırlayarak değil.
 *
 * Kural bozulmuyor: hiçbir satır önceden seçili değil, hiçbiri "önerilen" diye işaretli değil.
 *
 * ── İŞİN ÜSTÜNE KURULUM ENGELİ ──────────────────────────────────────────────
 * `setupGapOf` Depolar sayfasının hesabı ve buraya ORADAN geliyor (`@/lib/warehouse/setup-gap`,
 * 19.32): cümlelerinden biri kelimesi kelimesine bu ekranın işi — *"kapsamlı personeli yok — mal
 * kabul ve hazırlık yapılamaz."* Bir depoda hiç personel yoksa oradaki sıfır, işin bitmiş olması
 * değil işin hiç yapılamaması demektir; ikisini ayırt etmeden seçim yaptırmak, operatörü girip
 * hiçbir şey yapamayacağı bir masaya oturtmaktı.
 */
export async function readWarehouseChoices(
  warehouseIds: readonly string[],
  today: string,
): Promise<WarehouseWorkData<WarehouseChoiceView>> {
  if (warehouseIds.length === 0) return { rows: [], truncated: false };
  const db = serviceDb();

  const [work, warehouses, zones, staff] = await Promise.all([
    readWarehouseWork(warehouseIds, today),
    // Künye alanları (`shipsOnline`, `isActive`) yalnız kurulum hesabı için — `readWarehouseWork`
    // bunları görünüme taşımıyor ve taşımamalı: şeridin sorusu iş, bu ekranınki iş + engel.
    new WarehouseService(db).list({ activeOnly: true, warehouseIds: [...warehouseIds] }),
    new DeliveryZoneService(db).listWithCodes(),
    readStaff(new UserProfileService(db)),
  ]);

  const kunye = new Map(warehouses.map((w) => [w.id, w]));

  return {
    ...work,
    rows: work.rows.map((row) => {
      const w = kunye.get(row.id);
      return {
        ...row,
        setupGap: w
          ? setupGapOf({
              isActive: w.isActive,
              shipsOnline: w.shipsOnline,
              activeZoneCount: zones.filter((z) => z.warehouseId === w.id && z.isActive).length,
              staffCount: staff.filter((p) => p.warehouseIds.includes(w.id)).length,
            })
          : null,
      };
    }),
  };
}

/**
 * Tarama tavanı. Bekleyen sipariş kümesi doğası gereği küçüktür (hazırlanınca kuyruktan düşer);
 * 200 gerçek bir kuyruğu asla kesmez ama bozuk bir sorgunun tabloyu belleğe çekmesini de engeller.
 * Tavan aşılırsa sayı yanlış değil EKSİK olur — ekran o hâlde "eksik" diye yazar (`truncated`),
 * ve bu tavanda kalmak bir arıza işaretidir.
 */
const WORK_SCAN_LIMIT = 200;
