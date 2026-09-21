import {
  AddressService,
  ConversationService,
  ProductService,
  UserProfileService,
  WarehouseService,
  type Db,
} from '@lezzet/database';
import {
  EMPTY_PRODUCT_CONTEXT,
  effectiveChannelOf,
  loadProductContext,
  pricingViewerOf,
  readCostBasis,
  readDeliveryInputs,
  resolveCheckoutPayment,
  resolveDelivery,
  toVariant,
} from '@lezzet/application';
import { costOf, targetMarginFor } from '@lezzet/domain-core';
import { resolveLocalizedText } from '@lezzet/types';
import type { Channel, ProductVariant, ProductWithRelations, UserProfile } from '@lezzet/types';
import type { AddressPickOption, CustomerPickOption, DeliveryContext, VariantPickRow } from './new-order-types';

/**
 * Elle sipariş girişinin okumaları; fiyat, teslimat günü, ödeme yöntemi ve marj kararı motordadır. Fiyat aynı motordan
 * okunur ki ekranın gösterdiği sayı siparişin açıldığı sayıyla aynı olsun; operatör değiştirmedikçe sunucuya sayı gitmez.
 */

const SEARCH_LIMIT = 20;

/**
 * Profil satırı → seçici seçeneği. **Saf** ve dışa açık: kararı burada test ediliyor, DB turunda
 * değil (sayfa okumalarının ortak deseni — `toOrderRows` · `toWarehouseRows` emsali).
 */
export function toCustomerOption(row: UserProfile): CustomerPickOption {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    email: row.email,
    type: row.type,
    // Kanal profilden TÜRETİLİR ve ONAY şartını içerir — ekran `type === 'company'` kontrolünü
    // kopyalasaydı onaysız şirket B2B görünür, fiyatı ise B2C çözülürdü (DOMAIN §10).
    channel: effectiveChannelOf(row),
    isDraft: row.isDraft,
  };
}

/**
 * Sohbetten gelindiğinde müşteriyi önseçili getirir; ekranın "seçim yapılmadan okuma yok" kuralının tek istisnası.
 * Konuşma yoksa, kimliğe bağlı değilse ya da profil silinmişse `null` döner ve ekran boş seçiciyle açılır.
 */
export async function readConversationCustomer(db: Db, conversationId: string): Promise<CustomerPickOption | null> {
  const conversation = await new ConversationService(db).getById(conversationId);
  if (!conversation?.customerId) return null;
  const profile = await new UserProfileService(db).getById(conversation.customerId);
  return profile ? toCustomerOption(profile) : null;
}

/** Telefon ya da ad ile müşteri arama — operatörün elindeki tek ipucu genelde numaradır. */
export async function searchCustomerOptions(db: Db, term: string): Promise<CustomerPickOption[]> {
  const query = term.trim();
  if (query.length < 2) return [];
  return (await new UserProfileService(db).search(query, SEARCH_LIMIT)).map(toCustomerOption);
}

/** Müşterinin adres defteri; sipariş deposu ve teslimat günü seçilen adresten çözülür. */
export async function readAddressOptions(db: Db, customerId: string): Promise<AddressPickOption[]> {
  const rows = await new AddressService(db).listByCustomer(customerId);
  return rows.map((row) => ({
    id: row.id,
    label: [row.line1, row.line2, `${row.postalCode} ${row.city}`].filter(Boolean).join(', '),
    recipient: row.recipient,
  }));
}

/**
 * Adres seçilince açılan bağlam: gün listesi, açık ödeme yöntemleri ve vade yetkisi; ekran bunları uydurmaz.
 * Sepet tutarı sıfır geçilir, çünkü kalemler henüz yok; kesin tavan kontrolü taslak kapısındadır (`payment_not_allowed`).
 */
export async function readDeliveryContext(db: Db, customerId: string, addressId: string): Promise<DeliveryContext | null> {
  const address = (await new AddressService(db).listByCustomer(customerId)).find((a) => a.id === addressId);
  if (!address) return null;

  const inputs = await readDeliveryInputs(db);
  const delivery = await resolveDelivery(db, {
    postalCode: address.postalCode,
    country: address.country,
    hasNonShippableItem: false,
    inputs,
  });

  const options = await resolveCheckoutPayment(db, {
    customerId,
    deliveryType: delivery.deliveryType,
    basketCents: 0,
    subtotalCents: 0,
    lines: [],
    country: address.country,
    zoneId: delivery.zoneId,
    warehouseId: delivery.warehouseId,
  });

  return {
    deliveryType: delivery.deliveryType,
    availableDates: delivery.availableDates,
    /**
     * `online` çıkarılır: kapı ödeme sağlayıcısını açmadığı için seçilse `payment_unavailable` ile reddedilirdi.
     */
    paymentMethods: options.methods.filter((m) => m !== 'online'),
    creditAvailable: options.creditAvailable,
    // Siparişin deposu AYNI çözümden çıkıyor: kalem seçicisinin stok sayısı buna bağlı ve ikinci
    // bir tur açmak, iki okuma arasında bölge değişirse ekranı kendi fiyatıyla çelişik bırakırdı.
    warehouseId: delivery.warehouseId,
  };
}

/**
 * Kalem seçicisi: ürün adında arama, sonuç müşteriye çözülmüş fiyatla döner. Depo bilinmiyorsa adet `null` kalır.
 */
export async function searchVariantRows(
  db: Db,
  opts: { customerId: string; term: string; warehouseId: string | null },
): Promise<VariantPickRow[]> {
  const query = opts.term.trim();
  if (query.length < 2) return [];

  const viewer = await pricingViewerOf(db, opts.customerId);
  const page = await new ProductService(db).listWithRelations({ filters: { query }, limit: SEARCH_LIMIT });
  if (page.rows.length === 0) return [];

  const shippingWarehouseId = (await new WarehouseService(db).list({ activeOnly: true })).find((w) => w.shipsOnline)?.id ?? null;
  const context = await loadProductContext(db, page.rows, { warehouseId: opts.warehouseId, shippingWarehouseId }, viewer);

  const variantIds = page.rows.flatMap((p) => p.variants?.map((v) => v.id) ?? []);
  const costs = await readCostBasis(db, variantIds);

  return page.rows.flatMap((product) =>
    (product.variants ?? [])
      .filter((variant) => variant.isActive)
      .map((variant) => {
        const ctx = context.get(product.id) ?? EMPTY_PRODUCT_CONTEXT;
        return toVariantPickRow({
          product,
          variant,
          priceCents: toVariant(variant, 'tr', ctx, product.shippable).priceCents,
          costCents: costOf(costs.get(variant.id) ?? { status: 'unknown' }),
          availableQty: ctx.stock.get(variant.id)?.availableQty ?? 0,
          channel: viewer.channel,
          warehouseKnown: opts.warehouseId !== null,
        });
      }),
  );
}

interface VariantPickInput {
  product: Pick<ProductWithRelations, 'name' | 'vatRate' | 'targetMarginPercent' | 'targetMarginB2bPercent'>;
  variant: Pick<ProductVariant, 'id' | 'label'>;
  /** Motorun çözdüğü fiyat (`resolvePrice`); `null` = bu müşteriye satışa kapalı. */
  priceCents: number | null;
  costCents: number | null;
  /** Deponun kullanılabilir adedi — depo BİLİNİYORSA anlamlı (aşağıdaki kural). */
  availableQty: number;
  channel: Channel;
  /** Adres seçilmiş mi — depo ondan çözülüyor. */
  warehouseKnown: boolean;
}

/**
 * Seçici satırının saf kurulumu; `availableQty` depo bilinmiyorsa `null`, çünkü sıfır ölçülmemiş değeri ölçülmüş gösterirdi.
 */
export function toVariantPickRow(input: VariantPickInput): VariantPickRow {
  return {
    variantId: input.variant.id,
    title: `${resolveLocalizedText(input.product.name)} · ${resolveLocalizedText(input.variant.label)}`,
    listPriceCents: input.priceCents,
    costCents: input.costCents,
    // Hedef müşterinin geçerli kanalına göre çözülür; toptan hedefi ayrı kurulabilir.
    targetMarginPercent: targetMarginFor(input.channel, input.product.targetMarginPercent, input.product.targetMarginB2bPercent),
    vatRate: input.product.vatRate,
    availableQty: input.warehouseKnown ? input.availableQty : null,
  };
}

