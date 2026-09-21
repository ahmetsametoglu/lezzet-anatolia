import { targetMarginFor } from '@lezzet/domain-core';
import { type Discount, type DiscountCode, type Price, type UserProfile } from '@lezzet/types';
import type { DiscountUsage } from '@lezzet/database';
import { type CustomerPriceRow, type DiscountCustomerRow, type DiscountRow } from './prices-types';

// DB satırı → view-model indirgemesi; RSC ve eylemler paylaşır. Kararlar motorda (`domain-core/pricing`), burada yalnız taban
// çevrilir: b2c KDV dahil, b2b ve maliyet hariç; tabanı karıştırmak marjı KDV oranı kadar şişirir.

// `toPriceRows` `lib/pricing/price-rows`ta, çünkü ürün önizlemesi de aynı satırı kurar ve kardeş sayfadan import yasak.
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
  products: Map<string, { vatRate: number; targetMarginPercent: number | null; targetMarginB2bPercent: number | null }>;
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
        specialCents: row.amountCents,
        listCents: listCents.get(`${row.variantId}·${row.channel}`) ?? null,
        costCents: costs.get(row.variantId) ?? null,
        vatRate: products.get(row.variantId)?.vatRate ?? 0,
        // Hedef satırın kanalına göre çözülür; diyalog paneli bu tek sayıyı okur.
        targetMarginPercent: targetMarginFor(
          row.channel,
          products.get(row.variantId)?.targetMarginPercent ?? null,
          products.get(row.variantId)?.targetMarginB2bPercent ?? null,
        ),
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
  usage: Map<string, DiscountUsage>;
  /** Kural kimliği → kodları. Kupon dışı kurallarda boş. */
  codes: Map<string, DiscountCode[]>;
  categoryNames: Map<string, string>;
  collectionNames: Map<string, string>;
  customerNames: Map<string, string>;
  now: Date;
}

/**
 * İndirim kurallarını satıra indirger. "Yürürlükte mi" burada verilir ve dardır: pasiflik, tarih ve toplam kullanım tavanı
 * sepetten bağımsızdır, motorun `isApplicable`ı ise sepete bakar.
 */
export function toDiscountRows({ rules, usage, codes, categoryNames, collectionNames, customerNames, now }: DiscountRowInput): DiscountRow[] {
  return rules.map((rule): DiscountRow => {
    const ruleUsage = usage.get(rule.id);
    const usedCount = ruleUsage?.total ?? 0;
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
      publicLabel: rule.publicLabel,
      trigger: rule.trigger,
      // Kod başına kullanım: kotanın kırılımı, kendisi değil — "hangi dil karşılık buldu".
      codes: (codes.get(rule.id) ?? []).map((code) => ({
        id: code.id,
        code: code.code,
        locale: code.locale,
        usedCount: ruleUsage?.byCode.get(code.id) ?? 0,
      })),
      type: rule.type,
      // Servis cent döndürür, alanlar tipine göre ayrık.
      percent: rule.percent,
      amountCents: rule.amountCents,
      scope: rule.scope,
      scopeName,
      // Kimlik de taşınır: ad ekranın, kimlik formun; yalnız ad taşınsa form hedefi seçili açamazdı.
      categoryId: rule.categoryId,
      collectionId: rule.collectionId,
      minBasketCents: rule.minBasketCents,
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
