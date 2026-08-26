import {
  AddressService,
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
  readDeliveryInputs,
  resolveCheckoutPayment,
  resolveDelivery,
  toVariant,
} from '@lezzet/application';
import { costOf, targetMarginFor } from '@lezzet/domain-core';
import { resolveLocalizedText } from '@lezzet/types';
import type { Channel, ProductVariant, ProductWithRelations, UserProfile } from '@lezzet/types';
import { readCostBasis } from '@/lib/pricing/cost-basis';
import type { AddressPickOption, CustomerPickOption, DeliveryContext, VariantPickRow } from './new-order-types';

/**
 * Elle sipariş girişinin okumaları (09.8).
 *
 * **Hiçbiri kural TAŞIMAZ.** Fiyat motorun (`toVariant` → `resolvePrice`), teslimat günü ve ödeme
 * yöntemleri motorun (`resolveDelivery` · `resolveCheckoutPayment`), marj kararı motorun
 * (`isBelowTargetMargin`, ekranda). Buradaki iş o cevapları ekranın alanlarına dağıtmak.
 *
 * **Fiyat neden AYNI motordan okunuyor:** ekran bir sayı gösterip sipariş başka bir sayıdan
 * açılırsa operatör müşteriye söylediği fiyatı tutamaz. Kalem fiyatı, taslak açılırken sepet
 * okumasında bir kez daha çözülüyor (`getCartView`) — ikisi aynı fonksiyona sorduğu sürece aynı
 * cevabı verir. Operatör fiyatı elle değiştirmediği sürece buradan hiçbir sayı sunucuya
 * GÖNDERİLMEZ; gönderilseydi istemcinin yazdığı bir tutar siparişin parasını belirlerdi.
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
 * Adres seçilince açılan bağlam: gün listesi + açık ödeme yöntemleri + vade yetkisi.
 *
 * Ekran bunların HİÇBİRİNİ uydurmaz. Gün bölgeden ve kesim saatinden çıkar, yöntem kümesi kapıda
 * ödeme tavanı ve müşterinin vade yetkisiyle daralır — operatöre kapalı bir yöntemi sunmak, taslak
 * açılırken reddedilecek bir seçim yaptırmak olurdu.
 *
 * Sepet tutarı BURADA sıfır geçiliyor ve bu bilinçli: yöntem kümesini daraltan tavan tutara bağlı
 * ve kalemler henüz girilmemiş olabilir. Kesin kontrol taslak kapısındadır (`payment_not_allowed`);
 * burası operatöre hangi yöntemlerin KONUŞULABİLİR olduğunu gösterir.
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
     * **`online` ÇIKARILIR** (ölçüldü 26.08, tarayıcıda) — masada kart çekilmiyor.
     *
     * Motorun listesi müşterinin KENDİ checkout'u içindir ve orada online meşru bir seçenek.
     * Burada değil: kapı ödeme sağlayıcısını hiç açmıyor (`createPaymentSession: null`), yani
     * seçilse sipariş `payment_unavailable` ile reddedilirdi. Ekranda dururken kapıda reddedilen
     * bir seçenek, operatöre sebebi anlaşılmayan bir hata gösterirdi — nitekim gösterdi: liste
     * sıralı olduğu için `online` İLK seçenekti ve akış tam orada kırıldı.
     *
     * Ödeme bağlantısı göndermek ayrı bir iştir (WhatsApp, 15.x) ve o gün buraya kendi düğmesiyle
     * gelir; bugün olmayan bir yeteneği seçenek diye sunmuyoruz.
     */
    paymentMethods: options.methods.filter((m) => m !== 'online'),
    creditAvailable: options.creditAvailable,
    // Siparişin deposu AYNI çözümden çıkıyor: kalem seçicisinin stok sayısı buna bağlı ve ikinci
    // bir tur açmak, iki okuma arasında bölge değişirse ekranı kendi fiyatıyla çelişik bırakırdı.
    warehouseId: delivery.warehouseId,
  };
}

/**
 * Kalem seçicisi — ürün adında arama, sonuç MÜŞTERİYE ÇÖZÜLMÜŞ fiyatla döner.
 *
 * `warehouseId` siparişin deposudur (adresten çözülmüş): stok sayısı ona göre okunur. Boş
 * bırakılabilir — adres henüz seçilmemişse fiyat yine çözülür ama adet **`null`** kalır, yani
 * "bilmiyorum" der. Sıfır yazmak ölçülmemiş bir değeri ölçülmüş gibi göstermek olurdu (CLAUDE §1).
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
 * Seçici satırının SAF kurulumu — kararı motor verdi, burası dağıtıyor.
 *
 * Tek gerçek kuralı `availableQty`nin üç değerli olması: depo bilinmiyorsa **`null`**, yani
 * "bilmiyorum". Sıfır yazmak ölçülmemiş bir değeri ölçülmüş gibi gösterirdi ve operatör elinde mal
 * varken "depoda 0 adet" okurdu (CLAUDE §1 — ölçülemeyen değer sıfır değildir).
 */
export function toVariantPickRow(input: VariantPickInput): VariantPickRow {
  return {
    variantId: input.variant.id,
    title: `${resolveLocalizedText(input.product.name)} · ${resolveLocalizedText(input.variant.label)}`,
    listPriceCents: input.priceCents,
    costCents: input.costCents,
    // Hedef, müşterinin GEÇERLİ kanalına göre çözülür (15.08): toptan hedefi ayrı kurulabilir.
    targetMarginPercent: targetMarginFor(input.channel, input.product.targetMarginPercent, input.product.targetMarginB2bPercent),
    vatRate: input.product.vatRate,
    availableQty: input.warehouseKnown ? input.availableQty : null,
  };
}

