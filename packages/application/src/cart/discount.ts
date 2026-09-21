import { DiscountCodeService, DiscountService, OrderService, type Db, type DiscountUsage } from '@lezzet/database';
import {
  applyBestDiscount,
  checkCouponEligibility,
  findReachableDiscount,
  isDiscountable,
  type AppliedDiscount,
  type DiscountRule,
  type DiscountableLine,
} from '@lezzet/domain-core';
import type { Discount, DiscountCode, LocalizedText } from '@lezzet/types';
import type { CartDiscount, CartReachableDiscount, CartDiscountResult, CouponFailure, DiscountReason } from './cart-types';

/**
 * Sepette indirim çözümü (DOMAIN §5): kuralları servis getirir, kararı `applyBestDiscount` verir, burası birleştirir.
 * Tek-en-büyük kuralı, muafiyetler ve pay dağıtımı motordadır; ret sebebi `checkCouponEligibility`den türer.
 */

export interface CartDiscountInput {
  lines: readonly DiscountableLine[];
  customerId?: string | null;
  /** Müşterinin girdiği kod; boşsa yalnız otomatik adaylar değerlendirilir. */
  couponCode?: string | null;
  now?: Date;
}

/**
 * Sepetin indirimi: kupon yoksa otomatik adaylar, varsa önce kuponun kendisi teşhis edilir. Geçerli kupon kazanamazsa
 * `outranked` döner ve kazanan indirim uygulanır.
 */
export async function resolveCartDiscount(db: Db, input: CartDiscountInput): Promise<CartDiscountResult> {
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

  const ctx = {
    customerId: input.customerId,
    isFirstOrder: await isFirstOrder(db, input.customerId),
    enteredCouponCode: code || null,
    now,
  };
  const rules = pool.map((row) => toRule(row, codesByDiscount.get(row.id) ?? [], usage.get(row.id), input.customerId));
  const winner = applyBestDiscount(input.lines, rules, ctx);

  /* Elinin altındaki indirim kazanandan bağımsız hesaplanır ve kupon yolundan da geçer; eklenen tek şey müşteriye görünen ad. */
  const reach = findReachableDiscount(input.lines, rules, ctx);
  const reachable: CartReachableDiscount | null = reach
    ? {
        missingCents: reach.missingCents,
        minBasketCents: reach.minBasketCents,
        projectedCents: reach.projectedCents,
        label: publicLabelOf(pool.find((row) => row.id === reach.discountId)),
      }
    : null;
    /* Kurallar ve bağlam kararla BİRLİKTE döner — istemci aynı motoru çalıştırabilsin diye (künye:
     `CartDiscountResult.rules`). Burada süzülmez: neyin dışarı çıkacağına sözleşme karar verir. */
  const out = (discount: CartDiscount): CartDiscountResult => ({
    discount,
    reachable,
    rules,
    context: { isFirstOrder: ctx.isFirstOrder },
  });

  if (!code) return out(winner ? automatic(winner, pool) : { status: 'none' });

  // Kod girildi: önce kuponun kendisi teşhis edilir.
  const rejected = (reason: CouponFailure): CartDiscount => ({
    status: 'rejected',
    reason,
    code,
    // Kupon tutmasa da sepette bir indirim olabilir; müşteri onu kaybetmez.
    appliedInsteadCents: winner?.amountCents ?? 0,
    // Kazanan indirimin KİMLİĞİ de taşınır: kupon reddedildi diye sepetteki indirim adsız kalmaz.
    appliedInstead: winner
      ? { reason: reasonOf(winner, pool), label: publicLabelOf(pool.find((row) => row.id === winner.discountId)) }
      : null,
    // Paylar ve indirim kimliği de taşınır — yoksa tutar yazılabilir ama sipariş yazılamaz
    // (`order_item.line_discount_amount` toplamı başlıkla eşleşmek ZORUNDA, kısıt veritabanında).
    appliedInsteadShares: winner?.lineShares ?? [],
    appliedInsteadId: winner?.discountId ?? null,
  });

  // Kupon olmayan bir kuralın kimliğiyle indirim alınamaz: kampanyanın kodu yoktur.
  if (!coupon || !hit || coupon.trigger !== 'coupon') return out(rejected('unknown_code'));

  const rule = toRule(coupon, codesByDiscount.get(coupon.id) ?? [], usage.get(coupon.id), input.customerId);
  const eligibility = checkCouponEligibility(rule, ctx, basketOf(input.lines), now);
  // Kişisel kupon başkasının elinde: varlığını doğrulamak, kodu paylaşmaya davet olurdu.
  if (!eligibility.ok) return out(rejected(eligibility.reason === 'not_yours' ? 'unknown_code' : eligibility.reason));

  if (winner?.discountId !== coupon.id) return out(rejected('outranked'));

  return out({
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
  });
}

function automatic(winner: AppliedDiscount, pool: readonly Discount[]): CartDiscount {
  return {
    status: 'automatic',
    reason: reasonOf(winner, pool),
    amountCents: winner.amountCents,
    lineShares: winner.lineShares,
    discountId: winner.discountId,
    label: publicLabelOf(pool.find((row) => row.id === winner.discountId)),
  };
}

/**
 * Kampanyanın müşteriye görünen adı; kural bulunamazsa ya da ad boşsa `null` ve yüzey sebebe düşer. Boş dilli nesne form artığıdır.
 */
function publicLabelOf(row: Discount | null | undefined): LocalizedText | null {
  const label = row?.publicLabel;
  if (!label) return null;
  return label.tr?.trim() || label.fr?.trim() || label.de?.trim() ? label : null;
}

/**
 * Kazananın sebebi motorun `kind`ından türer ki ekran ile karar ayrışmasın; oran yalnız bütün sepete inen yüzdede taşınır.
 */
function reasonOf(winner: AppliedDiscount, pool: readonly Discount[]): DiscountReason {
  const rule = pool.find((row) => row.id === winner.discountId);
  const wholeBasket = rule?.scope === 'cart' && rule.type === 'percent';
  return { kind: 'campaign', percent: wholeBasket ? rule.percent : null };
}

/** Matrah; teşhis "asgari sepet tuttu mu" sorusunu motordan önce sorar, muafiyet yüklemi motorunkidir (`isDiscountable`). */
function basketOf(lines: readonly DiscountableLine[]): number {
  return lines.reduce((sum, line) => (isDiscountable(line) ? sum + line.unitPriceCents * line.qty : sum), 0);
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
    // Servis cent döndürür, motor cent bekler (STACK §8).
    percent: row.percent,
    amountCents: row.amountCents,
    scope: row.scope,
    categoryId: row.categoryId,
    collectionId: row.collectionId,
    minBasketCents: row.minBasketCents,
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

/**
 * İlk sipariş mi; misafirde `true`, çünkü hesabı olmayanın geçmişi yoktur. Sipariş oluşurken ölçüt yeniden bakılır.
 */
async function isFirstOrder(db: Db, customerId?: string | null): Promise<boolean> {
  if (!customerId) return true;
  return (await new OrderService(db).countForCustomer(customerId)) === 0;
}
