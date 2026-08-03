import { toCents } from '@lezzet/helper';
import type { Address, Discount, DiscountCode, Order, UserProfile } from '@lezzet/types';
import type { ConsentView, CustomerAddressRow, CustomerOrderRow, CustomerRow, PersonalCouponRow } from './customers-types';

// DB satırı → view-model indirgemesi. RSC ve server action'lar bunu PAYLAŞIR: ilk sayfa ile sonraki
// sayfalar aynı şekli üretsin diye tek yerde durur (ürün/fiyat ekranlarının deseni).

/**
 * Avatar baş harfleri. Adı boş olan taslak kayıtta (WhatsApp'tan açılmış, henüz adı yok) telefonun
 * son iki hanesi kullanılır — boş bir daire, kimliği olmayan bir satır demektir.
 */
function initialsOf(profile: UserProfile): string {
  const words = profile.name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return (profile.phone ?? '??').slice(-2);
  if (words.length === 1) return words[0]!.slice(0, 2).toLocaleUpperCase('tr');
  return (words[0]![0]! + words[words.length - 1]![0]!).toLocaleUpperCase('tr');
}

/**
 * Profil satırlarını liste satırlarına indirger.
 *
 * `overdueIds` verilmezse hiçbir satır gecikmiş sayılmaz. Varsayılanın boş küme olması bilinçli:
 * "bilmiyorum" ile "gecikme yok" ekranda aynı görünür ve bu tek yerde kabul edilebilir — sonraki
 * sayfaların rozeti, sayfa açılışındaki gecikme kümesinden gelir (yeni bir tur atmaz).
 *
 * **Adı olmayan kayıt gizlenmez.** Taslak müşterinin adı boştur ve ekran onu "—" ile değil telefonuyla
 * gösterir: operatörün WhatsApp yazışması sırasında aradığı şey tam olarak o telefondur.
 */
export function toCustomerRows(profiles: readonly UserProfile[], overdueIds: ReadonlySet<string> = new Set()): CustomerRow[] {
  return profiles.map((p) => ({
    id: p.id,
    name: p.name.trim() || (p.phone ?? p.email ?? p.id.slice(0, 8)),
    phone: p.phone,
    email: p.email,
    type: p.type,
    country: p.country,
    initials: initialsOf(p),
    isDraft: p.isDraft,
    b2bApproved: p.b2bApproved,
    creditEnabled: p.creditEnabled,
    hasOverdue: overdueIds.has(p.id),
    preferredLanguage: p.preferredLanguage,
    vatNumber: p.vatNumber,
    createdAt: p.createdAt,
  }));
}

/** Adres satırı — tek cümlelik okunabilir hâli; ekran alanları tek tek dizmez. */
export function toCustomerAddressRows(addresses: readonly Address[]): CustomerAddressRow[] {
  return addresses.map((a) => ({
    id: a.id,
    label: a.label,
    // Adresin İKİNCİ satırı varsa (daire/kat) atlanmaz: kurye onu okuyor.
    line: [a.line1, a.line2].filter(Boolean).join(' · '),
    postalCode: a.postalCode,
    city: a.city,
    country: a.country,
    isDefault: a.isDefault,
  }));
}

/**
 * Pazarlama izninin görünümü — SALT OKUNUR (tasarım §6: admin eliyle "verildi" yapılamaz, aksi GDPR
 * kanıtını bozar). `null` = hiç sorulmamış; "reddetti" ile aynı şey DEĞİL ve ekran ikisini ayırır.
 */
export function toConsentView(consent: { granted: boolean; at?: string | null; source?: string | null } | null | undefined): ConsentView | null {
  if (!consent) return null;
  return { granted: consent.granted, at: consent.at ?? null, source: consent.source ?? null };
}

/**
 * Müşteriye özel kuponlar → satır. Sabit tutar KURUŞA çevrilir, yüzde olduğu gibi taşınır (STACK §8).
 */
export function toPersonalCouponRows(
  rules: readonly Discount[],
  codes: Map<string, readonly DiscountCode[]>,
  usage: Map<string, { total: number }>,
): PersonalCouponRow[] {
  return rules.map((rule) => ({
    id: rule.id,
    name: rule.name,
    percent: rule.percent,
    amountCents: rule.amountCents,
    codes: (codes.get(rule.id) ?? []).map((c) => c.code),
    usedCount: usage.get(rule.id)?.total ?? 0,
    maxUses: rule.maxUses,
    validTo: rule.validTo,
    isActive: rule.isActive,
  }));
}

/**
 * Edinim kaynağının okunabilir hâli. `acquisition_source` serbest bir jsonb: hangi anahtarın
 * dolduğu kaynağa göre değişir. Ekran TEK cümle ister, bu yüzden bilinen anahtarlar sırayla denenir
 * ve hiçbiri yoksa `null` döner — boş bir küme "kaynak yok" demektir, "bilinmiyor" demez.
 */
export function acquisitionLabel(source: Record<string, unknown> | null): string | null {
  if (!source) return null;
  for (const key of ['channel', 'source', 'utm_source', 'utmSource', 'campaign']) {
    const value = source[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

/**
 * Müşterinin son siparişleri → önizleme satırları. Tutar KURUŞA çevrilir (STACK §8: DB'de euro,
 * uygulamada cent).
 *
 * Referans numarası olmayan sipariş TASLAKTIR (yarım kalmış checkout) ve listede numarasız görünür;
 * gizlemek "bu müşteri iki kez denedi ama tamamlamadı" bilgisini yok etmek olurdu.
 */
export function toCustomerOrderRows(orders: readonly Order[]): CustomerOrderRow[] {
  return orders.map((o) => ({
    id: o.id,
    referenceNo: o.referenceNo,
    createdAt: o.createdAt,
    totalCents: toCents(o.total),
    status: o.status,
    paymentStatus: o.paymentStatus,
    href: `/operations/orders/${o.id}`,
  }));
}
