import { OrderService, SettingsService, UserProfileService, type Db } from '@lezzet/database';
import {
  apportionShippingVat,
  creditPosition,
  deriveChannel,
  meetsMinBasket,
  resolveCheckoutOptions,
  resolveShippingFee,
  type CreditPosition,
  type ShippingVatPart,
} from '@lezzet/domain-core';
import type { DeliveryType, PaymentMethod } from '@lezzet/types';
import { pricingViewerOf } from '../catalog/pricing-viewer';
import { minBasketFor } from '../cart/min-basket';
import { settingScopeOf } from '../cart/setting-scope';
// Müşteriye söz veren ayarlar: sepet ve checkout AYNI satırı okumalı (`../cart/settings-keys`).
import {
  FREE_SHIPPING_THRESHOLD_DEFAULT,
  FREE_SHIPPING_THRESHOLD_KEY,
  SHIPPING_FEE_DEFAULT,
  SHIPPING_FEE_KEY,
} from '../cart/settings-keys';

/**
 * Checkout ödeme seçenekleri (07.3) — **uygulama katmanı orkestrasyonu**. DOMAIN §6, §7.
 *
 * Motor (03.7/03.8) "bu müşteri bu siparişi nasıl ödeyebilir" kararını zaten veriyordu; burada
 * gerçek girdilere bağlanıyor: müşteri kartı (vade yetkisi, limit, `cod_allowed`), işletme ayarları
 * (kapıda ödeme tavanı, nakit yasal sınırı) ve teslimat türü.
 *
 * **Açık bakiye ve gecikme SAKLANMAZ, türetilir** (DOMAIN §7): ödenmemiş vadeli siparişlerden
 * hesaplanır. Burada o hesap yapılır, karar yine motorundur.
 *
 * ── TERFİ (aşama 2/3) · WEB'DEN FARKLARI ─────────────────────────────────────
 * Kaynağı `apps/web/lib/order/checkout-options.ts`tı; web kopyası KÖPRÜ olarak duruyor. Kural
 * tarafında hiçbir şey değişmedi — değişen üç şey:
 *   · `db` çağırandan gelir (`serviceDb()` içeride çağrılmıyor) — paketin ortak deseni.
 *   · `settingScopeOf` artık SAF (aşama 1'de terfi etti): kanalı belirleyen görüntüleyen burada
 *     çözülüp kapsama veriliyor. Kural değişmedi — kanal yine `pricingViewerOf`ün kararı.
 *   · Girdi/sonuç tipleri `CheckoutPayment*` diye adlandırıldı. Web'de `CheckoutOptions*`
 *     idiler ama orada dosya-yereldi; paket barrel'ından ihraç edilince MOTORUN aynı adlı
 *     tipiyle (`domain-core`'un `CheckoutOptionsInput`'u, bu dosyanın kendi çağırdığı) çakışırdı.
 *     İki farklı sözleşmenin tek ada oturması, ikisini birden import eden dosyada sessiz bir
 *     takas riskidir.
 */

export interface CheckoutPaymentResult {
  methods: PaymentMethod[];
  /** Vadeli ("hesaba") satın alma açık mı — ödeme yöntemi değil, siparişin bayrağı. */
  creditAvailable: boolean;
  codBlockedReason: 'over_limit' | 'customer_blocked' | 'shipping' | null;
  cashWarning: boolean;
  creditBlockedReason: 'not_enabled' | 'overdue' | 'limit_exceeded' | null;
  creditRequiresApproval: boolean;

  /** Kargo ücreti (cent) ve neden ücretsiz olduğu. */
  shippingFeeCents: number;
  shippingFreeReason: 'route' | 'threshold' | null;
  /** "X € daha ekleyin, kargo bedava" mesajının girdisi. */
  remainingForFreeShippingCents: number;
  /** Ücretin KDV kırılımı — taşıdığı malın oranını izler (karışık sepette oransal). */
  shippingVat: ShippingVatPart[];

  /** Asgari sepet tutmuyorsa checkout açılmaz. */
  minBasketOk: boolean;
  missingForMinBasketCents: number;
  /** Müşteriden tahsil edilecek toplam (sepet + kargo, cent). */
  orderTotalCents: number;
}

export interface CheckoutPaymentInput {
  customerId: string;
  deliveryType: DeliveryType;
  /** Sepet ara toplamı — indirim uygulanmış, kanal tabanında (cent). */
  basketCents: number;
  /** KDV kırılımı için kalem tutarları + oranları. */
  lines: readonly { totalCents: number; vatRate: number }[];
  /**
   * Ayar kapsamının yer eksenleri (07.15) — çağıran çözer, burası okumaz.
   *
   * `resolveCheckoutPayment` istek bağlamına bağlanamaz: aynı hesap kapıda ödeme akışından ve
   * ileride WhatsApp/mobil uçlarından da çağrılacak. Çerezi okuyan yüzey, kapsamı geçen de o.
   */
  country?: string | null;
  zoneId?: string | null;
  warehouseId?: string | null;
}

export async function resolveCheckoutPayment(db: Db, input: CheckoutPaymentInput): Promise<CheckoutPaymentResult> {
  const settings = new SettingsService(db);
  // **KAPSAM ÖNCE ÇÖZÜLÜR — SIRA ZORUNLU** (07.15). Eskiden `scope` boştu (`{ channel: undefined }`)
  // ve beş okuma da kapsamsız gidiyordu; doldurmak da mümkün değildi, çünkü `customer` AYNI
  // `Promise.all` içindeydi — kanal, kendisini belirleyecek satır gelmeden okunuyordu.
  //
  // Ek turun bedeli bir okuma; karşılığı b2b'ye perakende eşiği, Almanya'ya Fransa tarifesi ve
  // bölge asgari sepetinin hiç uygulanmaması. Kapsam SEPETLE AYNI yerden kuruluyor
  // (`settingScopeOf`) — iki yüzey farklı kapsam okursa sepette yazan eşik checkout'ta tutmaz.
  const scope = settingScopeOf(await pricingViewerOf(db, input.customerId), {
    country: input.country,
    zoneId: input.zoneId,
    warehouseId: input.warehouseId,
  });

  const [customer, codMaxCents, cashLegalLimitCents, freeThresholdCents, feeCents, minBasketCents] = await Promise.all([
    new UserProfileService(db).getById(input.customerId),
    // Kapıda ödeme tavanı 500 € (kullanıcı kararı 04.08) — SSS ve satış koşulları bu sayıyı yazıyor.
    settings.getNumber('cod_max_cents', 50_000, scope),
    settings.getNumber('cash_legal_limit_cents', 100_000, scope),
    settings.getNumber(FREE_SHIPPING_THRESHOLD_KEY, FREE_SHIPPING_THRESHOLD_DEFAULT, scope),
    settings.getNumber(SHIPPING_FEE_KEY, SHIPPING_FEE_DEFAULT, scope),
    minBasketFor(settings, input.deliveryType, scope),
  ]);
  if (!customer) throw new Error(`checkout: müşteri bulunamadı (${input.customerId})`);

  // ── Kargo ücreti önce: sipariş toplamı ona bağlı, kapıda ödeme tavanı da toplama bakar.
  const shipping = resolveShippingFee({
    deliveryType: input.deliveryType,
    basketCents: input.basketCents,
    freeThresholdCents,
    feeCents,
  });
  const orderTotalCents = input.basketCents + shipping.feeCents;

  // ── Vade freni için açık bakiye ve gecikme TÜRETİLİR (saklanmaz).
  const { openBalanceCents, hasOverdue } = await deriveCreditPosition(
    db,
    input.customerId,
    customer.paymentTermDays ?? (await settings.getNumber('payment_term_days', 30)),
  );

  /**
   * Ödeme yöntemi kanalı — **ONAYLI işletme** (04.08). Siparişe yazılan kanaldan bilerek ayrılıyor:
   * `checkout-draft.ts` kanalı `type === 'company'` ile türetiyor ve orada doğru, çünkü o kanal
   * KDV'nin ve muhasebenin kanalı — şirket, başvurusu onaylanmasa da şirkettir.
   *
   * Ertelenmiş tahsilat (havale/çek) ise bir GÜVEN kararıdır ve güveni veren şey başvurunun
   * onaylanmasıdır. Onaysız bir şirket kaydı bugün zaten perakende fiyat görüyor
   * (`read-viewer.ts:70`); ona havale açsaydık kendi kendini onaylayan bir kapı olurdu — "şirketim"
   * yazan herkes ödemeden sipariş açabilirdi.
   */
  const paymentChannel = deriveChannel({ isCompany: customer.type === 'company' && customer.b2bApproved === true });

  const options = resolveCheckoutOptions({
    orderTotalCents,
    channel: paymentChannel,
    deliveryType: input.deliveryType,
    codMaxCents,
    codAllowed: customer.codAllowed,
    cashLegalLimitCents,
    creditEnabled: customer.creditEnabled,
    creditLimitCents: customer.creditLimitCents,
    openBalanceCents,
    hasOverdue,
  });

  const minBasket = meetsMinBasket(input.basketCents, minBasketCents);

  return {
    ...options,
    shippingFeeCents: shipping.feeCents,
    shippingFreeReason: shipping.freeReason,
    remainingForFreeShippingCents: shipping.remainingForFreeCents,
    shippingVat: apportionShippingVat(shipping.feeCents, input.lines),
    minBasketOk: minBasket.ok,
    missingForMinBasketCents: minBasket.missingCents,
    orderTotalCents,
  };
}

/**
 * Açık bakiye ve gecikme — **ödenmemiş vadeli siparişlerden türetilir**, hiçbir yerde saklanmaz
 * (DOMAIN §7). Saklanan bakiye kayarsa fark edilmez; türetilen kayamaz.
 *
 * Gecikme ölçütü: vade süresini aşmış, hâlâ ödenmemiş sipariş.
 */
async function deriveCreditPosition(db: Db, customerId: string, paymentTermDays: number): Promise<CreditPosition> {
  const orders = await new OrderService(db).listByCustomer(customerId, { limit: 200 });
  // Hesabın kendisi MOTORDA (`creditPosition`): aynı "açık" ve "gecikmiş" tanımını sipariş listesi
  // de satır satır kullanıyor. İki yerde yazılsaydı checkout freni ile ekranın kırmızı vade işareti
  // bir gün ayrışır, "gecikmesi yok" diyen ekranın altında kapanmış bir vade kapısı olurdu.
  return creditPosition(orders.rows, paymentTermDays);
}
