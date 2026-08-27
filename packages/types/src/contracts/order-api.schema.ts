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
 * `/api/v1/me/orders` SÖZLEŞMESİ (21.18) — "Siparişlerim" listesi + sipariş detayı; mobil uçların
 * ve onları tüketen Expo ekranlarının ORTAK dili. Terfi gerekçesi `address-api.schema.ts` ile aynı
 * (02-mimari §3.2 "sözleşme tek kaynak"): üreten uç ile tüketen ekran aynı şemayı çağırır, alan adı
 * değişirse iki taraf birden DERLEME anında kırılır.
 *
 * ── PARA HAM CENT, TARİH HAM ISO ─────────────────────────────────────────────
 * Sunucu biçimli metin göndermez (katalog/paket sözleşmelerinin aynı kararı): aynı tutar üç dilde
 * üç ayrı yazımla görünür ve dil değişince sunucuya sormak gerekirdi. `…Cents` ile bitmeyen bir
 * para alanı YOKTUR — adlandırma kuralı süs değil, "euro'yu cent sanma" tuzağını satıra bakınca
 * görünür kılmak için konmuş (`apps/web/lib/order/customer-orders.ts` künyesi, 30.07 hatası).
 *
 * ── ADRESLEME REFERANSLA, KİMLİKLE DEĞİL (web'den bilinçli sapma) ────────────
 * Web'in `/orders/[reference]` rotası aslında sipariş UUID'sini taşıyor (segment adı öyle kalmış).
 * Mobil gerçekten referansı taşır: müşteriye gösterilen, destekle konuşurken kullanılan ve
 * `/support/new?order=LA-…` bağının zaten beklediği numara odur. `reference_no` benzersiz
 * (`order_reference_key`) ve okuma müşteriye süzülü — deneme yanılmayla başkasının siparişine
 * erişilemez. Bu yüzden zarf UUID TAŞIMAZ: ekranın ihtiyacı yok, taşımak da gereksiz bir iç kimlik
 * sızıntısı olurdu.
 */

/**
 * Liste satırı (v3 `vOrders` — `ov.rows`). Küme ekranın OKUDUĞU alanlardır: referans, tarih, durum,
 * toplam, kaç kalem, ve küçük resim yığınının beslendiği ilk birkaç ürün.
 *
 * `active` TAŞINIR, ekranda türetilmez: "hâlâ beklediğim bir şey var mı" kararı motorun
 * (`isActiveForCustomer`) ve iki yüzeyde iki kez hesaplanırsa bir gün ayrışır.
 */
export const MeOrderSummarySchema = z.object({
  /**
   * Sipariş numarası (`LA-26-UNJUXX`) — hem gösterilen künye hem detayın adresi.
   *
   * **Boş olamaz ve bu bir KİLİT:** referans ilk kalıcı durumda doğuyor (`create_order` /
   * `advance_order`), taslak ise listede zaten yok. Numarasız bir satır ekranda açılamayan bir
   * satır olurdu — şema onu parse anında keser, uç da anomaliyi kayda düşer.
   */
  reference: z.string().min(1),
  /** Sipariş anı (ISO) — biçimleme cihazda (dil cihazın kararı). */
  placedAt: z.string(),
  status: CustomerOrderStatusEnum,
  /** Müşterinin hâlâ beklediği bir hareket var mı — liste bunu üstte/ayrı çizer. */
  active: z.boolean(),
  totalCents: z.number().int(),
  /** Sipariş KALEM sayısı (satır sayısı, adet toplamı değil) — kartın "· N ürün" künyesi. */
  itemCount: z.number().int().min(0),
  /**
   * Küçük resim yığınının satırları — ad + görsel, kartın gösterdiği kadarıyla.
   *
   * TEKİLLEŞTİRİLMİŞ gelir (aynı ürünün iki boyu yığında iki halka olmaz) ve sunucuda SINIRLIDIR:
   * kart en çok birkaç halka çiziyor, kalanın adı hiç okunmayacakken tele verilmesi boşuna yük.
   * "+N" sayısı bu yüzden ayrı taşınır — ekran onu listenin uzunluğundan çıkaramaz.
   */
  thumbs: z.array(z.object({ name: z.string(), image: CatalogImageSchema })),
  /** Yığına sığmayan kalem sayısı; `0` = "+N" yazılmaz. */
  moreCount: z.number().int().min(0),
});
export type MeOrderSummary = z.infer<typeof MeOrderSummarySchema>;

/**
 * Sayfa zarfı. `nextCursor` **opak bir dize** (katalog sayfasının aynı kararı): istemci onu
 * yorumlamaz, bir sonraki isteğe `?cursor=` olarak aynen geri verir. `null` = liste bitti.
 *
 * **İmleç URL'e yazılmaz** (CLAUDE §1): sipariş sayısı veriyle sınırsız büyür ama süzgeç yok —
 * paylaşılabilecek bir seçim de yok; liste kaydırdıkça uzar, sayfalama düğmesi yoktur.
 *
 * `total` BİLEREK YOK (katalog zarfından ayrılan tek nokta): "N sipariş" diye bir başlık tasarımda
 * yok ve olmayan bir sayacı taşımak, bir gün süzgeç eklendiğinde sessizce yalan söyleyen bir alan
 * bırakırdı (`CatalogPageSchema.total` künyesindeki ders).
 */
export const MeOrderPageSchema = z.object({
  orders: z.array(MeOrderSummarySchema),
  nextCursor: z.string().nullable(),
});
export type MeOrderPage = z.infer<typeof MeOrderPageSchema>;

/**
 * Zaman çizgisinin DÖRT SABİT durağı — motorun `OrderMilestone`unun sözleşme ikizi.
 *
 * Enum burada yalın duruyor çünkü `packages/types` saf: `@lezzet/domain-core`u BİLEMEZ (katalogun
 * `TextSegmentSchema` künyesindeki aynı kısıt). Şeklin sapmadığını `apps/mobile-api` DERLEMEDE
 * kanıtlar — uç gövdeyi `z.input<…>` ile tipliyor, motorun döndürdüğü adım buraya alan alan uymak
 * zorunda.
 *
 * `prepared` durağı iç durum `ready`ye bakar, `preparing`e DEĞİL (motor künyesi): müşteri
 * "hazırlandı" gördüğünde işin bittiğini anlar; mutfakta olmayı ayrı bir durak saymak aynı adımı
 * iki kez göstermek olurdu.
 */
export const OrderMilestoneEnum = z.enum(['received', 'prepared', 'on_the_way', 'delivered']);
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
 * Detayın TEK satırı — künye + sipariş anındaki para.
 *
 * **PAKET TEK SATIRDIR** ve katlama SUNUCUDA yapılır: sipariş anında paket kalemlerine açılıyor ama
 * müşteri onu bir bütün olarak satın aldı; kalemleri ayrı ayrı fiyatlarıyla dizmek, hiç görmediği
 * bir fiyat kırılımını göstermek olurdu (DOMAIN §13). Ekran bu kararı geri alamaz — `bundle` dolu
 * gelen satır zaten katlanmıştır.
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
 * Kargo künyesi — `null` İKİ ayrı hâlde: rota siparişi (kısıt veride) ve taşıyıcısı henüz
 * girilmemiş kargo siparişi. İkisi AYRILMAZ çünkü ekranda ikisi de aynı şeyi yapar: blok çizilmez.
 * "Kargo bilgisi yakında" demek, operatörün numarayı ne zaman gireceğini bilmediğimiz hâlde bir
 * zaman vaadi olurdu.
 *
 * `trackingUrl` AYRICA taşınır, ekranda türetilmez: kural tek yerde ve testli — `other` taşıyıcıda
 * ve boş numarada `null` gelir, ekran o hâlde düğmeyi çizmez ama NUMARAYI gösterir (müşteri
 * taşıyıcıyı kendisi arayabilir; çalışmayan bir düğme işe yaramaz).
 */
export const MeOrderShipmentSchema = z.object({
  carrier: CarrierEnum,
  trackingNumber: z.string().nullable(),
  trackingUrl: z.string().nullable(),
});

/** Sipariş detayı — sayfanın TAMAMI tek turda (kalemler, çizgi, adres, para; bölüm başına çağrı yok). */
export const MeOrderDetailSchema = z.object({
  reference: z.string().min(1),
  placedAt: z.string(),
  status: CustomerOrderStatusEnum,
  active: z.boolean(),
  deliveryType: DeliveryTypeEnum,
  /** Teslim günü (ISO tarih); kargoda ve gün seçilmemişse `null` — biz söz veremeyiz. */
  deliveryDate: z.string().nullable(),
  /**
   * Teslimat adresinin SİPARİŞ ANINDAKİ hâli (`address_snapshot`). Canlı adres değil: müşteri o
   * günden beri adresini değiştirmiş olabilir ve sipariş nereye gittiyse orayı göstermeli.
   * Parçalı taşınır, tek satıra birleştirilmez — cümleyi ekran kurar (ayraç dilin işi).
   */
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
   * AÇIK değerlendirme daveti (27.08 · kullanıcı kararı) — ekranın yorum teşviki bunun VARLIĞIYLA
   * çizilir, yokluğunda hiç çizilmez.
   *
   * `null` üç hâli birden kapsar ve ayrımı ekran BİLMEZ: davet yok · tamamlandı · süresi doldu
   * (gerekçe `readOrderFeedbackInvite` künyesinde). Yorum daveti bildirimi bu sayfaya götürdüğü
   * için blok bir kapıdır, süs değil: götürülen yerde yazacak bir yer yoksa bildirim boş vaat olur.
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
