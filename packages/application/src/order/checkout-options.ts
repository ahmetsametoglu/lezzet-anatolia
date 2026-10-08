import { OrderService, SettingsService, UserProfileService, type Db } from '@lezzet/database';
import {
  PAYMENT_TERM_DAYS_DEFAULT,
  PAYMENT_TERM_DAYS_KEY,
  apportionShippingVat,
  creditPosition,
  deriveChannel,
  grossTotalCents,
  meetsMinBasket,
  resolveCheckoutOptions,
  resolveShippingFee,
  resolveVatTreatment,
  type ShippingVatPart,
} from '@lezzet/domain-core';
import { CountryEnum, type DeliveryType, type PaymentMethod } from '@lezzet/types';
import { pricesIncludeVatFor, pricingViewerFor } from '../catalog/pricing-viewer';
import { minBasketFor } from '../cart/min-basket';
import { settingScopeOf } from '../cart/setting-scope';
// Müşteriye söz veren ayarlar: sepet ve checkout AYNI satırı okumalı (`../cart/settings-keys`).
import { FREE_SHIPPING_THRESHOLD_DEFAULT, FREE_SHIPPING_THRESHOLD_KEY } from '../cart/settings-keys';
// Kapıda ödeme tavanı: kasa kapıyı burada uyguluyor, SSS ve satış koşulları AYNI satırı ilan ediyor
// (`../settings/public-terms`) — sayı iki yerde yazılıydı, biri değişince öteki yalan söylerdi.
import { COD_MAX_DEFAULT, COD_MAX_KEY } from '../settings/public-terms';

/**
 * Checkout ödeme seçenekleri, uygulama katmanı: motorun kararı gerçek girdilere bağlanır (müşteri kartı, işletme ayarları, teslimat türü).
 * Açık bakiye ve gecikme saklanmaz, türetilir; tipler `CheckoutPayment*` adını taşır ki motorun `CheckoutOptionsInput`uyla çakışmasın.
 */

export interface CheckoutPaymentResult {
  methods: PaymentMethod[];
  /** Vadeli ("hesaba") satın alma açık mı — ödeme yöntemi değil, siparişin bayrağı. */
  creditAvailable: boolean;
  codBlockedReason: 'over_limit' | 'customer_blocked' | 'shipping' | null;
  cashWarning: boolean;
  creditBlockedReason: 'not_enabled' | 'overdue' | 'limit_exceeded' | null;
  creditRequiresApproval: boolean;

  /**
   * Kargo ücreti (cent) ve neden ücretsiz olduğu; `pickup` = müşteri kendisi alıyor, taşıma yok. `null` = eşik altında ve taşıyıcı
   * fiyat vermedi: sabit bir yedek ücret yoktur ve sipariş açılamaz.
   */
  shippingFeeCents: number | null;
  shippingFreeReason: 'route' | 'threshold' | 'pickup' | null;
  /** "X € daha ekleyin, kargo bedava" mesajının girdisi. */
  remainingForFreeShippingCents: number;
  /** Ücretin KDV kırılımı — taşıdığı malın oranını izler (karışık sepette oransal). */
  shippingVat: ShippingVatPart[];

  /** Asgari sepet tutmuyorsa checkout açılmaz. */
  minBasketOk: boolean;
  missingForMinBasketCents: number;
  /** Kalem fiyatları KDV dahil mi; değilse toplam, kalemlere eklenen KDV'yi taşır. */
  pricesIncludeVat: boolean;
  /** Müşteriden tahsil edilecek KDV dahil toplam (sepet + kargo, cent); kargo ücreti bilinmiyorsa `null`. */
  orderTotalCents: number | null;
}

export interface CheckoutPaymentInput {
  customerId: string;
  /**
   * Üç tür de gelir: adresin cevabı (`route`/`shipping`) ya da müşterinin seçtiği gel-al (`pickup`); gel-alda kargo ücreti sorusu doğmaz.
   * Depoda ödeme kapıda ödemedir (tavan, müşteri kapısı, nakit uyarısı); yerinde satış checkout'tan geçmez.
   */
  deliveryType: DeliveryType;
  /**
   * Sepet ara toplamı — **indirim UYGULANMIŞ**, kanal tabanında (cent). Kargo ücreti, bedava
   * kargo eşiği ve tahsil edilecek toplam bunu ister: müşteriden gerçekten alınacak paradır.
   */
  basketCents: number;
  /**
   * Sepet ara toplamı, indirim öncesi (cent): yalnız asgari sepet eşiği bunu okur, çünkü teslimatın ekonomisi malın değerine bağlıdır ve kampanya eşiği düşürmez.
   * İki alan, çünkü taslak kapısı da eşiği indirim öncesinden ölçer; aynı sepette biri "tamam" öteki "eksik" dememeli.
   */
  subtotalCents: number;
  /** KDV kırılımı için kalem tutarları (indirim öncesi) + oranları. */
  lines: readonly { totalCents: number; vatRate: number }[];
  /** `lines` ile aynı sırada kalemlerin indirim payı (cent); KDV hariç fiyatta KDV indirimli tutara eklenir. Verilmezse 0. */
  discountShares?: readonly number[];
  /**
   * Ayar kapsamının yer eksenleri; çağıran çözer, çünkü aynı hesap kapıda ödeme, WhatsApp ve mobil uçlardan da çağrılır ve çerezi okuyan yüzeydir.
   */
  country?: string | null;
  zoneId?: string | null;
  warehouseId?: string | null;
  /**
   * Canlı kargo teklifinin sunucuda hesaplanmış tutarı (cent); `null` = taşıyıcı fiyat vermedi. Teklif ücretin tutarını, ücretsiz
   * kargo eşiği ise alınıp alınmayacağını belirler.
   */
  quotedFeeCents?: number | null;
}

export async function resolveCheckoutPayment(db: Db, input: CheckoutPaymentInput): Promise<CheckoutPaymentResult> {
  const settings = new SettingsService(db);
  // Müşteri satırı ve vade freninin sipariş geçmişi yalnız kimliğe bağlı, aynı turda okunur; görüntüleyen de bu satırdan türer.
  const [customer, history] = await Promise.all([
    new UserProfileService(db).getById(input.customerId),
    new OrderService(db).listByCustomer(input.customerId, { limit: 200 }),
  ]);
  if (!customer) throw new Error(`checkout: müşteri bulunamadı (${input.customerId})`);

  // Kapsam önce çözülür, çünkü kanal müşteri satırından türer; kapsamsız okuma b2b'ye perakende eşiği, Almanya'ya Fransa tarifesi uygulardı.
  // Kapsam sepetle aynı yerden kurulur (`settingScopeOf`), yoksa sepette yazan eşik checkout'ta tutmazdı.
  const scope = settingScopeOf(await pricingViewerFor(db, customer), {
    country: input.country,
    zoneId: input.zoneId,
    warehouseId: input.warehouseId,
  });

  const [codMaxCents, cashLegalLimitCents, freeThresholdCents, minBasketCents] = await Promise.all([
    // Kapıda ödeme tavanı; varsayılanı ve anahtarı `public-terms`te.
    settings.getNumber(COD_MAX_KEY, COD_MAX_DEFAULT, scope),
    settings.getNumber('cash_legal_limit_cents', 100_000, scope),
    settings.getNumber(FREE_SHIPPING_THRESHOLD_KEY, FREE_SHIPPING_THRESHOLD_DEFAULT, scope),
    minBasketFor(settings, input.deliveryType, scope),
  ]);

  // ── Kargo ücreti önce: sipariş toplamı ona bağlı, kapıda ödeme tavanı da toplama bakar.
  // Gel-al'da motor sorulmaz: "kargo ücreti kaç" sorusu geçersizdir (DATA_MODEL), ücret doğrudan yok.
  const shipping =
    input.deliveryType === 'pickup'
      ? { feeCents: 0, freeReason: 'pickup' as const, remainingForFreeCents: 0 }
      : resolveShippingFee({
          deliveryType: input.deliveryType,
          basketCents: input.basketCents,
          freeThresholdCents,
          quotedFeeCents: input.quotedFeeCents,
        });
  // Borç her tabanda KDV dahildir: KDV hariç fiyatta KDV indirimli kalemlerin oran toplamına eklenir, ters yüklemede oran sıfırdır.
  const pricesIncludeVat = pricesIncludeVatFor(customer);
  // Ülkesi bilinmeyen okuma (operasyonun adres öncesi sorusu) ters yükleme açmaz; yanlış %0 bizim riskimizdir.
  const deliveryCountry = CountryEnum.safeParse(input.country);
  const zeroRated =
    deliveryCountry.success &&
    resolveVatTreatment({
      channel: deriveChannel({ isCompany: customer.type === 'company' }),
      deliveryCountry: deliveryCountry.data,
      vatNumberValid: customer.vatNumberValid ?? undefined,
    }).zeroRated;
  const goodsCents = pricesIncludeVat
    ? input.basketCents
    : grossTotalCents(
        input.lines.map((line, index) => ({ vatRate: line.vatRate, amountCents: line.totalCents - (input.discountShares?.[index] ?? 0) })),
        [],
        false,
        zeroRated,
      );
  const orderTotalCents = shipping.feeCents === null ? null : goodsCents + shipping.feeCents;

  // ── Vade freni için açık bakiye ve gecikme TÜRETİLİR (saklanmaz). Hesabın kendisi motorda (`creditPosition`): sipariş listesi de
  //    aynı "açık" ve "gecikmiş" tanımını kullanıyor, iki yerde yazılsaydı checkout freni ile ekranın vade işareti ayrışırdı.
  const { openBalanceCents, hasOverdue } = creditPosition(
    history.rows,
    customer.paymentTermDays ?? (await settings.getNumber(PAYMENT_TERM_DAYS_KEY, PAYMENT_TERM_DAYS_DEFAULT)),
  );

  /**
   * Ödeme yöntemi kanalı onaylı işletmedir: ertelenmiş tahsilat bir güven kararıdır ve güveni başvurunun onayı verir; onaysız şirket kaydı kendi kendini onaylayamaz.
   * Siparişe yazılan kanal (`checkout-draft.ts`, KDV ve muhasebe) bilerek ayrıdır: şirket, başvurusu onaylanmasa da şirkettir.
   */
  const paymentChannel = deriveChannel({ isCompany: customer.type === 'company' && customer.b2bApproved === true });

  const options = resolveCheckoutOptions({
    // Ücret bilinmiyorsa sipariş zaten açılamaz; yöntemler ürün tutarına göre çözülür ki ekran ne sunulacağını yine bilsin.
    orderTotalCents: orderTotalCents ?? goodsCents,
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

  // Eşik indirim öncesini ölçer (`basketCents` değil); kargo ve toplam indirim sonrasını okur, ikisi ayrı sorudur.
  const minBasket = meetsMinBasket(input.subtotalCents, minBasketCents);

  return {
    ...options,
    shippingFeeCents: shipping.feeCents,
    shippingFreeReason: shipping.freeReason,
    remainingForFreeShippingCents: shipping.remainingForFreeCents,
    shippingVat: shipping.feeCents === null ? [] : apportionShippingVat(shipping.feeCents, input.lines),
    minBasketOk: minBasket.ok,
    missingForMinBasketCents: minBasket.missingCents,
    pricesIncludeVat,
    orderTotalCents,
  };
}
