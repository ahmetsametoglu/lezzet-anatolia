import { isBelowTargetMargin, tightestMargin, vatBaseOf } from '@lezzet/domain-core';
import { removeVat, toCents } from '@lezzet/helper';
import { resolveLocalizedText, type Channel, type Price, type ProductPriceRow, type UserProfile } from '@lezzet/types';
import { titleOf, type ChannelPriceCell, type CustomerPriceRow, type DiscountCustomerRow, type PriceRow } from './prices-types';

// DB satırı → view-model indirgemesi. RSC ve server action'lar bunu PAYLAŞIR: ilk sayfa ile sonraki
// sayfalar aynı şekli üretsin diye tek yerde durur.
//
// KARARLAR BURADA SORULUR, BURADA VERİLMEZ: marj tanımı ve marj-altı ölçütü `domain-core/pricing`'in
// işidir (STACK §4). Bu dosya yalnız veriyi motorun istediği tabana çevirir — ve çevirinin kendisi
// kritiktir: b2c fiyatı KDV DAHİL, b2b hariç, maliyet hariç. Tabanı karıştırmak marjı KDV oranı
// kadar şişirir ve zararına satışı kârlı gösterir.

/** İki kanalın "şu an geçerli" fiyat satırları, varyant kimliğine göre. */
export interface ChannelPriceMaps {
  b2c: Map<string, Price>;
  b2b: Map<string, Price>;
}

const cellOf = (price: Price | undefined): ChannelPriceCell =>
  price ? { amountCents: toCents(price.amount), validFrom: price.validFrom } : { amountCents: null, validFrom: null };

/**
 * Kanal fiyatını KDV HARİÇ tabana indirger — marj karşılaştırmasının tek geçerli tabanı.
 * b2b zaten HT'dir, b2c'den KDV düşülür. `vatBaseOf` tek kaynak: kanalın tabanı burada da,
 * vitrinde de aynı yerden okunur.
 */
function revenueHtCents(channel: Channel, amountCents: number, vatRate: number): number {
  return vatBaseOf(channel) === 'ttc' ? removeVat(amountCents, vatRate) : amountCents;
}

interface PriceRowInput {
  products: ProductPriceRow[];
  prices: ChannelPriceMaps;
  /** Varyant başına ağırlıklı ortalama alış fiyatı (EURO — `unitCostMap`'in çıktısı). */
  costs: Map<string, number>;
  categoryNames: Map<string, string>;
}

/**
 * Ürün sayfasını fiyat SATIRLARINA açar: bir ürün, boyları kadar satır üretir.
 *
 * Pasif boy de listelenir ve bu bilinçli: fiyatı olan ama satışa kapalı bir boy, "neden satılmıyor"
 * sorusunun cevabıdır — gizlemek soruyu görünmez kılardı.
 */
export function toPriceRows({ products, prices, costs, categoryNames }: PriceRowInput): PriceRow[] {
  return products.flatMap((product) => {
    const productName = resolveLocalizedText(product.name);
    const categoryName = product.categoryId ? (categoryNames.get(product.categoryId) ?? '') : '';

    // Boy sırası SABİT: gömülü seçim sırayı garanti etmez, aynı ürünün boyları iki yenilemede yer
    // değiştirirse fiyat karşılaştırması yapılamaz.
    const variants = [...product.variants].sort((a, b) => a.sortOrder - b.sortOrder);

    return variants.map((variant): PriceRow => {
      const b2c = cellOf(prices.b2c.get(variant.id));
      const b2b = cellOf(prices.b2b.get(variant.id));
      const costEuros = costs.get(variant.id);
      const costCents = costEuros === undefined ? null : toCents(costEuros);

      // Marj her kanal için ayrı çıkar; ekran TEK sayı gösterir → en darı (bkz. `tightestMargin`).
      const entries: Array<{ channel: Channel; revenueHtCents: number }> = [];
      if (b2c.amountCents !== null) entries.push({ channel: 'b2c', revenueHtCents: revenueHtCents('b2c', b2c.amountCents, product.vatRate) });
      if (b2b.amountCents !== null) entries.push({ channel: 'b2b', revenueHtCents: revenueHtCents('b2b', b2b.amountCents, product.vatRate) });

      const tightest = tightestMargin(entries, costCents);
      const tightestRevenue = entries.find((e) => e.channel === tightest?.channel)?.revenueHtCents ?? null;

      return {
        variantId: variant.id,
        productId: product.id,
        productName,
        variantLabel: resolveLocalizedText(variant.label),
        title: titleOf(productName, resolveLocalizedText(variant.label)),
        categoryName,
        status: product.status,
        variantActive: variant.isActive,
        b2c,
        b2b,
        costCents,
        marginPercent: tightest?.percent ?? null,
        marginChannel: (tightest?.channel as Channel | undefined) ?? null,
        targetMarginPercent: product.targetMarginPercent,
        belowTarget:
          tightestRevenue === null ? null : isBelowTargetMargin(tightestRevenue, costCents, product.targetMarginPercent),
        autoPrice: product.autoPrice,
        vatRate: product.vatRate,
        missingPrice: b2c.amountCents === null || b2b.amountCents === null,
      };
    });
  });
}

/** Profilin ekranda görünen adı — adı boşsa kimlik kaybolmasın diye telefon/e-posta yedeği. */
function customerLabel(profile: UserProfile | undefined, fallbackId: string): string {
  if (!profile) return 'Silinmiş müşteri';
  return profile.name || profile.phone || profile.email || fallbackId.slice(0, 8);
}

interface CustomerPriceInput {
  rows: Price[];
  profiles: Map<string, UserProfile>;
  /** Varyant kimliği → görünen ad; özel fiyat sayfadaki ürünlerin DIŞINDA bir boya da bağlı olabilir. */
  variantTitles: Map<string, string>;
  /** Kanal liste fiyatı (kuruş) — `${variantId}·${channel}` anahtarıyla. */
  listCents: Map<string, number>;
}

/** Özel fiyat satırları — kimlikler adlara, tutarlar kuruşa çevrilir; sıra müşteri adına göre. */
export function toCustomerPriceRows({ rows, profiles, variantTitles, listCents }: CustomerPriceInput): CustomerPriceRow[] {
  return rows
    .map((row): CustomerPriceRow => {
      const profile = row.customerId ? profiles.get(row.customerId) : undefined;
      return {
        priceId: row.id,
        customerId: row.customerId ?? '',
        customerName: customerLabel(profile, row.customerId ?? ''),
        isCompany: Boolean(profile?.companyInfo),
        variantId: row.variantId,
        variantTitle: variantTitles.get(row.variantId) ?? 'Bilinmeyen boy',
        channel: row.channel,
        specialCents: toCents(row.amount),
        listCents: listCents.get(`${row.variantId}·${row.channel}`) ?? null,
        validFrom: row.validFrom,
      };
    })
    .sort((a, b) => a.customerName.localeCompare(b.customerName, 'tr'));
}

/** Genel indirim oranı tanımlı müşteriler — oran müşteri kaydında yaşar, burada yalnız izlenir. */
export function toDiscountRows(profiles: UserProfile[]): DiscountCustomerRow[] {
  return profiles
    .flatMap((profile) =>
      profile.discountPercent === null || profile.discountPercent === undefined
        ? []
        : [
            {
              customerId: profile.id,
              customerName: customerLabel(profile, profile.id),
              isCompany: Boolean(profile.companyInfo),
              discountPercent: profile.discountPercent,
            },
          ],
    )
    .sort((a, b) => b.discountPercent - a.discountPercent);
}
