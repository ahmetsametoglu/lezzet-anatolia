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

  /** Kargo ücreti (cent) ve neden ücretsiz olduğu; `pickup` = müşteri kendisi alıyor, taşıma yok. */
  shippingFeeCents: number;
  shippingFreeReason: 'route' | 'threshold' | 'pickup' | null;
  /** Ücret nereden geldi: `quote` canlı teklif · `tariff` sabit tarife · `null` ücret yok. */
  shippingFeeSource: 'quote' | 'tariff' | null;
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
  /** KDV kırılımı için kalem tutarları + oranları. */
  lines: readonly { totalCents: number; vatRate: number }[];
  /**
   * Ayar kapsamının yer eksenleri; çağıran çözer, çünkü aynı hesap kapıda ödeme, WhatsApp ve mobil uçlardan da çağrılır ve çerezi okuyan yüzeydir.
   */
  country?: string | null;
  zoneId?: string | null;
  warehouseId?: string | null;
  /**
   * Canlı kargo teklifinin sunucuda hesaplanmış tutarı (cent); `null` = teklif yok, sabit tarife.
   * Teklif ücretin tutarını, ücretsiz kargo eşiği ise alınıp alınmayacağını belirler.
   */
  quotedFeeCents?: number | null;
}

export async function resolveCheckoutPayment(db: Db, input: CheckoutPaymentInput): Promise<CheckoutPaymentResult> {
  const settings = new SettingsService(db);
  // Kapsam önce çözülür, çünkü kanal müşteri satırından türer; kapsamsız okuma b2b'ye perakende eşiği, Almanya'ya Fransa tarifesi uygulardı.
  // Kapsam sepetle aynı yerden kurulur (`settingScopeOf`), yoksa sepette yazan eşik checkout'ta tutmazdı.
  const scope = settingScopeOf(await pricingViewerOf(db, input.customerId), {
    country: input.country,
    zoneId: input.zoneId,
    warehouseId: input.warehouseId,
  });

  const [customer, codMaxCents, cashLegalLimitCents, freeThresholdCents, feeCents, minBasketCents] = await Promise.all([
    new UserProfileService(db).getById(input.customerId),
    // Kapıda ödeme tavanı; varsayılanı ve anahtarı `public-terms`te.
    settings.getNumber(COD_MAX_KEY, COD_MAX_DEFAULT, scope),
    settings.getNumber('cash_legal_limit_cents', 100_000, scope),
    settings.getNumber(FREE_SHIPPING_THRESHOLD_KEY, FREE_SHIPPING_THRESHOLD_DEFAULT, scope),
    settings.getNumber(SHIPPING_FEE_KEY, SHIPPING_FEE_DEFAULT, scope),
    minBasketFor(settings, input.deliveryType, scope),
  ]);
  if (!customer) throw new Error(`checkout: müşteri bulunamadı (${input.customerId})`);

  // ── Kargo ücreti önce: sipariş toplamı ona bağlı, kapıda ödeme tavanı da toplama bakar.
  // Gel-al'da motor sorulmaz: "kargo ücreti kaç" sorusu geçersizdir (DATA_MODEL), ücret doğrudan yok.
  const shipping =
    input.deliveryType === 'pickup'
      ? { feeCents: 0, freeReason: 'pickup' as const, remainingForFreeCents: 0, source: null }
      : resolveShippingFee({
          deliveryType: input.deliveryType,
          basketCents: input.basketCents,
          freeThresholdCents,
          feeCents,
          quotedFeeCents: input.quotedFeeCents,
        });
  const orderTotalCents = input.basketCents + shipping.feeCents;

  // ── Vade freni için açık bakiye ve gecikme TÜRETİLİR (saklanmaz).
  const { openBalanceCents, hasOverdue } = await deriveCreditPosition(
    db,
    input.customerId,
    customer.paymentTermDays ?? (await settings.getNumber('payment_term_days', 30)),
  );

  /**
   * Ödeme yöntemi kanalı onaylı işletmedir: ertelenmiş tahsilat bir güven kararıdır ve güveni başvurunun onayı verir; onaysız şirket kaydı kendi kendini onaylayamaz.
   * Siparişe yazılan kanal (`checkout-draft.ts`, KDV ve muhasebe) bilerek ayrıdır: şirket, başvurusu onaylanmasa da şirkettir.
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

  // Eşik indirim öncesini ölçer (`basketCents` değil); kargo ve toplam indirim sonrasını okur, ikisi ayrı sorudur.
  const minBasket = meetsMinBasket(input.subtotalCents, minBasketCents);

  return {
    ...options,
    shippingFeeCents: shipping.feeCents,
    shippingFreeReason: shipping.freeReason,
    shippingFeeSource: shipping.source,
    remainingForFreeShippingCents: shipping.remainingForFreeCents,
    shippingVat: apportionShippingVat(shipping.feeCents, input.lines),
    minBasketOk: minBasket.ok,
    missingForMinBasketCents: minBasket.missingCents,
    orderTotalCents,
  };
}

/**
 * Açık bakiye ve gecikme ödenmemiş vadeli siparişlerden türetilir, saklanmaz; saklanan bakiye kayarsa fark edilmez.
 * Gecikme ölçütü: vade süresini aşmış, hâlâ ödenmemiş sipariş.
 */
async function deriveCreditPosition(db: Db, customerId: string, paymentTermDays: number): Promise<CreditPosition> {
  const orders = await new OrderService(db).listByCustomer(customerId, { limit: 200 });
  // Hesabın kendisi MOTORDA (`creditPosition`): aynı "açık" ve "gecikmiş" tanımını sipariş listesi
  // de satır satır kullanıyor. İki yerde yazılsaydı checkout freni ile ekranın kırmızı vade işareti
  // bir gün ayrışır, "gecikmesi yok" diyen ekranın altında kapanmış bir vade kapısı olurdu.
  return creditPosition(orders.rows, paymentTermDays);
}
