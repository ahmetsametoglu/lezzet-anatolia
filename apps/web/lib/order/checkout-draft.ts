import 'server-only';
import {
  AddressService,
  BundleItemService,
  OrderService,
  ProductService,
  ProductVariantService,
  UserProfileService,
  serviceDb,
} from '@lezzet/database';
import { deriveChannel } from '@lezzet/domain-core';
import type { Locale } from '@lezzet/i18n';
import type { DeliveryType, LocalizedText, OrderItemInsert, PaymentMethod } from '@lezzet/types';
import { getCartView } from '@/lib/cart/read';
import type { CartEntry, CartLine, CartView } from '@/lib/cart/cart-types';
import { resolveCheckoutPayment } from './checkout-options';
import { resolveDelivery } from './delivery';

/**
 * Sepet → TASLAK SİPARİŞ (07.4'ün eksik halkası) — **uygulama katmanı orkestrasyonu**.
 *
 * 07 modülünün checkout parçaları tek tek yazılmıştı ama her biri girdisinin HAZIR olduğunu
 * varsayıyordu: `resolveDelivery` posta kodunu, `resolveCheckoutPayment` sepet tutarını,
 * `createCheckoutSession` ise ortada duran bir `draft` siparişi. O taslağı doğuran yer hiç
 * yazılmamıştı — `OrderService.create` bugüne dek yalnız testlerden çağrılıyordu. Burası o yer.
 *
 * **Bağlayıcı fiyat BURADA sabitlenir** (DOMAIN §5). Sepetteki fiyat gösterimdir ve sepet aylarca
 * bekleyebilir; sipariş kalemine yazılan `unit_price` bu andaki çözümdür. Bu yüzden sepet
 * istemciden gelen tutarlarla değil, sunucuda YENİDEN okunur (`getCartView`).
 *
 * **İstemciden yalnız SEÇİMLER alınır** — adres, gün, ödeme yöntemi. Tutar, kargo ücreti, indirim
 * ve teslimat türü istemciden hiç kabul edilmez; hepsi burada çözülür. Aksi hâlde tarayıcı
 * konsolundan gönderilen bir `total` alanı siparişin parasını belirlerdi.
 *
 * **Her seçim yeniden DOĞRULANIR:** gönderilen gün gerçekten uygun günlerden biri mi, gönderilen
 * yöntem gerçekten açık yöntemlerden biri mi. Ekran doğru davranıyor diye sunucu güvenmez —
 * ekranın açık olduğu süre içinde bölge kapanmış, tavan değişmiş, ürün tükenmiş olabilir.
 */

type CheckoutDraftOutcome =
  | { status: 'ok'; orderId: string; totalCents: number; deliveryType: DeliveryType }
  | { status: 'empty_cart' }
  /** Tükenmiş/satışa kapanmış satır var — çıkarılmadan sipariş açılmaz. */
  | { status: 'blocked_lines'; lines: string[] }
  | { status: 'min_basket'; missingCents: number }
  | { status: 'address_not_found' }
  /** Rota dışı adres + sepette soğuk zincir kalemi: ne kapıya ne kargoya. Sepet bölünmeli (K32). */
  | { status: 'cold_chain_unshippable' }
  | { status: 'date_unavailable'; availableDates: string[] }
  | { status: 'payment_not_allowed'; methods: PaymentMethod[] }
  | { status: 'customer_not_found' };

interface CheckoutDraftInput {
  locale: Locale;
  /**
   * **Sunucuda çözülmüş** müşteri kimliği — istemciden ASLA alınmaz.
   *
   * İki meşru kaynağı var ve ikisi de sunucudadır: girişli müşteride oturum (`requireAuth` →
   * `findByAuthUserId`), misafirde OTP doğrulamasından sonra sunucunun kendi yazdığı httpOnly
   * çerez (04.6). Kapı hangisinden geldiğini bilmez — bilmesi de gerekmez; onu çözmek çağıranın
   * işidir ve tek yerde (`checkout/actions.ts`) yapılır.
   */
  customerId: string;
  entries: readonly CartEntry[];
  addressId: string;
  /** Rota içi teslimatta seçilen gün; kargoda null (tarih taşıyıcıya bağlı, söz verilmez). */
  deliveryDate: string | null;
  paymentMethod: PaymentMethod;
  /** Vadeli ("hesaba") satın alma — ödeme yöntemi değil, siparişin bayrağı. */
  onAccount?: boolean;
  couponCode?: string | null;
  /** Çift sipariş kalkanı (0015) — istemcinin o checkout denemesi için ürettiği anahtar. */
  idempotencyKey?: string | null;
}

export async function createCheckoutDraft(input: CheckoutDraftInput): Promise<CheckoutDraftOutcome> {
  const db = serviceDb();

  const customer = await new UserProfileService(db).getById(input.customerId);
  if (!customer) return { status: 'customer_not_found' };

  // 1) Adres önce: teslimat türü de kargo ücreti de ondan çıkıyor. Adres MÜŞTERİNİN mi diye
  //    bakılır — kimlik istemciden geldiği için başkasının adresine sipariş açılabilirdi.
  const address = (await new AddressService(db).listByCustomer(customer.id)).find((a) => a.id === input.addressId);
  if (!address) return { status: 'address_not_found' };

  // 2) Sepet SUNUCUDA yeniden okunur: bağlayıcı fiyat bu okumadan doğar.
  const cart = await getCartView(input.locale, input.entries, { customerId: customer.id, couponCode: input.couponCode });
  if (cart.lines.length === 0) return { status: 'empty_cart' };
  if (cart.hasBlocked) return { status: 'blocked_lines', lines: cart.lines.filter((l) => l.blocked).map((l) => l.name) };
  if (!cart.minBasketOk) return { status: 'min_basket', missingCents: cart.missingForMinBasketCents };

  // 3) Teslimat: posta kodu → bölge → gün(ler). Soğuk zincir kalemi kargoyu kapatır.
  const hasNonShippableItem = cart.lines.some((l) => !l.shippable);
  const delivery = await resolveDelivery({ postalCode: address.postalCode, hasNonShippableItem });
  if (delivery.shippingBlockedReason === 'cold_chain') return { status: 'cold_chain_unshippable' };

  // Gün DOĞRULANIR, kabul edilmez: ekran açıkken kesim saati geçmiş ya da bölge günü değişmiş olabilir.
  if (delivery.deliveryType === 'route') {
    const chosen = input.deliveryDate ?? (delivery.availableDates.length === 1 ? delivery.availableDates[0]! : null);
    if (!chosen || !delivery.availableDates.includes(chosen)) {
      return { status: 'date_unavailable', availableDates: delivery.availableDates };
    }
  }

  // 4) Ödeme seçenekleri + kargo ücreti + KDV kırılımı. Kalem oranları kalem kalem geçilir:
  //    kargonun KDV'si taşıdığı malın oranını izler, tek oran varsaymak karışık sepette yanlış.
  const items = await expandToOrderItems(db, cart.lines, discountSharesOf(cart));
  const options = await resolveCheckoutPayment({
    customerId: customer.id,
    deliveryType: delivery.deliveryType,
    basketCents: cart.totalCents,
    lines: items.map((i) => ({ totalCents: Math.round(i.unitPrice * 100) * i.qty, vatRate: i.vatRate })),
  });
  if (!options.methods.includes(input.paymentMethod)) {
    return { status: 'payment_not_allowed', methods: options.methods };
  }

  // 5) Taslak. Kanal müşteri tipinden TÜRER ve bir daha değişmez (DOMAIN §3); adres ANLIK GÖRÜNTÜ
  //    olarak da yazılır — müşteri adresini sonradan düzenlerse sipariş nereye gittiğini unutmamalı.
  const deliveryDate = delivery.deliveryType === 'route' ? (input.deliveryDate ?? delivery.availableDates[0] ?? null) : null;
  const { order } = await new OrderService(db).create(
    {
      customerId: customer.id,
      channel: deriveChannel({ isCompany: customer.type === 'company' }),
      orderSource: 'web',
      status: 'draft',
      idempotencyKey: input.idempotencyKey ?? null,
      paymentMethod: input.paymentMethod,
      onAccount: input.onAccount ?? false,
      deliveryType: delivery.deliveryType,
      deliveryZoneId: delivery.zoneId,
      deliveryDate,
      addressId: address.id,
      addressSnapshot: { ...address },
      deliveryCountry: address.country,
      shippingFee: options.shippingFeeCents / 100,
      total: options.orderTotalCents / 100,
      discountAmount: discountAmountOf(cart) / 100,
      discountId: discountIdOf(cart),
      discountLabel: discountLabelOf(cart),
      // Siparişin dili: müşteri bu siparişi hangi yüzeyde okuyorsa o. Mailler buradan konuşur.
      locale: input.locale,
    },
    items,
  );

  return { status: 'ok', orderId: order.id, totalCents: options.orderTotalCents, deliveryType: delivery.deliveryType };
}

/**
 * Sepet satırları → sipariş kalemleri. **Paket burada PARÇALANIR.**
 *
 * Müşteri tek bir "Bayram Sofrası" satırı görür ve öyle de görmeli (DOMAIN §13: satılan şey paketin
 * kendisidir). Ama sipariş varyant kalemlerinden oluşur — depo raftan paket değil ürün toplar, stok
 * varyanttan düşer, kâr varyant maliyetinden çıkar. Bu yüzden kalem `bundle_id` taşır: nereden
 * geldiği kaybolmaz, iade ve rapor paketi yeniden kurabilir.
 *
 * **Birim fiyat paketin PAYIDIR, katalog fiyatı değil.** Katalog fiyatı yazılsaydı kalemler toplamı
 * paketin fiyatını aşar ve sipariş kendi toplamıyla çelişirdi — indirim tam da o farktır.
 *
 * **İndirim payı kaleme YAZILIR** (`shares`, kalem sırasıyla hizalı — bkz. `discountSharesOf`).
 * Başlıktaki `discount_amount` tek başına yetmiyor: ödeme durumunu türeten motor "müşteri ne kadar
 * borçlu" sorusunu KALEMLERDEN topluyor (`derivePaymentStatus`) ve payı 0 gördüğü sürece indirimi
 * ödenmemiş bakiye sayıyor.
 */
async function expandToOrderItems(
  db: ReturnType<typeof serviceDb>,
  lines: readonly CartLine[],
  shares: readonly number[],
): Promise<Omit<OrderItemInsert, 'orderId'>[]> {
  const items = new BundleItemService(db);
  const bundleItems = new Map(
    await Promise.all(
      lines.filter((l) => l.kind === 'bundle').map(async (l) => [l.bundleId, await items.listByBundle(l.bundleId)] as const),
    ),
  );

  // KDV oranı ÜRÜNÜN alanı, varyantın değil — varyantlar önce ürünlerine bağlanır. Tek turda:
  // kalem başına sorgu, üç kalemlik bir pakette bile N+1 doğururdu.
  const variantIds = [
    ...lines.filter((l) => l.kind === 'variant').map((l) => l.variantId),
    ...[...bundleItems.values()].flat().map((i) => i.variantId),
  ];
  const variants = await new ProductVariantService(db).listByIds([...new Set(variantIds)]);
  const products = await new ProductService(db).listByIds([...new Set(variants.map((v) => v.productId))]);
  const vatByProduct = new Map(products.map((p) => [p.id, p.vatRate]));
  const vatByVariant = new Map(variants.map((v) => [v.id, vatByProduct.get(v.productId) ?? 0]));

  const rows: Omit<OrderItemInsert, 'orderId'>[] = [];
  lines.forEach((line, index) => {
    if (line.kind === 'variant') {
      rows.push({
        variantId: line.variantId,
        qty: line.qty,
        stockId: line.stockId,
        bundleId: null,
        unitPrice: (line.unitPriceCents ?? 0) / 100,
        vatRate: vatByVariant.get(line.variantId) ?? 0,
        lineDiscountAmount: (shares[index] ?? 0) / 100,
      });
      return;
    }
    for (const item of bundleItems.get(line.bundleId) ?? []) {
      rows.push({
        variantId: item.variantId,
        // Paketin adedi kalemin adedini ÇARPAR: iki "Bayram Sofrası" iki kat malzeme demektir.
        qty: item.qty * line.qty,
        stockId: null,
        bundleId: line.bundleId,
        unitPrice: item.allocatedUnitPrice,
        vatRate: vatByVariant.get(item.variantId) ?? 0,
        // Pakete sepet indirimi BİNMEZ (DOMAIN §13) — motor da payını 0 dağıtır. Paketin kendi
        // indirimi zaten birim fiyatın içinde.
        lineDiscountAmount: 0,
      });
    }
  });
  return rows;
}

/**
 * İndirimin kalem payları — **sepet satırlarıyla index index hizalı** (`lib/cart/read.ts` her
 * satır için tam bir kayıt gönderir, muaf olanı bile: dizi hizası bunun için korunuyor).
 *
 * İndirim yoksa boş dizi döner ve her kalem 0 pay alır. `Σ pay = discount_amount` motorun
 * garantisidir (`distributeDiscount`) — burada yeniden bölüştürme YAPILMAZ, yapılsaydı kuruş
 * artığı iki yerde farklı yuvarlanır ve sipariş kendi toplamıyla çelişirdi.
 */
function discountSharesOf(cart: { discount: { status: string; lineShares?: number[] } }): readonly number[] {
  return cart.discount.status === 'applied' || cart.discount.status === 'automatic' ? (cart.discount.lineShares ?? []) : [];
}

/** İnen indirim (cent) — kupon da otomatik kampanya da aynı alana yazılır, ayrımı `discountId` taşır. */
function discountAmountOf(cart: { discount: { status: string; amountCents?: number } }): number {
  return cart.discount.status === 'applied' || cart.discount.status === 'automatic' ? (cart.discount.amountCents ?? 0) : 0;
}

function discountIdOf(cart: { discount: { status: string; discountId?: string | null } }): string | null {
  return cart.discount.status === 'applied' || cart.discount.status === 'automatic' ? (cart.discount.discountId ?? null) : null;
}

/**
 * İndirimin müşteriye görünen adının SİPARİŞ ANINDAKİ kopyası (0015 `discount_label`).
 *
 * `discountId` üzerinden sonradan okumak yetmezdi: kampanya yeniden adlandırılabilir, süresi
 * dolabilir, silinebilir. O zaman altı ay önce gönderilmiş mailin yeniden basımı başka bir şey
 * derdi. Siparişe ait olan bilgi siparişte durur — `addressSnapshot` ile aynı kural.
 */
function discountLabelOf(cart: CartView): LocalizedText | null {
  return cart.discount.status === 'applied' || cart.discount.status === 'automatic' ? cart.discount.label : null;
}
