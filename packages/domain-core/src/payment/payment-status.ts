import type { Order, OrderItem, PaymentStatus } from '@lezzet/types';
import { isFulfillmentSettled } from '../order/status-machine';

/**
 * Ödeme durumu türetimi (03.6) — DOMAIN §7/§8. `payment_status` **elle set edilmez**, iki
 * sayıdan hesaplanır: net tahsilat (tahsil − iade) ile **karşılanan tutar**.
 *
 * Karşılanan tutar = Σ `fulfilled_qty` × (indirimli birim fiyat) [+ kargo ücreti].
 * Kalem KDV'si ve kısmi iade zaten indirimli birimden hesaplanır (DOMAIN §5) — bu yüzden pay
 * dağıtımı (`line_discount_amount`) burada girdi olarak alınır, yeniden hesaplanmaz.
 *
 * Kararlar (27.07):
 * - **`partial` para eksenidir**: net, karşılanandan AZ. "Sipariş eksik karşılandı" ayrı bir
 *   eksendir (`fulfilled_qty`), bu alana karıştırılmaz.
 * - **Fazla tahsilat yeni durum açmaz**: `paid` kalır, fark `refundDueCents` olarak türetilir
 *   (panelde "iade bekliyor"). Enum dört değerde kalır.
 * - **İptal edilen siparişte karşılanan = 0** (ORDER_LIFECYCLE): tahsil edilmişse tamamı iade.
 * - **Bütün iade `returned`** kalem bazından türer: iade edilen kalemlerin `fulfilled_qty`'si
 *   düşer → karşılanan kendiliğinden 0'a iner. Ayrı kural yok. **İstisna `goodwill` iadesi:**
 *   mal müşteride kaldığı için miktar DÜŞMEZ; net 0'a indiği için durum yine `refunded` olur.
 * - **Kargo ücreti:** hiçbir kalem karşılanmadıysa (Σ fulfilled = 0) kargo da iade edilir —
 *   karşılanan tutara girmez. En az bir kalem gittiyse kargo hizmeti verilmiştir, iade edilmez.
 */

export interface FulfilledLine {
  /** Fiziksel olarak müşteriye giden miktar. */
  fulfilledQty: number;
  /** Sabitlenmiş birim fiyat (kanal tabanında, cent). */
  unitPriceCents: number;
  /** Sepet indiriminin bu kaleme düşen payı (cent, kalemin TAMAMI için). */
  lineDiscountCents?: number;
  /** Sipariş edilen miktar — indirim payını karşılanan orana bölmek için. */
  orderedQty: number;
}

export interface PaymentDerivationInput {
  lines: readonly FulfilledLine[];
  collectedCents: number;
  refundedCents: number;
  shippingFeeCents?: number;
  /** Sipariş iptal edildiyse karşılanan tutar 0 sayılır (ORDER_LIFECYCLE). */
  cancelled?: boolean;
  /**
   * Hazırlık kesinleşti mi (`isFulfillmentSettled`). **`false` iken beklenen tutar SİPARİŞ EDİLEN
   * adetten hesaplanır**, karşılanandan değil — çünkü `fulfilled_qty` henüz yazılmamıştır.
   *
   * Bu ayrım olmadan onaylanmış her sipariş "hiçbir kalemi karşılanmamış" sayılıyordu: kapıda
   * tahsil edilecek tutar 0 çıkıyor, peşin ödenmiş sipariş `refundDueCents` ile "iade bekliyor"
   * görünüyordu. Varsayılan `true` — çağıran durumu bilmiyorsa bugünkü davranış sürer.
   */
  fulfillmentSettled?: boolean;
  /**
   * Siparişin ANLAŞILAN toplamı (cent) — indirim düşülmüş, kargo eklenmiş hâli.
   *
   * **Hazırlık kesinleşmeden beklenen tutar budur ve kalemlerden yeniden hesaplanmaz.** Sebebi bir
   * kolaylık değil, yaşanmış bir hata: sepet indirimi kalem paylarına yazılmadığında (bir yol onu
   * unutabilir, seed unutuyordu) kalemlerden toplanan tutar indirim kadar YÜKSEK çıkıyor ve tamamı
   * ödenmiş bir sipariş "kısmi ödenmiş" oluyordu — müşteriye giden mail de "kapıda 3,00 € ödenecek"
   * diyordu. Oysa o aşamada cevap zaten siparişin kendi toplamıdır; ikinci kez türetmek, aynı
   * gerçeği iki yoldan hesaplayıp birinin bozulmasına açık kapı bırakmaktı.
   *
   * Verilmezse eski davranış sürer (kalemlerden sipariş edilen adetle) — çağıranı zorlamamak için.
   */
  orderTotalCents?: number;
}

export interface PaymentDerivation {
  status: PaymentStatus;
  /** Müşterinin ödemesi gereken tutar — kısmi karşılamada düşürülmüş hâli. */
  fulfilledAmountCents: number;
  /** Peşin ödenmişse iade edilecek fark (0 ise borç yok). */
  refundDueCents: number;
  /** Kapıda ödenecekse tahsil edilecek kalan (0 ise tahsilat yok). */
  amountToCollectCents: number;
}

/**
 * Siparişin kendisinden türetim — girdi EŞLEMESİ burada durur, çağıranlarda değil.
 *
 * Sebebi: aynı eşlemeyi web kapısı da (`lib/money/order-payment`) seed script'i de yapıyor. İki
 * yerde yazılsaydı biri kargoyu unutur ya da indirim payını atlar, iki ekran farklı sayı gösterirdi.
 * Motor DB'yi bilmez ama **şemayı bilir** (`@lezzet/types`) — bu yüzden `Order`/`OrderItem` alması
 * sınırı bozmaz.
 *
 * Tutarlar dışarıdan gelir: siparişteki `amount_*` bir CACHE'tir, doğrusu para hareketlerindedir
 * (12.2) — çağıran taze toplamı verir.
 */
export function derivePaymentStatusForOrder(
  order: Pick<Order, 'shippingFeeCents' | 'status' | 'totalCents'>,
  items: readonly Pick<OrderItem, 'fulfilledQty' | 'qty' | 'unitPriceCents' | 'lineDiscountAmountCents'>[],
  amounts: { collectedCents: number; refundedCents: number },
): PaymentDerivation {
  // Yerel `cent = v => Math.round(v * 100)` KALKTI (02.9): servis zaten cent döndürüyor ve
  // STACK §8 elle çevirmeyi yasaklıyor. Bu satır, kuralın bir "stil" değil bir kapı olduğunun örneği.
  return derivePaymentStatus({
    lines: items.map((item) => ({
      fulfilledQty: item.fulfilledQty,
      orderedQty: item.qty,
      unitPriceCents: item.unitPriceCents,
      lineDiscountCents: item.lineDiscountAmountCents,
    })),
    collectedCents: amounts.collectedCents,
    refundedCents: amounts.refundedCents,
    shippingFeeCents: order.shippingFeeCents,
    // İptal edilen siparişte karşılanan tutar 0 sayılır (ORDER_LIFECYCLE): tahsil edilmişse tamamı
    // iade borcudur.
    cancelled: order.status === 'cancelled',
    // Hazırlanmamış siparişin `fulfilled_qty`'si bir karar değil, henüz yazılmamış bir sayıdır.
    fulfillmentSettled: isFulfillmentSettled(order.status, items),
    // O aşamada beklenen tutar siparişin kendi toplamıdır (bkz. `orderTotalCents`).
    orderTotalCents: order.totalCents,
  });
}

export function derivePaymentStatus(input: PaymentDerivationInput): PaymentDerivation {
  const fulfilledAmountCents = input.cancelled ? 0 : fulfilledAmount(input);
  const net = input.collectedCents - input.refundedCents;

  const refundDueCents = Math.max(0, net - fulfilledAmountCents);
  const amountToCollectCents = Math.max(0, fulfilledAmountCents - net);

  return {
    status: statusOf(net, fulfilledAmountCents, input.refundedCents),
    fulfilledAmountCents,
    refundDueCents,
    amountToCollectCents,
  };
}

function statusOf(net: number, fulfilled: number, refunded: number): PaymentStatus {
  // Para geri gitmiş ve elde bir şey kalmamışsa iade edilmiştir — karşılanan tutara bakılmaz
  // (jest iadesinde mal müşteride kalır ama para tamamen geri döner).
  if (net <= 0) return refunded > 0 ? 'refunded' : 'pending';
  if (net >= fulfilled) return 'paid'; // fazlalık refundDueCents'te görünür
  return 'partial';
}

/**
 * Karşılanan tutar: kalemlerin gerçekten giden kısmı + (koşullu) kargo.
 * İndirim payı kalemin TAMAMI için verildiğinden, karşılanan orana bölünür — yarısı gittiyse
 * indirimin yarısı düşülür. Aksi halde kısmi iade fazla/eksik hesaplanır.
 */
/**
 * **BİR KALEMİN karşılanan tutarı** (cent) — indirim payı karşılanan orana bölünmüş hâliyle.
 *
 * Dışa VERİLİR ve bu bilinçli (01.09): aynı formüle ekranın KDV satırı da ihtiyaç duyuyor. Sipariş
 * detayı "içindeki KDV"yi kalem kalem hesaplıyor ve o hesabın tabanı, motorun "ödenecek" dediği
 * tutarla BİREBİR aynı olmak zorunda. Formül orada ikinci kez yazılsaydı iki sayı bir gün ayrışır
 * ve ayrıştığı gün kimse fark etmezdi — vergi satırı sessizce yanlış bir tabana oturur (CLAUDE §1).
 *
 * `settled = false` iken ölçü SİPARİŞ EDİLEN adettir: karşılanan henüz yazılmamıştır, 0 olması
 * "hiçbiri gitmedi" demek değil, "daha hazırlanmadı" demektir.
 */
export function fulfilledLineAmountCents(line: FulfilledLine, settled = true): number {
  const qty = settled ? line.fulfilledQty : line.orderedQty;
  if (qty <= 0) return 0;
  const gross = line.unitPriceCents * qty;
  const discountShare = line.lineDiscountCents
    ? Math.round((line.lineDiscountCents * qty) / Math.max(1, line.orderedQty))
    : 0;
  return gross - discountShare;
}

function fulfilledAmount({ lines, shippingFeeCents = 0, fulfillmentSettled = true, orderTotalCents }: PaymentDerivationInput): number {
  // Hazırlık kesinleşmediyse cevap siparişin ANLAŞILAN toplamıdır — indirim ve kargo zaten içinde.
  // Kalemlerden yeniden toplamak, aynı gerçeği ikinci bir yoldan hesaplamak olurdu.
  if (!fulfillmentSettled && orderTotalCents != null) return orderTotalCents;

  let total = 0;
  let anyFulfilled = false;

  for (const line of lines) {
    const qty = fulfillmentSettled ? line.fulfilledQty : line.orderedQty;
    if (qty <= 0) continue;
    anyFulfilled = true;
    total += fulfilledLineAmountCents(line, fulfillmentSettled);
  }

  // Hiçbir kalem gitmediyse kargo hizmeti de değersizdir → karşılanan tutara girmez, iade edilir.
  return anyFulfilled ? total + shippingFeeCents : total;
}
