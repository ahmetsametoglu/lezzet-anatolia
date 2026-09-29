import { z } from 'zod';
import {
  CarrierEnum,
  CustomerOrderStatusEnum,
  DeliveryTypeEnum,
  PaymentMethodEnum,
  PaymentStatusEnum,
} from '../primitives/enums.schema';
import { CatalogImageSchema } from './catalog-api.schema';

/**
 * `/api/v1/me/orders` sözleşmesi: "Siparişlerim" listesi ve sipariş detayı; üreten uç ile tüketen ekran aynı şemayı çağırır. Para ham
 * cent, tarih ham ISO; sipariş referansla adreslenir, yalnız numarası henüz doğmamış ödeme bekleyen sipariş kimliğiyle gelir.
 */

/** Liste satırının ortak alanları: tarih, toplam, kalem sayısı ve küçük resim yığını; `active` motorun kararıdır, ekranda türetilmez. */
const MeOrderSummaryBaseSchema = z.object({
  /** Sipariş anı (ISO) — biçimleme cihazda (dil cihazın kararı). */
  placedAt: z.string(),
  /** Müşterinin hâlâ beklediği bir hareket var mı — liste bunu üstte/ayrı çizer. */
  active: z.boolean(),
  totalCents: z.number().int(),
  /** Sipariş KALEM sayısı (satır sayısı, adet toplamı değil) — kartın "· N ürün" künyesi. */
  itemCount: z.number().int().min(0),
  /** Tekilleştirilmiş ve sunucuda sınırlı küçük resimler; kalanın sayısı `moreCount`ta. */
  thumbs: z.array(z.object({ name: z.string(), image: CatalogImageSchema })),
  /** Yığına sığmayan kalem sayısı; `0` = "+N" yazılmaz. */
  moreCount: z.number().int().min(0),
});

/** Numaralı sipariş: numara hem gösterilen künye hem detayın adresidir, boş olamaz. */
export const MeNumberedOrderSummarySchema = MeOrderSummaryBaseSchema.extend({
  reference: z.string().min(1),
  status: CustomerOrderStatusEnum.exclude(['awaiting_payment']),
});
export type MeNumberedOrderSummary = z.infer<typeof MeNumberedOrderSummarySchema>;

/** Ödeme bekleyen kart siparişi: numarası onayla doğar, satır ödeme ekranını sipariş kimliğiyle açar. */
export const MePendingOrderSummarySchema = MeOrderSummaryBaseSchema.extend({
  reference: z.null(),
  status: z.literal('awaiting_payment'),
  orderId: z.string().uuid(),
});

export const MeOrderSummarySchema = z.union([MeNumberedOrderSummarySchema, MePendingOrderSummarySchema]);
export type MeOrderSummary = z.infer<typeof MeOrderSummarySchema>;

/**
 * Sayfa zarfı; `nextCursor` opak dizedir ve istemci onu aynen geri verir, `null` liste bitti demek. İmleç URL'e yazılmaz ve `total`
 * yok, çünkü tasarımda sayaç yok ve süzgeç eklendiği gün yalan söyleyecek bir alan taşınmaz.
 */
export const MeOrderPageSchema = z.object({
  orders: z.array(MeOrderSummarySchema),
  nextCursor: z.string().nullable(),
});
export type MeOrderPage = z.infer<typeof MeOrderPageSchema>;

/**
 * Zaman çizgisinin sabit durakları, motorun `OrderMilestone`unun sözleşme ikizi; şeklin sapmadığını uç derlemede kanıtlar.
 * `prepared` iç durum `ready`ye bakar; gel-al çizgisinde yola çıkma yerine tek durak `ready_for_pickup` vardır.
 */
export const OrderMilestoneEnum = z.enum(['received', 'prepared', 'on_the_way', 'ready_for_pickup', 'delivered']);
export type OrderMilestone = z.infer<typeof OrderMilestoneEnum>;

export const OrderTimelineStepSchema = z.object({
  milestone: OrderMilestoneEnum,
  state: z.enum(['done', 'current', 'pending']),
  /**
   * Adımın gerçekleştiği an; **kaydı yoksa `null`** — durum çıkarsanabilir, damga çıkarsanamaz
   * (motor künyesi). Ekran o adımın altına saat yazmaz; uydurmaz.
   */
  at: z.string().nullable(),
});
export type OrderTimelineStep = z.infer<typeof OrderTimelineStepSchema>;

/**
 * Detayın tek satırı: künye ve sipariş anındaki para. Paket tek satırdır ve katlama sunucuda yapılır, çünkü müşteri onu bütün olarak
 * aldı ve kalem fiyat kırılımını hiç görmedi.
 */
export const MeOrderLineSchema = z.object({
  /** Satır anahtarı — varyant satırında kalem kimliği, paket satırında sentetik (`bundle:…`). */
  id: z.string(),
  /** Paket satırında paket adı, varyant satırında ürün adı; ürün silinmişse boş olabilir. */
  name: z.string(),
  /** Boy etiketi ("500 g"); tek boylu üründe ve paket satırında BOŞ. */
  unitLabel: z.string(),
  image: CatalogImageSchema,
  /** Paket künyesi — `null` = düz varyant satırı. */
  bundle: z
    .object({
      itemCount: z.number().int().min(1),
      /** İçerik ADLARI — müşteri "Bayram Sofrası"nın ne olduğunu hatırlamak zorunda kalmasın. */
      contents: z.array(z.string()),
    })
    .nullable(),
  /** Sipariş edilen miktar (pakette: kaç paket). */
  qty: z.number().int(),
  /**
   * Paranın hesaplandığı miktar. Hazırlık onaylanmadan önce **`qty`nin kendisidir**: o aşamada
   * `fulfilled_qty` yazılmamış bir varsayılandır, ölçüm değil (`isFulfilmentKnown` — CLAUDE §1
   * "ölçülemeyen değer sıfır değildir"; karıştırıldığı gün ekran her siparişi boş gösterdi).
   */
  billedQty: z.number().int(),
  /** Eksik karşılama GERÇEKTEN var mı — ekran yeniden hesaplamaz, kural tek yerde. */
  shortfall: z.boolean(),
  /** Eksik gelen miktarın para karşılığı; `shortfall` yanlışken `0`. */
  shortfallCents: z.number().int(),
  unitPriceCents: z.number().int(),
  lineTotalCents: z.number().int(),
});
export type MeOrderLine = z.infer<typeof MeOrderLineSchema>;

/**
 * Kargo künyesi; `null` rota siparişi ya da taşıyıcısı henüz girilmemiş kargo, ekran ikisinde de bloğu çizmez. `trackingUrl`
 * sunucuda türer: tanınmayan taşıyıcıda `null` gelir, ekran düğmeyi çizmez ama numarayı gösterir.
 */
export const MeOrderShipmentSchema = z.object({
  /** İlk koliyi anlatan eski alanlar; native hâlâ okuduğu için duruyor, çok kolili gönderinin doğrusu `carrierName` + `parcels`. */
  carrier: CarrierEnum,
  trackingNumber: z.string().nullable(),
  trackingUrl: z.string().nullable(),
  /**
   * Taşıyıcının GERÇEK adı ("Chronopost") — sağlayıcıdan geliyor ve çeviri istemez (özel isim).
   * Elle girilen taşıyıcıda enum anahtarıdır; ekran tanıdığı anahtarı çevirir, tanımadığını
   * olduğu gibi basar.
   */
  carrierName: z.string().nullable(),
  /**
   * **KOLİ BAŞINA TAKİP** — çok kolili gönderide (multicollo) her kolinin AYRI numarası var.
   * Tek numara taşıyan eski üç alan, üç kutulu bir siparişin ikisini görünmez kılıyordu.
   */
  parcels: z.array(
    z.object({
      /** Kutu sırası (`"2/3"`) — tek kutuluda `null`; dilden bağımsız, rakam çifti her dilde aynı. */
      ordinal: z.string().nullable(),
      trackingNumber: z.string(),
      trackingUrl: z.string().nullable(),
    }),
  ),
});

export type MeOrderShipment = z.infer<typeof MeOrderShipmentSchema>;

/** Sipariş detayı — sayfanın TAMAMI tek turda (kalemler, çizgi, adres, para; bölüm başına çağrı yok). */
export const MeOrderDetailSchema = z.object({
  reference: z.string().min(1),
  placedAt: z.string(),
  status: CustomerOrderStatusEnum,
  active: z.boolean(),
  deliveryType: DeliveryTypeEnum,
  /** Teslim günü (ISO tarih); kargoda ve gün seçilmemişse `null` — biz söz veremeyiz. */
  deliveryDate: z.string().nullable(),
  /** Teslimat adresinin sipariş anındaki hâli, canlı adres değil; parçalı taşınır, cümleyi ekran kurar. */
  address: z
    .object({
      line1: z.string().nullable(),
      line2: z.string().nullable(),
      postalCode: z.string().nullable(),
      city: z.string().nullable(),
    })
    .nullable(),
  lines: z.array(MeOrderLineSchema),
  /**
   * Dört adımlı çizgi; **iptal/iadede `null`** — tasarım orada "çizgi yerine tek durum bloğu"
   * istiyor ve kararı motor veriyor: iptal bir yolculuğun adımı değil, yolculuğun sonlanmasıdır.
   */
  timeline: z.array(OrderTimelineStepSchema).nullable(),
  /** Gel-al: müşterinin gideceği depo ve randevu için arayacağı numara; öteki türlerde `null` (adres bloğu o zaman müşterinin). */
  pickup: z.object({ warehouseName: z.string(), addressLine: z.string(), phoneDisplay: z.string() }).nullable(),
  subtotalCents: z.number().int(),
  discountCents: z.number().int(),
  /** İndirimin adı, seçili dilde çözülmüş; indirim yoksa boş dize. */
  discountLabel: z.string(),
  shippingFeeCents: z.number().int(),
  totalCents: z.number().int(),
  paymentMethod: PaymentMethodEnum.nullable(),
  paymentStatus: PaymentStatusEnum,
  /** Vadeli (B2B) — ödeme hapının ayrı bir hâli. */
  onAccount: z.boolean(),
  shipment: MeOrderShipmentSchema.nullable(),
  /**
   * Açık değerlendirme daveti; ekranın yorum teşviki onun varlığıyla çizilir. `null` davet yok, tamamlandı ya da süresi doldu
   * demektir ve ayrımı ekran bilmez.
   */
  feedback: z
    .object({
      /** Akışın anahtarı — ekran `/feedback/[token]`e bununla gider. */
      token: z.string().min(1),
      /** Tamamlamanın kazandıracağı puan; AYARDAN gelir, ekran rakam uydurmaz. */
      points: z.number().int().positive(),
    })
    .nullable(),
});
export type MeOrderDetail = z.infer<typeof MeOrderDetailSchema>;
