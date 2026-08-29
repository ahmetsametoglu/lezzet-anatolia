import { OrderBoxService, OrderService, ShipmentEventService, ShipmentService } from '@lezzet/database';
import type { OrderBox } from '@lezzet/types';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { OrderEffects } from '../order/effects';
import { siparisiTasi } from './sync-status';

/**
 * **DEVİR OKUTMASI** (07.12) — kutu fiziksel olarak taşıyıcıya verildi.
 *
 * ── NEDEN KURYE KAPISINDAN AYRI ─────────────────────────────────────────────
 * `courier/load.ts` aynı fiziksel olayı yazıyor (kutu depodan çıktı) ama kapısı KURYEYE bağlı:
 * `order.courierId` şartına bakıyor ve kargo siparişinin kuryesi YOK. Kargo kulvarına kendi
 * kapısı gerekti — kural aynı değil, çünkü sahiplik sorusu farklı: orada "bu kutu senin rotanın
 * mı", burada "bu kutu senin deponun mu".
 *
 * ── OKUTULAN ŞEY TAŞIYICININ NUMARASI ───────────────────────────────────────
 * Kargo kulvarında bizim QR'lı kutu etiketimiz BASILMIYOR (tasarım §4.6: kutunun üstünde iki
 * barkod taşıyıcının tarayıcısını şaşırtır). Yani kutunun üstündeki tek barkod taşıyıcınınki ve
 * devir onu okutuyor.
 *
 * **Bizim kodumuz yine de kabul ediliyor** ve bu bir yedek değil bir GERÇEK: etiket basılamamış
 * (`no_label`) ya da elle taşıyıcı girilmiş gönderilerde kutunun üstünde taşıyıcı barkodu
 * olmayabilir; o hâlde depocunun elinde hazırlık kâğıdındaki kod kalır. İki kimlik uzayı da
 * BİZİM kayıtlarımız — tahmin yok, iki kolonda arama var.
 *
 * ── SİPARİŞİ TAŞIYAN KURAL KOPYALANMADI ─────────────────────────────────────
 * "Gönderi yolda ⇒ sipariş `out_for_delivery`" kuralı webhook'un kapısında yazılı ve oradan
 * çağrılıyor (`siparisiTasi`). İkinci bir kopya, bir gün yalnız birinde değişen iki durum
 * makinesi olurdu.
 */

export type HandoverOutcome =
  /** Kutu devredildi. Sayaçlar gönderinin TAMAMINI anlatıyor — depocu "kaç kaldı" diye sorar. */
  | {
      status: 'ok';
      boxNo: number;
      referenceNo: string | null;
      handedBoxes: number;
      boxCount: number;
      /** Son kutu muydu — gönderi `handed_over`a geçti ve sipariş yola çıktı. */
      shipmentHandedOver: boolean;
    }
  /** İkinci okutma HATA DEĞİL: "zaten verildi". Sayaç kıpırdamaz, depocu sayımına güvenir. */
  | { status: 'already_handed'; boxNo: number; handedBoxes: number; boxCount: number }
  | { status: 'unknown_code' }
  /** Kutu başka deponun — referans söylenir ki depocu onu doğru yığına geri koysun. */
  | { status: 'out_of_scope'; referenceNo: string | null }
  /** Kutu mühürlü değil: açık kutu taşıyıcıya verilemez. */
  | { status: 'not_sealed'; boxNo: number }
  /** Gönderi henüz duyurulmadı — satın alınmamış bir etiketle kutu taşıyıcıya verilemez. */
  | { status: 'not_announced'; boxNo: number };

export async function handOverBox(
  db: SupabaseClient,
  input: { code: string; warehouseId: string; actorId: string; effects?: OrderEffects },
): Promise<HandoverOutcome> {
  const code = input.code.trim();
  if (code.length === 0) return { status: 'unknown_code' };

  const boxes = new OrderBoxService(db);
  // Sıra bilinçli: kargo kulvarında kutunun üstünde TAŞIYICININ etiketi var, bizimki değil.
  const box = (await boxes.getByTrackingNumber(code)) ?? (await boxes.getByCode(code));
  if (!box) return { status: 'unknown_code' };

  const order = await new OrderService(db).getById(box.orderId);
  // Kutusu olan sipariş silinemez (cascade kutuyu da götürür) — bu dal saf savunma.
  if (!order) return { status: 'unknown_code' };
  if (box.warehouseId !== input.warehouseId) return { status: 'out_of_scope', referenceNo: order.referenceNo };
  if (box.sealedAt === null) return { status: 'not_sealed', boxNo: box.boxNo };
  if (box.shipmentId === null) return { status: 'not_announced', boxNo: box.boxNo };

  /*
    SAYIM GÖNDERİNİN TAMAMINI ANLATIR, SİPARİŞİNKİNİ DEĞİL.

    Bir siparişin kutuları teoride iki gönderiye bölünebilir (ilk duyuru iptal edilip yeniden
    duyurulmuş olabilir). Depocunun elindeki yığın DUYURULAN gönderidir; "3 kutudan 2'si verildi"
    cümlesi o kümeyi saymazsa yanlış bir güven verir.
  */
  const kardesler = (await boxes.listByOrder(box.orderId)).filter((row) => row.shipmentId === box.shipmentId);
  const digerleriVerildi = kardesler.filter((row) => row.id !== box.id && row.loadedAt !== null).length;

  if (box.loadedAt !== null) {
    return { status: 'already_handed', boxNo: box.boxNo, handedBoxes: digerleriVerildi + 1, boxCount: kardesler.length };
  }

  await boxes.update({ id: box.id, loadedAt: new Date().toISOString(), loadedBy: input.actorId });

  const handedBoxes = digerleriVerildi + 1;
  const hepsi = handedBoxes === kardesler.length;

  if (hepsi) await gonderiyiDevret(db, box, kardesler.length, input.effects);

  return {
    status: 'ok',
    boxNo: box.boxNo,
    referenceNo: order.referenceNo,
    handedBoxes,
    boxCount: kardesler.length,
    shipmentHandedOver: hepsi,
  };
}

/**
 * Son kutu da verildi → gönderi `handed_over`, sipariş yola çıkar, deftere satır düşülür.
 *
 * **Gönderi ilerideyse geri çekilmez:** taşıyıcı bizden önce okutmuş olabilir (webhook `in_transit`
 * yazmış) ve devir okutması onu `handed_over`a geri almamalı — geriye giden bir durum, zaten
 * gerçekleşmiş bir olayı yok saymaktır.
 */
async function gonderiyiDevret(
  db: SupabaseClient,
  box: OrderBox,
  boxCount: number,
  effects: OrderEffects | undefined,
): Promise<void> {
  const shipments = new ShipmentService(db);
  const shipment = await shipments.getById(box.shipmentId!);
  if (!shipment) return;

  if (shipment.status === 'created') await shipments.setStatus(shipment.id, 'handed_over');

  // Defterin satırı BİZİM gözlemimiz: kaynağı sağlayıcı değil depo. `providerCode` bunu söylüyor —
  // uzlaştırma turu bir gün "bu satırı kim yazdı" diye sorduğunda cevap kaydın içinde olsun.
  await new ShipmentEventService(db).insert({
    shipmentId: shipment.id,
    providerCode: 'HANDOVER_SCAN',
    mappedStatus: 'handed_over',
    message: `${boxCount} kutu depoda okutuldu`,
    occurredAt: new Date().toISOString(),
  });

  await siparisiTasi(db, { ...shipment, status: 'handed_over' }, 'handed_over', effects);
}
