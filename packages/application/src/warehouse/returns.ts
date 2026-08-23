import { OrderItemService, OrderService, OrderStatusLogService, UserProfileService } from '@lezzet/database';
import type { OrderItem, ReturnDisposition } from '@lezzet/types';
import type { SupabaseClient } from '@supabase/supabase-js';
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
 * ── LİSTE NEDEN SINIRSIZ BÜYÜMEZ ────────────────────────────────────────────
 * `returned` kalıcı bir durum DEĞİL: durum makinesi `returned → completed` diyor (*"depo aksiyonu +
 * para iadesi bitince sipariş kapanır; kalıcı `returned`'da kalmaz"*). Küme, açık iade süreçleri
 * kadardır — transfer listesiyle aynı sınıf (CLAUDE.md §1'in "doğal tavanı olan küme" dalı).
 * **Bilinen sınır:** okuma yine de tavanlı (`limit`) ve tavan en ESKİ satırlardan doldurulur; iade
 * süreci kapatılmadan biriken sipariş sayısı tavanı aşarsa yeni dönüşler pencerenin dışında kalır.
 * Tavan bu yüzden cömert ve parametrik — imleç açmak, kümenin büyümemesi gerektiği gerçeğini
 * gizlemek olurdu.
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
  input: { warehouseId: string; limit?: number },
): Promise<ReturnDrop[]> {
  const orders = await new OrderService(db).listByStatus(['returned'], {
    warehouseId: input.warehouseId,
    limit: input.limit ?? 50,
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
