import 'server-only';
import { DiscountCodeService, DiscountService, OrderService, UserProfileService, type Db, type DiscountUsage } from '@lezzet/database';
import {
  applyBestDiscount,
  checkCouponEligibility,
  type AppliedDiscount,
  type DiscountRule,
  type DiscountableLine,
} from '@lezzet/domain-core';
import type { Discount, DiscountCode, LocalizedText } from '@lezzet/types';
import type { CartDiscount, CouponFailure, DiscountReason } from './cart-types';

/**
 * Sepette indirim çözümü (09.6 müşteri tarafı) — **uygulama katmanı orkestrasyonu**. DOMAIN §5.
 *
 * Motor hazırdı, kablo yoktu: kuralları servis getirir, kararı `applyBestDiscount` verir, ikisini
 * burası birleştirir (STACK §4). **Tek-en-büyük kuralı, matrah muafiyetleri ve pay dağıtımı burada
 * TEKRARLANMAZ** — hepsi motorda yaşar.
 *
 * Ekranın dört ret hâli ("süresi dolmuş" · "geçersiz" · "40 € üzeri" · "otomatik indirim daha
 * büyük") buradan çıkar. Sebep motorun kendi yükleminden türer (`checkCouponEligibility`); ayrı
 * yazılsaydı ekranın söylediği sebeple motorun kararı bir gün ayrışırdı.
 */

export interface CartDiscountInput {
  lines: readonly DiscountableLine[];
  customerId?: string | null;
  /** Müşterinin girdiği kod; boşsa yalnız otomatik adaylar değerlendirilir. */
  couponCode?: string | null;
  now?: Date;
}

/**
 * Sepetin indirimi. Kupon girilmediyse otomatik adaylar (kampanya + müşteri oranı) değerlendirilir;
 * girildiyse önce kuponun kendisi teşhis edilir, sonra havuzun tamamı yarıştırılır.
 *
 * **Kupon geçerli olsa bile kazanmayabilir** — o zaman ret değil, `outranked` döner ve sepete
 * kazanan indirim uygulanır: müşteri hem sebebi görür hem parasını kaybetmez.
 */
export async function resolveCartDiscount(db: Db, input: CartDiscountInput): Promise<CartDiscount> {
  const discounts = new DiscountService(db);
  const code = input.couponCode?.trim() ?? '';
  const now = input.now ?? new Date();

  const candidates = await discounts.listCandidates(input.customerId);
  const hit = code ? await discounts.findByCode(code) : null;
  const coupon = hit?.discount ?? null;

  // Koda karşılık gelen kupon aday havuzunda olmayabilir (pasif ya da kişisel): motorun görmesi için
  // havuza eklenir — "neden uygulanmadı" sorusunun cevabı da o zaman doğar.
  const pool = coupon && !candidates.some((row) => row.id === coupon.id) ? [...candidates, coupon] : candidates;
  // Kurallar KODLARINI taşır: bir kuponun birden çok kapısı olur ve motor girilenle hepsini
  // karşılaştırır. Tek turda okunur — kural başına sorgu N+1 olurdu.
  const codesByDiscount = await new DiscountCodeService(db).listByDiscounts(pool.map((row) => row.id));
  const usage = await discounts.usageCounts(pool.map((row) => row.id));
  const customerDiscountPercent = await customerRate(db, input.customerId);

  const ctx = {
    customerId: input.customerId,
    customerDiscountPercent,
    isFirstOrder: await isFirstOrder(db, input.customerId),
    enteredCouponCode: code || null,
    now,
  };
  const rules = pool.map((row) => toRule(row, codesByDiscount.get(row.id) ?? [], usage.get(row.id), input.customerId));
  const winner = applyBestDiscount(input.lines, rules, ctx);

  if (!code) return winner ? automatic(winner, pool, customerDiscountPercent) : { status: 'none' };

  // Kod girildi: önce kuponun kendisi teşhis edilir.
  const rejected = (reason: CouponFailure): CartDiscount => ({
    status: 'rejected',
    reason,
    code,
    // Kupon tutmasa da sepette bir indirim olabilir; müşteri onu kaybetmez.
    appliedInsteadCents: winner?.amountCents ?? 0,
    // Kazanan indirimin KİMLİĞİ de taşınır: kupon reddedildi diye sepetteki indirim adsız kalmaz.
    appliedInstead: winner
      ? { reason: reasonOf(winner, pool, customerDiscountPercent), label: publicLabelOf(pool.find((row) => row.id === winner.discountId)) }
      : null,
    // Paylar ve indirim kimliği de taşınır — yoksa tutar yazılabilir ama sipariş yazılamaz
    // (`order_item.line_discount_amount` toplamı başlıkla eşleşmek ZORUNDA, kısıt veritabanında).
    appliedInsteadShares: winner?.lineShares ?? [],
    appliedInsteadId: winner?.discountId ?? null,
  });

  // Kupon olmayan bir kuralın kimliğiyle indirim alınamaz: kampanyanın kodu yoktur.
  if (!coupon || !hit || coupon.trigger !== 'coupon') return rejected('unknown_code');

  const rule = toRule(coupon, codesByDiscount.get(coupon.id) ?? [], usage.get(coupon.id), input.customerId);
  const eligibility = checkCouponEligibility(rule, ctx, basketOf(input.lines), now);
  // Kişisel kupon başkasının elinde: varlığını doğrulamak, kodu paylaşmaya davet olurdu.
  if (!eligibility.ok) return rejected(eligibility.reason === 'not_yours' ? 'unknown_code' : eligibility.reason);

  if (winner?.discountId !== coupon.id) return rejected('outranked');

  return {
    status: 'applied',
    source: 'coupon',
    // Kodun KURALDAKİ yazılışı taşınır, müşterinin yazdığı değil ("bienvenue" → "BIENVENUE").
    code: hit.code,
    // Hangi KAPIDAN girildiği kullanım kaydına düşer: kota tek ama "hangi dil karşılık buldu"
    // sorusu ancak bu izle yanıtlanır.
    codeId: hit.codeId,
    amountCents: winner.amountCents,
    lineShares: winner.lineShares,
    discountId: winner.discountId,
    label: publicLabelOf(coupon),
  };
}

function automatic(winner: AppliedDiscount, pool: readonly Discount[], customerPercent: number | null): CartDiscount {
  return {
    status: 'automatic',
    reason: reasonOf(winner, pool, customerPercent),
    amountCents: winner.amountCents,
    lineShares: winner.lineShares,
    discountId: winner.discountId,
    label: publicLabelOf(pool.find((row) => row.id === winner.discountId)),
  };
}

/**
 * Kampanyanın MÜŞTERİYE görünen adı. İki durumda `null` döner ve yüzey sebebe düşer: kural
 * bulunamadıysa (müşterinin genel oranı — ortada kampanya yoktur) ya da operatör adı yazmadıysa.
 *
 * Boş dilleri olan bir nesne (`{tr:''}`) form artığıdır, ad değildir: hiç yazılmamış gibi sayılır —
 * yoksa yüzey boş bir tire basardı ("İndirim — ").
 */
function publicLabelOf(row: Discount | null | undefined): LocalizedText | null {
  const label = row?.publicLabel;
  if (!label) return null;
  return label.tr?.trim() || label.fr?.trim() || label.de?.trim() ? label : null;
}

/**
 * Kazananın SEBEBİ — motorun `kind`ından türer, ayrıca teşhis edilmez. Sebep ile karar aynı yerden
 * çıkmazsa bir gün ekran "size özel" derken sepete kampanya inmiş olur.
 *
 * Oran yalnız bütün sepete inen yüzde indirimlerde taşınır (`DiscountReason`): kategori/koleksiyon
 * kapsamlı ya da sabit tutarlı kampanyanın "yüzdesi" sepetin tamamı için doğru değildir.
 */
function reasonOf(winner: AppliedDiscount, pool: readonly Discount[], customerPercent: number | null): DiscountReason {
  if (winner.kind === 'customer_rate') return { kind: 'customer_rate', percent: customerPercent ?? 0 };
  const rule = pool.find((row) => row.id === winner.discountId);
  const wholeBasket = rule?.scope === 'cart' && rule.type === 'percent';
  return { kind: 'campaign', percent: wholeBasket ? rule.value : null };
}

/**
 * Matrah — muafiyetler motorun kuralıdır ve burada TEKRARLANIR, çünkü teşhis "asgari sepet tuttu
 * mu" sorusunu motor karar vermeden önce sormak zorundadır. Yüklem tek satırdır ve motorunkiyle
 * birebir aynı: paket ve teklif satırı matrahı büyütmez (DOMAIN §5/§13).
 */
function basketOf(lines: readonly DiscountableLine[]): number {
  return lines.reduce((sum, line) => (line.bundleId || line.offerStockId ? sum : sum + line.unitPriceCents * line.qty), 0);
}

/** DB satırı → motorun sözleşmesi. Kullanım sayıları kayıttan türer, sayaç kolonundan değil. */
function toRule(
  row: Discount,
  codes: readonly DiscountCode[],
  usage: DiscountUsage | undefined,
  customerId?: string | null,
): DiscountRule {
  return {
    id: row.id,
    trigger: row.trigger,
    // Kuralın tüm kapıları: girilen kod herhangi biriyle eşleşirse kupon tutar (hepsi aynı kota).
    codes: codes.map((c) => c.code),
    type: row.type,
    // Saklanan değer EURO, motor KURUŞ bekler (STACK §8) — çeviri uygulama katmanında, tek yerde.
    value: row.type === 'percent' ? row.value : Math.round(row.value * 100),
    scope: row.scope,
    categoryId: row.categoryId,
    collectionId: row.collectionId,
    minBasketCents: row.minBasket == null ? null : Math.round(row.minBasket * 100),
    firstOrderOnly: row.firstOrderOnly,
    validFrom: row.validFrom,
    validTo: row.validTo,
    customerId: row.customerId,
    isActive: row.isActive,
    maxUses: row.maxUses,
    usedCount: usage?.total ?? 0,
    perCustomerLimit: row.perCustomerLimit,
    usedByCustomerCount: customerId ? (usage?.byCustomer.get(customerId) ?? 0) : 0,
  };
}

/** Müşterinin genel indirim oranı — o da bir indirim adayıdır, fiyat değil (DOMAIN §5). */
async function customerRate(db: Db, customerId?: string | null): Promise<number | null> {
  if (!customerId) return null;
  return (await new UserProfileService(db).getById(customerId))?.discountPercent ?? null;
}

/**
 * İlk sipariş mi — "yalnız ilk siparişe" kuponunun ölçütü. Misafirde **true**: hesabı olmayan
 * müşterinin geçmişi de yoktur; kuponu peşinen reddetmek yeni müşteriyi kapıda çevirmek olurdu.
 * Sipariş oluşurken ölçüt yeniden bakılır (kupon kullanımı orada yazılır).
 */
async function isFirstOrder(db: Db, customerId?: string | null): Promise<boolean> {
  if (!customerId) return true;
  // Servis üzerinden (denetim A4): ham `db.from('order')` sayımı `BaseDbService.count` dururken
  // yazılmıştı ve `{data,error}` funnel'ının dışında kalıyordu.
  return (await new OrderService(db).countForCustomer(customerId)) === 0;
}
