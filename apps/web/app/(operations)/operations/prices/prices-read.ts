import { costOf, isBelowTargetMargin, revenueHtOf, tightestMargin, type CostBasis } from '@lezzet/domain-core';
import { toCents } from '@lezzet/helper';
import { resolveLocalizedText, type Channel, type Discount, type Price, type ProductPriceRow, type UserProfile } from '@lezzet/types';
import {
  titleOf,
  type ChannelPriceCell,
  type CustomerPriceRow,
  type DiscountCustomerRow,
  type DiscountRow,
  type PriceRow,
} from './prices-types';

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

interface PriceRowInput {
  products: ProductPriceRow[];
  prices: ChannelPriceMaps;
  /**
   * Varyant başına maliyet TABANI (kuruş) — yenileme maliyeti + aykırı freni (`readCostBasis`).
   * Otomatik fiyatın kullandığı tabanın AYNISI: ayrılsalardı ekran, sistemin kendi yazdığı fiyatı
   * "marj-altı" diye işaretleyebilirdi.
   */
  costs: Map<string, CostBasis>;
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
      const basis = costs.get(variant.id);
      const costCents = basis ? costOf(basis) : null;

      // Marj her kanal için ayrı çıkar; ekran TEK sayı gösterir → en darı (bkz. `tightestMargin`).
      const entries: Array<{ channel: Channel; revenueHtCents: number }> = [];
      if (b2c.amountCents !== null) entries.push({ channel: 'b2c', revenueHtCents: revenueHtOf('b2c', b2c.amountCents, product.vatRate) });
      if (b2b.amountCents !== null) entries.push({ channel: 'b2b', revenueHtCents: revenueHtOf('b2b', b2b.amountCents, product.vatRate) });

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
        // Maliyet sıçraması satırla birlikte taşınır: otomatik fiyatın neden beklediğini ekran
        // ancak bu bilgiyle söyleyebilir (sessiz duran otomatik, bozuk otomatiktir).
        costJump:
          basis?.status === 'outlier'
            ? { medianCents: basis.medianCents, deviationPercent: Math.round(basis.deviationPercent) }
            : null,
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
  /** Varyant başına yenileme maliyeti (kuruş) — ekranın geri kalanıyla aynı taban. */
  costs: Map<string, number>;
  /** Boyun ürününden gelen karar girdileri (KDV oranı, hedef marj). */
  products: Map<string, { vatRate: number; targetMarginPercent: number | null }>;
}

/** Özel fiyat satırları — kimlikler adlara, tutarlar kuruşa çevrilir; sıra müşteri adına göre. */
export function toCustomerPriceRows({ rows, profiles, variantTitles, listCents, costs, products }: CustomerPriceInput): CustomerPriceRow[] {
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
        costCents: costs.get(row.variantId) ?? null,
        vatRate: products.get(row.variantId)?.vatRate ?? 0,
        targetMarginPercent: products.get(row.variantId)?.targetMarginPercent ?? null,
        validFrom: row.validFrom,
      };
    })
    .sort((a, b) => a.customerName.localeCompare(b.customerName, 'tr'));
}

/** Genel indirim oranı tanımlı müşteriler — oran müşteri kaydında yaşar, burada yalnız izlenir. */
export function toDiscountCustomerRows(profiles: UserProfile[]): DiscountCustomerRow[] {
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

interface DiscountRowInput {
  rules: Discount[];
  usage: Map<string, { total: number; byCustomer: Map<string, number> }>;
  categoryNames: Map<string, string>;
  collectionNames: Map<string, string>;
  customerNames: Map<string, string>;
  now: Date;
}

/**
 * İndirim kurallarını satıra indirger: kimlikler adlara, tutarlar kuruşa, koşullar tek cümleye.
 *
 * **"Yürürlükte mi" KARARI burada verilir ve bu bilinçli bir sınır:** motorun `isApplicable`'ı
 * SEPETE bakar (kod girildi mi, matrah eşiği geçti mi, bu müşteri kaç kez kullandı) — sepetsiz
 * yanıtlanamaz. Ekranın sorusu daha dar: "bu kural bugün hiç uygulanabilir mi". Pasiflik, tarih
 * penceresi ve TOPLAM kullanım tavanı sepetten bağımsızdır; ekran yalnız onları söyler ve
 * söylemediğini iddia etmez.
 */
export function toDiscountRows({ rules, usage, categoryNames, collectionNames, customerNames, now }: DiscountRowInput): DiscountRow[] {
  return rules.map((rule): DiscountRow => {
    const usedCount = usage.get(rule.id)?.total ?? 0;
    const scopeName =
      rule.scope === 'category'
        ? (categoryNames.get(rule.categoryId ?? '') ?? 'silinmiş kategori')
        : rule.scope === 'collection'
          ? (collectionNames.get(rule.collectionId ?? '') ?? 'silinmiş koleksiyon')
          : '';

    const dormantReason = !rule.isActive
      ? 'kapalı'
      : rule.validFrom && new Date(rule.validFrom) > now
        ? 'henüz başlamadı'
        : rule.validTo && new Date(rule.validTo) < now
          ? 'süresi doldu'
          : rule.maxUses !== null && usedCount >= rule.maxUses
            ? 'kullanım sınırı doldu'
            : '';

    return {
      id: rule.id,
      name: rule.name,
      trigger: rule.trigger,
      code: rule.code,
      type: rule.type,
      // Sabit tutar KURUŞA çevrilir (STACK §8); yüzde olduğu gibi taşınır.
      value: rule.type === 'fixed' ? toCents(rule.value) : rule.value,
      scope: rule.scope,
      scopeName,
      minBasketCents: rule.minBasket === null ? null : toCents(rule.minBasket),
      firstOrderOnly: rule.firstOrderOnly,
      validFrom: rule.validFrom,
      validTo: rule.validTo,
      customerName: rule.customerId ? (customerNames.get(rule.customerId) ?? 'silinmiş müşteri') : null,
      maxUses: rule.maxUses,
      perCustomerLimit: rule.perCustomerLimit,
      usedCount,
      isActive: rule.isActive,
      liveNow: dormantReason === '',
      dormantReason,
    };
  });
}
