import { isValidPostalCode, normalizePostalCode } from '@lezzet/address';
import {
  AddressService,
  OrderService,
  ProductService,
  SettingsService,
  UserProfileService,
  WarehouseService,
  type Db,
} from '@lezzet/database';
import {
  canNegotiatePrice,
  costOf,
  creditSummary,
  customerBusinessOf,
  PAYMENT_TERM_DAYS_DEFAULT,
  PAYMENT_TERM_DAYS_KEY,
  targetMarginFor,
} from '@lezzet/domain-core';
import { resolveLocalizedText } from '@lezzet/types';
import type {
  Address,
  Channel,
  CustomerCreditSummary,
  KeysetCursor,
  OrderSource,
  Page,
  PaymentMethod,
  ProductVariant,
  ProductWithRelations,
  StaffAddressField,
  StaffAddressInput,
  StaffAddressOption,
  StaffCustomerOption,
  StaffDeliveryContext,
  StaffVariantRow,
  UserProfile,
} from '@lezzet/types';
import { EMPTY_PRODUCT_CONTEXT, toVariant } from '../catalog/map';
import { readCostBasis } from '../catalog/cost-basis';
import { effectiveChannelOf, pricingViewerFor } from '../catalog/pricing-viewer';
import { loadProductContext } from '../catalog/product-context';
import { addCustomerAddress } from '../customer/addresses';
import { customerBusiness } from '../delivery/place';
import { resolveCheckoutPayment } from './checkout-options';
import { readDeliveryInputs, resolveDelivery } from './delivery';
import { placeOrder, type PlaceOrderOutcome } from './place-order';

/*
  Personelin müşteri adına sipariş girişi: web masası ve mobil uç aynı okumaları ve aynı yazımı çağırır. Fiyat, gün, depo ve ödeme
  kararı motordadır; burada okumalar birleşir ve personel yolunun kapıları (kalem doğrulaması, pazarlık izni) durur.
*/

/** Seçicinin sayfası; arama en az iki harfle başlar, tek harf bütün kümeyi döndürürdü. */
const PICK_PAGE_SIZE = 20;
const MIN_TERM_LENGTH = 2;

function emptyPage<T>(): Page<T> {
  return { rows: [], nextCursor: null };
}

// ── Müşteri ─────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Profil satırı → seçici seçeneği; kanal profilden türer ve onay şartını içerir, ekran `type` kontrolünü kopyalamaz. */
export function toStaffCustomerOption(profile: UserProfile, credit: CustomerCreditSummary | null): StaffCustomerOption {
  return {
    id: profile.id,
    name: profile.name,
    phone: profile.phone,
    email: profile.email,
    type: profile.type,
    channel: effectiveChannelOf(profile),
    isDraft: profile.isDraft,
    siret: profile.companyInfo?.siret ?? null,
    b2bPending: profile.b2bPending,
    credit,
  };
}

/** Seçici seçenekleri; vade özeti yalnız vade izni olan satırda, o müşterinin açık vadeli siparişlerinden türer. */
export async function staffCustomerOptionsOf(db: Db, profiles: readonly UserProfile[]): Promise<StaffCustomerOption[]> {
  if (!profiles.some((p) => p.creditEnabled)) return profiles.map((p) => toStaffCustomerOption(p, null));

  const orders = new OrderService(db);
  const defaultTermDays = await new SettingsService(db).getNumber(PAYMENT_TERM_DAYS_KEY, PAYMENT_TERM_DAYS_DEFAULT);
  return Promise.all(
    profiles.map(async (p) =>
      toStaffCustomerOption(p, p.creditEnabled ? creditSummary(p, await orders.listOpenCreditByCustomer(p.id), defaultTermDays) : null),
    ),
  );
}

export async function staffCustomerOptionOf(db: Db, profile: UserProfile): Promise<StaffCustomerOption> {
  const [option] = await staffCustomerOptionsOf(db, [profile]);
  if (!option) throw new Error(`staff-order: seçenek kurulamadı (${profile.id})`);
  return option;
}

/** Ad, telefon, e-posta ya da SIRET ile arama; eşleşen küme veriyle büyüdüğü için ada göre keyset sayfalıdır. */
export async function searchStaffCustomers(
  db: Db,
  input: { term: string; cursor?: KeysetCursor | null },
): Promise<Page<StaffCustomerOption>> {
  const term = input.term.trim();
  if (term.length < MIN_TERM_LENGTH) return emptyPage();
  const page = await new UserProfileService(db).searchPage(term, { cursor: input.cursor ?? undefined, limit: PICK_PAGE_SIZE });
  return { rows: await staffCustomerOptionsOf(db, page.rows), nextCursor: page.nextCursor };
}

// ── Adres ───────────────────────────────────────────────────────────────────────────────────────────────────────────

function toStaffAddressOption(row: Address): StaffAddressOption {
  const cityLine = `${row.postalCode} ${row.city}`;
  return {
    id: row.id,
    label: [row.line1, row.line2, cityLine].filter(Boolean).join(', '),
    line1: row.line1,
    cityLine,
    recipient: row.recipient,
    isBilling: row.isBilling,
  };
}

/** Müşterinin adres defteri; siparişin deposu ve teslim günü seçilen adresten çözülür. */
export async function readStaffAddresses(db: Db, customerId: string): Promise<StaffAddressOption[]> {
  return (await new AddressService(db).listByCustomer(customerId)).map(toStaffAddressOption);
}

export type StaffAddressOutcome =
  { status: 'ok'; address: StaffAddressOption } | { status: 'invalid'; field: StaffAddressField } | { status: 'not_found' };

/**
 * Personelin açtığı adres müşterinin adres kapısından geçer (ülke ve konum çözümü dahil); alıcı ve telefon burada zorunlu, çünkü
 * kurye kapıda kimi soracağını ve kimi arayacağını bilmek zorunda.
 */
export async function addStaffAddress(db: Db, customerId: string, input: StaffAddressInput): Promise<StaffAddressOutcome> {
  const recipient = input.recipient.trim();
  const phone = input.phone.trim();
  const line1 = input.line1.trim();
  const postalCode = normalizePostalCode(input.postalCode);
  const city = input.city.trim();
  if (!recipient) return { status: 'invalid', field: 'recipient' };
  if (!phone) return { status: 'invalid', field: 'phone' };
  if (!line1) return { status: 'invalid', field: 'line1' };
  if (!isValidPostalCode(postalCode)) return { status: 'invalid', field: 'postalCode' };
  if (!city) return { status: 'invalid', field: 'city' };

  if (!(await new UserProfileService(db).getById(customerId))) return { status: 'not_found' };
  const before = new Set((await new AddressService(db).listByCustomer(customerId)).map((a) => a.id));
  const outcome = await addCustomerAddress(db, {
    customerId,
    recipient,
    phone,
    line1,
    line2: input.line2?.trim() || null,
    postalCode,
    city,
  });
  if (outcome.status === 'invalid_address') return { status: 'invalid', field: 'line1' };
  if (outcome.status !== 'ok') return { status: 'not_found' };
  const created = outcome.addresses.find((a) => !before.has(a.id));
  if (!created) throw new Error(`staff-order: eklenen adres listede yok (${customerId})`);
  return { status: 'ok', address: toStaffAddressOption(created) };
}

// ── Teslim ve ödeme ─────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Adresin teslim bağlamı ve bu tutardaki ödeme seçenekleri; ekran gün, depo ve yöntem uydurmaz. Kalemler ön izlemedir, kesin tavan ve
 * limit kontrolü sipariş yazılırken taslak kapısında yapılır (`payment_not_allowed`).
 */
export async function readStaffDeliveryContext(
  db: Db,
  input: { customerId: string; addressId: string; lines: readonly { totalCents: number; vatRate: number }[] },
): Promise<StaffDeliveryContext | null> {
  const address = (await new AddressService(db).listByCustomer(input.customerId)).find((a) => a.id === input.addressId);
  if (!address) return null;

  const [inputs, business] = await Promise.all([readDeliveryInputs(db), customerBusiness(db, input.customerId)]);
  const delivery = await resolveDelivery(db, {
    postalCode: address.postalCode,
    country: address.country,
    hasNonShippableItem: false,
    business,
    inputs,
  });

  const basketCents = input.lines.reduce((sum, line) => sum + line.totalCents, 0);
  const [warehouse, options] = await Promise.all([
    delivery.warehouseId ? new WarehouseService(db).getById(delivery.warehouseId) : null,
    resolveCheckoutPayment(db, {
      customerId: input.customerId,
      deliveryType: delivery.deliveryType,
      basketCents,
      subtotalCents: basketCents,
      lines: input.lines,
      country: address.country,
      zoneId: delivery.zoneId,
      warehouseId: delivery.warehouseId,
    }),
  ]);

  return {
    delivery: {
      deliveryType: delivery.deliveryType,
      availableDates: delivery.availableDates,
      warehouseId: delivery.warehouseId,
      warehouseName: warehouse?.name ?? null,
      unresolvedReason: delivery.unresolvedReason,
    },
    payment: {
      // Çevrimiçi ödeme çıkarılır: personel ekranı ödeme sağlayıcısını açmaz, seçilse `payment_unavailable` dönerdi.
      methods: options.methods.filter((m) => m !== 'online'),
      codBlockedReason: options.codBlockedReason,
      codMaxCents: options.codMaxCents,
      creditAvailable: options.creditAvailable,
      creditBlockedReason: options.creditBlockedReason,
    },
  };
}

// ── Kalemler ────────────────────────────────────────────────────────────────────────────────────────────────────────

interface StaffVariantInput {
  product: Pick<ProductWithRelations, 'name' | 'vatRate' | 'targetMarginPercent' | 'targetMarginB2bPercent' | 'shippable'>;
  variant: Pick<ProductVariant, 'id' | 'label'>;
  /** Motorun çözdüğü fiyat; `null` = bu müşteriye satışa kapalı. */
  priceCents: number | null;
  costCents: number | null;
  /** Deponun kullanılabilir adedi; depo bilinmiyorsa anlamsızdır. */
  availableQty: number;
  channel: Channel;
  warehouseKnown: boolean;
  /** Maliyet ve hedef marj yalnız pazarlık yazabilene gider. */
  includeCost: boolean;
}

/** Seçici satırının saf kurulumu; depo bilinmiyorsa adet `null`dur, çünkü sıfır ölçülmemiş değeri ölçülmüş gösterirdi. */
export function toStaffVariantRow(input: StaffVariantInput): StaffVariantRow {
  return {
    variantId: input.variant.id,
    title: `${resolveLocalizedText(input.product.name)} · ${resolveLocalizedText(input.variant.label)}`,
    listPriceCents: input.priceCents,
    costCents: input.includeCost ? input.costCents : null,
    targetMarginPercent: input.includeCost
      ? targetMarginFor(input.channel, input.product.targetMarginPercent, input.product.targetMarginB2bPercent)
      : null,
    vatRate: input.product.vatRate,
    availableQty: input.warehouseKnown ? input.availableQty : null,
    shippable: input.product.shippable,
  };
}

/**
 * Kalem seçicisi: satıştaki ürünler müşteriye çözülmüş fiyatla ve siparişin deposunun stoğuyla gelir. `term: null` bütün kataloğu
 * katalog sırasıyla sayfalar; yazılan terim en az iki harf ister.
 */
export async function searchStaffVariants(
  db: Db,
  input: { customerId: string; term: string | null; warehouseId: string | null; cursor?: KeysetCursor | null; includeCost: boolean },
): Promise<Page<StaffVariantRow>> {
  const query = input.term?.trim() ?? null;
  if (query !== null && query.length < MIN_TERM_LENGTH) return emptyPage();

  const profile = await new UserProfileService(db).getById(input.customerId);
  const viewer = await pricingViewerFor(db, profile);
  const business = customerBusinessOf(profile);
  const page = await new ProductService(db).listWithRelations({
    filters: { status: 'active', ...(query === null ? {} : { query }) },
    cursor: input.cursor ?? undefined,
    limit: PICK_PAGE_SIZE,
  });
  if (page.rows.length === 0) return emptyPage();

  // Kargo deposu müşterinin işinden seçilir: QUALITE kargo göndermez, müşterisine kargo stoğu gösterilmez.
  const shippingWarehouseId =
    (await new WarehouseService(db).list({ activeOnly: true })).find((w) => w.shipsOnline && w.business === business)?.id ?? null;
  const context = await loadProductContext(db, page.rows, { warehouseId: input.warehouseId, shippingWarehouseId, business }, viewer);
  const costs = input.includeCost
    ? await readCostBasis(
        db,
        page.rows.flatMap((p) => p.variants?.map((v) => v.id) ?? []),
      )
    : null;

  const rows = page.rows.flatMap((product) =>
    (product.variants ?? [])
      .filter((variant) => variant.isActive)
      .map((variant) => {
        const ctx = context.get(product.id) ?? EMPTY_PRODUCT_CONTEXT;
        return toStaffVariantRow({
          product,
          variant,
          priceCents: toVariant(variant, 'tr', ctx, product.shippable).priceCents,
          costCents: costs ? costOf(costs.get(variant.id) ?? { status: 'unknown' }) : null,
          availableQty: ctx.stock.get(variant.id)?.availableQty ?? 0,
          channel: viewer.channel,
          warehouseKnown: input.warehouseId !== null,
          includeCost: input.includeCost,
        });
      }),
  );
  return { rows, nextCursor: page.nextCursor };
}

// ── Sipariş ─────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface StaffOrderInput {
  customerId: string;
  addressId: string;
  deliveryDate: string | null;
  paymentMethod: PaymentMethod;
  onAccount: boolean;
  /** `unitPriceCents` yalnız pazarlık edilen kalemde gelir; öteki kalemin fiyatını motor çözer ki siparişin parası istemciden yazılmasın. */
  lines: readonly { variantId: string; qty: number; unitPriceCents?: number | null }[];
  /** Siparişi yazan personelin profil kimliği; pazarlık izni bu kişinin rolünden okunur. */
  actorId: string;
  isGiftOrder?: boolean;
  orderSource?: OrderSource;
  idempotencyKey?: string | null;
}

export type StaffOrderOutcome =
  | PlaceOrderOutcome
  | { status: 'invalid_lines'; problem: 'empty' | 'qty' | 'price' }
  /** Pazarlıklı fiyatı yönetici olmayan gönderdi; sipariş yazılmadı. */
  | { status: 'price_not_allowed' };

/** Masada ya da sahada yazılan sipariş müşteri yolunun kendisidir (`placeOrder`); farkı `staff` künyesi ve pazarlık kapısıdır. */
export async function placeStaffOrder(db: Db, input: StaffOrderInput): Promise<StaffOrderOutcome> {
  if (input.lines.length === 0) return { status: 'invalid_lines', problem: 'empty' };
  if (input.lines.some((l) => !Number.isInteger(l.qty) || l.qty <= 0)) return { status: 'invalid_lines', problem: 'qty' };

  const overrides = new Map<string, number>();
  for (const line of input.lines) {
    if (line.unitPriceCents === null || line.unitPriceCents === undefined) continue;
    if (line.unitPriceCents < 0) return { status: 'invalid_lines', problem: 'price' };
    overrides.set(line.variantId, line.unitPriceCents);
  }
  if (overrides.size > 0) {
    const actor = await new UserProfileService(db).getById(input.actorId);
    if (!actor || !canNegotiatePrice(actor.roles)) return { status: 'price_not_allowed' };
  }

  return placeOrder(db, {
    locale: 'fr',
    customerId: input.customerId,
    entries: input.lines.map((l) => ({ kind: 'variant' as const, variantId: l.variantId, qty: l.qty, stockId: null })),
    addressId: input.addressId,
    deliveryDate: input.deliveryDate,
    paymentMethod: input.paymentMethod,
    onAccount: input.onAccount,
    idempotencyKey: input.idempotencyKey,
    staff: {
      // Profil kimliği, auth kimliği değil: `price_set_by` `user_profiles`a bağlı ve ikisi de `string` olduğu için tip ayırt etmez.
      actorId: input.actorId,
      priceOverrides: overrides.size > 0 ? overrides : undefined,
      isGiftOrder: input.isGiftOrder,
      orderSource: input.orderSource,
    },
    createPaymentSession: null,
  });
}

/**
 * Siparişin yazılmayan hâlinin personel dilindeki cümlesi; web masası ve mobil aynı cümleyi gösterir. Müşteri yüzeyi aynı reddi başka
 * cümleyle anlatır, o yüzden çeviri motorda değil burada.
 */
export function staffOrderRejectionText(outcome: Exclude<StaffOrderOutcome, { status: 'placed' }>): string {
  switch (outcome.status) {
    case 'invalid_lines':
      if (outcome.problem === 'empty') return 'En az bir kalem girilmeli.';
      return outcome.problem === 'qty' ? 'Adet sıfırdan büyük olmalı.' : 'Pazarlıklı fiyat eksi olamaz.';
    case 'price_not_allowed':
      return 'Pazarlıklı fiyatı yalnız yönetici yazar.';
    case 'blocked_lines':
      return `Satışa kapalı ya da bu depoda bulunmayan kalem: ${outcome.lines.join(', ')}`;
    case 'insufficient_here':
      return `Depoda yeterli adet yok — ${outcome.lines.map((l) => `${l.name}: ${l.available} adet`).join(', ')}`;
    case 'date_unavailable':
      return outcome.availableDates.length
        ? `Seçilen gün bu bölgeye uygun değil. Uygun günler: ${outcome.availableDates.join(', ')}`
        : 'Bu adrese yaklaşan bir teslimat günü yok.';
    case 'payment_not_allowed':
      return `Bu ödeme yöntemi bu siparişte açık değil. Açık yöntemler: ${outcome.methods.join(', ')}`;
    case 'address_city_mismatch':
      return `Adresin şehri posta koduyla uyuşmuyor (${outcome.postalCode}). Beklenen: ${outcome.places.join(', ')}`;
    case 'cold_chain_unshippable':
      return 'Soğuk zincir ürünü bu adrese gönderilemez — rota dışı adrese kargoyla çıkamaz.';
    case 'warehouse_unresolved':
      if (outcome.reason === 'outside_zones') return 'Adres müşterinin işinin bölgeleri dışında; QUALITE kargo göndermez.';
      return outcome.reason === 'ambiguous_zone'
        ? 'Posta kodu birden çok bölgeye bağlı — bölge tanımları düzeltilmeli.'
        : 'Kargo deposu tanımlı değil.';
    case 'customer_not_found':
      return 'Müşteri bulunamadı.';
    case 'shipping_option_unavailable':
      return 'Bu adrese eve teslim eden kargo servisi bulunamadı.';
    case 'shipping_unpriced':
      return outcome.reason === 'carrier'
        ? 'Taşıyıcıdan kargo fiyatı alınamadı; birkaç dakika sonra tekrar deneyin.'
        : 'Kargo fiyatı hesaplanamıyor: ürünün ambalaj ölçüsü, deponun kargo kutusu ya da depo adresi eksik.';
    case 'service_point_invalid':
      return 'Seçilen kargo servisi teslim noktası istiyor; nokta geçerli değil.';
    case 'address_not_found':
      return 'Adres bulunamadı.';
    case 'empty_cart':
      return 'Kalem girilmedi.';
    case 'insufficient_stock':
      return `Stok araya girdi — kalan adet: ${outcome.available}`;
    // Personel ekranı online ödeme sunmaz; yine de karşılıksız bırakılmaz, sebebi yutan cümle arızayı saklardı.
    case 'payment_unavailable':
      return 'Bu ekranda online ödeme alınamaz. Nakit, kart (kapıda) ya da vadeli seçin.';
    case 'order_not_placed':
      return 'Sipariş açıldı ama kesinleşmedi — kayıt okunamadı ya da durum geçişi reddedildi. Tekrar deneyin.';
    // Müşteri yolunun kapıları personel yolunda doğmaz; doğarlarsa personel ne olduğunu görsün.
    case 'price_changed':
      return `Fiyat bu arada değişti: ${outcome.lines.map((l) => l.name).join(', ')} — kalemi yeniden ekleyin.`;
    case 'cart_changed':
      return 'Kalem listesi bu arada değişti — ekranı yenileyip tekrar deneyin.';
    case 'min_basket':
      return `Asgari sepet tutmuyor (${outcome.missingCents} kuruş eksik).`;
    case 'payment_required':
    case 'open_payment':
      return 'Sipariş taslak olarak açıldı ama ödeme adımı bu ekranda tamamlanamaz — siparişler listesinden takip edin.';
    case 'pickup_not_allowed':
    case 'pickup_warehouse_unavailable':
      return 'Gel-al seçimi personel sipariş girişinde yok — sipariş adrese teslim olarak yazılır, yeniden deneyin.';
  }
  // `default` yok: motora eklenen yeni ret hâli burada derlemede kırılır, sessizce genel bir cümleye düşmez.
  const unhandled: never = outcome;
  return unhandled;
}
