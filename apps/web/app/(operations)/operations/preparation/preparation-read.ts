import 'server-only';
import { listPreparationQueue } from '@lezzet/application';
import { OrderService, WarehouseService, serviceDb } from '@lezzet/database';
import { titleOf } from '@/lib/catalog/title';
import {
  PREPARATION_LANES,
  type PreparationData,
  type PreparationLane,
  type PreparationLineView,
  type PreparationOrderView,
  type WarehouseChoiceView,
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
 * **Depo seçim kartlarının okuması** (10.8, kullanıcı isteği 19.08).
 *
 * ── NEDEN BİR KAPI DEĞİL DE KARTLAR ─────────────────────────────────────────
 * Burası eskiden boş bir kapı ekranıydı ("Önce depo seçin") ve operatörü üst bardaki seçiciye
 * yolluyordu. Kural doğruydu — **varsayılan depo yoktur** — ama ekran o kuralı bir DUVAR olarak
 * uyguluyordu: koca bir alan, tek cümle, ve seçim başka bir yerde. Depo seçmek bir engel değil
 * sayfanın İLK ADIMIdır; kartlar o adımı ekranın içine alıyor ve seçimi bilgiyle besliyor —
 * operatör hangi depoda iş olduğunu görerek seçiyor, adını hatırlayarak değil.
 *
 * Kural bozulmuyor: hiçbir kart önceden seçili değil, hiçbiri "önerilen" diye işaretli değil.
 *
 * ── TEK TUR, DEPO BAŞINA SORGU DEĞİL ────────────────────────────────────────
 * Kapsamdaki bütün depoların bekleyen siparişleri TEK sorguda geliyor, kırılım burada yapılıyor.
 * Depo başına sorgu (N+1) üç depoda üç tur demekti ve üçü de aynı tabloya bakardı.
 */
export async function readWarehouseChoices(
  warehouseIds: readonly string[],
  today: string,
): Promise<WarehouseChoiceView[]> {
  if (warehouseIds.length === 0) return [];
  const db = serviceDb();

  const [warehouses, page] = await Promise.all([
    new WarehouseService(db).list({ activeOnly: true, warehouseIds: [...warehouseIds] }),
    // Bekleyen iş KÜÇÜK bir kümedir (hazırlanmamış sipariş); tavan yine de veriliyor — sayfalama
    // gerektiren bir kuyruk zaten bir arıza işaretidir ve o hâlde sayı "200+" okunur.
    new OrderService(db).listPage({ status: ['confirmed', 'preparing'], warehouseIds }, { limit: CHOICE_SCAN_LIMIT }),
  ]);

  const bos = () => ({ today: 0, shipping: 0, overdue: 0 });
  const kova = new Map(warehouses.map((w) => [w.id, bos()]));

  for (const order of page.rows) {
    const k = order.warehouseId === null ? null : kova.get(order.warehouseId);
    if (!k) continue;
    // Üç kulvarın ayrımı SİPARİŞİN kendisinden geliyor, ekranın yorumundan değil:
    // günü yok → kargo · günü geçmiş → geciken · günü bugün → bugün. İleri tarihli sipariş
    // hiçbir kulvara girmez; o bugünün işi değil ve sayılması operatörü yanıltırdı.
    if (order.deliveryDate === null) k.shipping += 1;
    else if (order.deliveryDate < today) k.overdue += 1;
    else if (order.deliveryDate === today) k.today += 1;
  }

  return warehouses.map((w) => {
    const k = kova.get(w.id) ?? bos();
    return { id: w.id, code: w.code, name: w.name, ...k };
  });
}

/**
 * Kart taramasının tavanı. Bekleyen sipariş kümesi doğası gereği küçüktür (hazırlanınca kuyruktan
 * düşer); 200 gerçek bir kuyruğu asla kesmez ama bozuk bir sorgunun tabloyu belleğe çekmesini de
 * engeller. Tavan aşılırsa sayı yanlış değil EKSİK olur — o yüzden kartlar "en az" diye okunacak
 * bir sayı göstermez, ve bu tavanda kalmak bir arıza işaretidir.
 */
const CHOICE_SCAN_LIMIT = 200;
