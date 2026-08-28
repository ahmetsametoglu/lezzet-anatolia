import { OrderBoxService, ShipmentService } from '@lezzet/database';
import type { Carrier, ShipmentStatus } from '@lezzet/types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { trackingUrlOf } from '../order/carrier';

/**
 * **SİPARİŞİN TAKİP KÜNYESİ** (07.12) — müşteriye gösterilen her yerin TEK kaynağı.
 *
 * ── NEDEN TEK KAPI ──────────────────────────────────────────────────────────
 * Aynı bilgi üç yerde görünüyor: "yolda" e-postası, müşteri sipariş detayı ve (yarın) mobil
 * sözleşmesi. Üçü kendi sorgusunu yazsaydı, çok kutulu hâl birinde doğru ötekinde eksik olurdu —
 * ve eksik olan taraf hata vermez, yalnız bir kutuyu hiç göstermez.
 *
 * ── İKİ MEŞRU KAYNAK, SESSİZ YEDEK DEĞİL ────────────────────────────────────
 * 1. **Gönderi satırları** (`shipment` + `order_box`) — sağlayıcıdan duyurulan kargo. Asıl yol.
 * 2. **`order.carrier` / `order.tracking_number`** — hazırlık panelinden ELLE girilen numara
 *    (`setShipmentAction`). Sağlayıcının kapsamadığı taşıyıcı için bilinçli bir kapı, ölü kolon
 *    değil (§4.3: enum emekliye ayrılıyor ama elle giriş şeridi kalıyor).
 *
 * Sıra önemli: gönderi satırı varsa o konuşur. İkisi birden dolu olduğunda elle girilen numara
 * bayattır — duyuru sağlayıcıdan gerçek numarayı almıştır.
 *
 * ── ÇOK KOLİ ────────────────────────────────────────────────────────────────
 * Multicollo'da **her kolinin AYRI takip numarası var** (ölçüldü). Tek numara döndürmek, üç
 * kutulu bir siparişin ikisini görünmez kılardı; o yüzden bu kapı DİZİ döner ve her satır kendi
 * sırasını (`1/3`) taşır.
 */

export interface TrackedParcel {
  /** Sipariş içi kutu sırası — "Kutu 2/3"ün ikisi. */
  boxNo: number;
  /** Siparişin toplam kutu sayısı; tek kutuluda 1 ve ekran sırayı hiç göstermez. */
  totalBoxes: number;
  trackingNumber: string;
  /** Taşıyıcının takip sayfası. Bazı taşıyıcıda yok, elle girişte de yok. */
  trackingUrl: string | null;
}

export interface OrderTracking {
  /** Taşıyıcının insan adı ("Chronopost"); elle girişte kodun kendisi. */
  carrierName: string | null;
  /** Gönderinin durumu; elle girilen numarada `null` — o yolda gönderi satırı yok. */
  status: ShipmentStatus | null;
  parcels: TrackedParcel[];
}

/**
 * Siparişin takip künyesi. Takip edilecek bir şey yoksa **`null`** — boş dizi değil: "kargo var
 * ama numarası yok" ile "kargo yok" ayrı hâller ve ekran ikisine aynı cümleyi kuramaz.
 */
export async function readOrderTracking(
  db: SupabaseClient,
  orderId: string,
  /** Elle girilen yedek — çağıran zaten siparişi okumuştur, ikinci kez okutmayalım. */
  manual: { carrier: Carrier | null; trackingNumber: string | null } = { carrier: null, trackingNumber: null },
): Promise<OrderTracking | null> {
  const shipments = await new ShipmentService(db).listByOrder(orderId);
  // İptal edilmiş gönderi takip edilmez: numarası ölüdür, gösterilmesi müşteriyi boş bir sayfaya
  // yollar. Aktif gönderi yoksa elle girilen numaraya düşülür.
  const shipment = shipments.find((s) => s.cancelledAt === null && s.status !== 'cancelled');

  if (shipment) {
    const boxes = (await new OrderBoxService(db).listByOrder(orderId)).filter((b) => b.shipmentId === shipment.id);
    const parcels = boxes
      .filter((b): b is typeof b & { trackingNumber: string } => Boolean(b.trackingNumber))
      .map((b) => ({ boxNo: b.boxNo, totalBoxes: boxes.length, trackingNumber: b.trackingNumber, trackingUrl: b.trackingUrl }));
    // Duyuruldu ama numara henüz yazılmadı: gönderi VAR, takip yok. Ekran taşıyıcıyı söyleyip
    // numarayı beklemekte haklıdır — künye bu yüzden `parcels: []` ile döner, `null` ile değil.
    return { carrierName: shipment.carrierName ?? shipment.carrierCode, status: shipment.status, parcels };
  }

  if (!manual.trackingNumber) return null;
  return {
    carrierName: manual.carrier,
    status: null,
    // Elle girişte bağlantı taşıyıcının URL KALIBINDAN üretilir (`trackingUrlOf`) — sağlayıcı
    // yolunda bağlantıyı taşıyıcı zaten veriyor. Bunu atlasaydık bugün çalışan bir düğme
    // ("Kargoyu takip et") elle girilen numaralarda sessizce kaybolurdu.
    parcels: [
      { boxNo: 1, totalBoxes: 1, trackingNumber: manual.trackingNumber, trackingUrl: trackingUrlOf(manual.carrier, manual.trackingNumber) },
    ],
  };
}

/**
 * Kutu sırası etiketi — **dilden bağımsız** (`"2/3"`), bilerek. "Kutu 2/3" demek üç dile birden
 * sözlük satırı eklemek olurdu; oysa bilgi bir sayı çiftidir ve rakamlar her dilde aynı okunur.
 * Tek kutuluda sıra YOKTUR: `1/1` yazmak, olmayan bir bölünmeyi varmış gibi gösterirdi.
 */
export function parcelOrdinal(parcel: TrackedParcel): string | null {
  return parcel.totalBoxes > 1 ? `${parcel.boxNo}/${parcel.totalBoxes}` : null;
}
