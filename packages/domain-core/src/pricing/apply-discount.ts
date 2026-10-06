import type { CouponRejection, DiscountScope, DiscountTrigger, DiscountType } from '@lezzet/types';
import { distributeDiscount, percentOf } from '@lezzet/helper';

/**
 * İndirim motoru (DOMAIN §5): uygun adaylardan yalnız en büyüğü uygulanır, birleşmezler. Paket ve teklif kalemleri
 * kendi özel fiyatındadır, matraha girmez ve pay almaz; seçilen indirim kalemlere oransal dağıtılır (`distributeDiscount`).
 */

/** Sepet kalemi — motor için gereken asgari alanlar (DB karşılığı `OrderItem`/`Cart` satırı). */
export interface DiscountableLine {
  variantId: string;
  qty: number;
  unitPriceCents: number;
  categoryId?: string | null;
  collectionIds?: readonly string[];
  /** Dolu → paketten gelen kalem: indirime girmez. */
  bundleId?: string | null;
  /** Dolu → near-expiry teklif satırı: indirime girmez. */
  offerStockId?: string | null;
  /** Müşteriye özel fiyatlı kalem (`isCustomerPrice`): indirime girmez. */
  specialPrice?: boolean;
}

/** Kalem indirim matrahına girer mi; paket, teklif ve müşteriye özel fiyatlı kalem kendi fiyatındadır. */
export function isDiscountable(line: DiscountableLine): boolean {
  return !line.bundleId && !line.offerStockId && !line.specialPrice;
}

/** İndirim kuralı — DB karşılığı `Discount`; motor yalnız karar için gerekli alanları görür. */
export interface DiscountRule {
  id: string;
  trigger: DiscountTrigger;
  /**
   * Kuponun kodları: hepsi aynı kuralı ve aynı kotayı açar, yoksa çok dilli kampanya kotayı dil sayısıyla çarpardı.
   */
  codes?: readonly string[];
  type: DiscountType;
  /**
   * Değer iki alanda: tipine uyan dolu, öteki `null`, çünkü birimi komşu alana bağlı bir sayı para hesabında hata kaynağıdır.
   */
  percent?: number | null;
  /** Sabit indirim tutarı — **cent**. */
  amountCents?: number | null;
  scope: DiscountScope;
  categoryId?: string | null;
  collectionId?: string | null;
  minBasketCents?: number | null;
  firstOrderOnly?: boolean;
  validFrom?: string | null;
  validTo?: string | null;
  /** Kişisel kupon — yalnız bu müşteri kullanır. */
  customerId?: string | null;
  isActive?: boolean;
  /** Kullanım sınırları — sayaçları çağıran getirir (DB işi), motor yalnız karşılaştırır. */
  maxUses?: number | null;
  usedCount?: number | null;
  perCustomerLimit?: number | null;
  usedByCustomerCount?: number | null;
}

export interface DiscountContext {
  customerId?: string | null;
  isFirstOrder?: boolean;
  /** Müşterinin girdiği kupon kodu; girilmediyse kupon adayları elenir. */
  enteredCouponCode?: string | null;
  /** Değerlendirme anı (test edilebilirlik). */
  now?: Date;
}

export interface AppliedDiscount {
  kind: DiscountTrigger;
  discountId: string;
  amountCents: number;
  /** Kalem sırasına göre paylar — `Σ = amountCents`. Muaf kalemlere 0 düşer. */
  lineShares: number[];
}

/** Hiçbir aday uygun değilse indirim yoktur — `null` döner, sepet liste fiyatından kapanır. */
export function applyBestDiscount(
  lines: readonly DiscountableLine[],
  rules: readonly DiscountRule[],
  ctx: DiscountContext = {},
): AppliedDiscount | null {
  const now = ctx.now ?? new Date();
  const lineTotals = lines.map((l) => l.unitPriceCents * l.qty);

  const eligible = lines.map(isDiscountable);
  const basketCents = lineTotals.reduce((sum, total, i) => (eligible[i] ? sum + total : sum), 0);
  if (basketCents <= 0) return null;

  const candidates: AppliedDiscount[] = [];

  // Kupon ve otomatik kampanyalar — koşulları geçenler.
  for (const rule of rules) {
    if (!isApplicable(rule, ctx, now, basketCents)) continue;
    const inScope = lines.map((line, i) => (eligible[i] ?? false) && matchesScope(line, rule));
    const scopeBase = lineTotals.reduce((sum, total, i) => (inScope[i] ? sum + total : sum), 0);
    if (scopeBase <= 0) continue;
    // Tipine uyan alan boşsa kural DEĞERSİZDİR — 0 sayıp "sıfır indirim" uygulamak, bozuk bir kuralı
    // sağlıklı gibi okumak olurdu (CLAUDE.md §1). DB kısıtı bunu zaten engelliyor; motor yine de
    // kendi girdisine güvenmez, çünkü çağıran her zaman DB olmayabilir.
    const amount =
      rule.type === 'percent'
        ? rule.percent == null
          ? 0
          : percentOf(scopeBase, rule.percent)
        : rule.amountCents == null
          ? 0
          : Math.min(rule.amountCents, scopeBase);
    if (amount > 0) candidates.push(build(rule.trigger, rule.id, amount, inScope));
  }

  if (candidates.length === 0) return null;

  // Tek-en-büyük: eşitlikte ilk gelen kalır (müşteri oranı önce eklenir → kararlı sonuç).
  const best = candidates.reduce((a, b) => (b.amountCents > a.amountCents ? b : a));
  return best;

  /**
   * Pay dağıtımı, indirimin GERÇEKTEN indiği kalemler arasında yapılır: muaf kalem (paket/teklif)
   * ve kapsam dışı kalem 0 alır. Aksi halde kategori indirimi başka kategorinin kalemine yazılır
   * ve kısmi iade tutarı yanlış çıkar.
   */
  function build(
    kind: DiscountTrigger,
    discountId: string,
    amountCents: number,
    applicable: readonly boolean[],
  ): AppliedDiscount {
    const base = lineTotals.map((total, i) => (applicable[i] ? total : 0));
    return { kind, discountId, amountCents, lineShares: distributeDiscount(base, amountCents) };
  }
}

/**
 * Kuponun neden geçmediği; tanım `@lezzet/types`tan türer ki mobil sözleşmesiyle ayrışmasın.
 */
export type { CouponRejection };

export type CouponEligibility = { ok: true } | { ok: false; reason: CouponRejection };

/**
 * Kupon bu sepete uygulanabilir mi, değilse neden; motor da bunu çağırır ki ekranın sebebi kararla ayrışmasın.
 * Kod eşleşmesi burada sorulmaz, çağıran kuponu zaten koddan buldu.
 */
export function checkCouponEligibility(
  rule: DiscountRule,
  ctx: DiscountContext,
  basketCents: number,
  now: Date = new Date(),
): CouponEligibility {
  if (rule.isActive === false) return { ok: false, reason: 'inactive' };
  if (rule.validFrom && new Date(rule.validFrom) > now) return { ok: false, reason: 'not_started' };
  if (rule.validTo && new Date(rule.validTo) < now) return { ok: false, reason: 'expired' };
  if (rule.minBasketCents != null && basketCents < rule.minBasketCents) return { ok: false, reason: 'min_basket' };
  if (rule.firstOrderOnly && !ctx.isFirstOrder) return { ok: false, reason: 'first_order_only' };
  // Kişisel kupon başkasına geçmez.
  if (rule.customerId && rule.customerId !== ctx.customerId) return { ok: false, reason: 'not_yours' };
  if (rule.maxUses != null && (rule.usedCount ?? 0) >= rule.maxUses) return { ok: false, reason: 'used_up' };
  if (rule.perCustomerLimit != null && (rule.usedByCustomerCount ?? 0) >= rule.perCustomerLimit) {
    return { ok: false, reason: 'used_up' };
  }
  return { ok: true };
}

/** Kuralın koşulları sağlanıyor mu (kod + `checkCouponEligibility`'nin tamamı). */
function isApplicable(rule: DiscountRule, ctx: DiscountContext, now: Date, basketCents: number): boolean {
  // Kupon yalnız kodu girilirse; otomatik kampanya kod istemez.
  if (rule.trigger === 'coupon' && matchedCode(rule, ctx.enteredCouponCode) === null) return false;
  return checkCouponEligibility(rule, ctx, basketCents, now).ok;
}

/**
 * Girilen kodun kuraldaki yazılışı, harf ayrımsız eşleşir; eşleşme yoksa `null`.
 */
export function matchedCode(rule: DiscountRule, entered: string | null | undefined): string | null {
  const term = entered?.trim().toUpperCase();
  if (!term) return null;
  return (rule.codes ?? []).find((code) => code.trim().toUpperCase() === term) ?? null;
}

/** Kalem kuralın kapsamında mı — `cart` her uygun kalem, diğerleri süzülür. Matrah ve pay dağıtımı
 *  AYNI yüklemi kullanır; ikisi ayrışırsa indirim kapsam dışına sızar. */
function matchesScope(line: DiscountableLine, rule: DiscountRule): boolean {
  if (rule.scope === 'category') return line.categoryId === rule.categoryId;
  if (rule.scope === 'collection') return (line.collectionIds ?? []).includes(rule.collectionId ?? '');
  return true;
}

/**
 * Eşiği tutmadığı için kaçırılan ama sepeti büyüterek kazanılabilir otomatik kampanya; yalnız müşterinin hâlâ
 * değiştirebildiği hâl söylenir (kupon ve kapsamı boş kural dışarıda) ve bugünkü kazanandan fazlasını vermeyen duyurulmaz.
 */
export interface ReachableDiscount {
  discountId: string;
  /** Eşiğe kalan tutar (cent) — cümlenin "{n} daha ekleyin" parçası. */
  missingCents: number;
  /** Eşiğin kendisi (cent) — cümle "60 € üzeri sepette" diye de kurulabilsin. */
  minBasketCents: number;
  /** Eşiğe varıldığında inecek indirimin ALT SINIRI (cent). Kazanandan daima büyüktür. */
  projectedCents: number;
}

export function findReachableDiscount(
  lines: readonly DiscountableLine[],
  rules: readonly DiscountRule[],
  ctx: DiscountContext = {},
): ReachableDiscount | null {
  const now = ctx.now ?? new Date();
  const lineTotals = lines.map((l) => l.unitPriceCents * l.qty);
  const eligible = lines.map(isDiscountable);
  const basketCents = lineTotals.reduce((sum, total, i) => (eligible[i] ? sum + total : sum), 0);
  if (basketCents <= 0) return null;

  // Bugün gerçekten inen tutar — kestirim buna karşı sınanacak. Aday yoksa 0.
  const wonCents = applyBestDiscount(lines, rules, ctx)?.amountCents ?? 0;

  let best: ReachableDiscount | null = null;
  for (const rule of rules) {
    if (rule.trigger !== 'automatic') continue;
    if (rule.minBasketCents == null || basketCents >= rule.minBasketCents) continue;
    // Eşik DIŞINDAKİ her koşul zaten sağlanıyor olmalı: eşiği doldurmak süresi dolmuş bir kampanyayı
    // geri getirmez. Kural eşikmiş gibi sınanır — eşik geçilmiş sayılıp geri kalanı sorulur.
    if (!checkCouponEligibility(rule, ctx, rule.minBasketCents, now).ok) continue;

    const inScope = lines.map((line, i) => (eligible[i] ?? false) && matchesScope(line, rule));
    const scopeBase = lineTotals.reduce((sum, total, i) => (inScope[i] ? sum + total : sum), 0);
    if (scopeBase <= 0) continue;

    // Sepet kapsamında matrah eşiğe kadar büyür; kapsamlı kuralda olduğu yerde kalır.
    const projectedBase = rule.scope === 'cart' ? rule.minBasketCents : scopeBase;
    const projectedCents =
      rule.type === 'percent'
        ? rule.percent == null
          ? 0
          : percentOf(projectedBase, rule.percent)
        : rule.amountCents == null
          ? 0
          : Math.min(rule.amountCents, projectedBase);
    if (projectedCents <= wonCents) continue;

    const candidate: ReachableDiscount = {
      discountId: rule.id,
      missingCents: rule.minBasketCents - basketCents,
      minBasketCents: rule.minBasketCents,
      projectedCents,
    };
    // EN YAKIN olan kazanır, en büyük olan değil: müşteriye söylenecek tek cümle, elinin gerçekten
    // uzandığı olmalı. Eşitlikte daha çok indiren öne geçer.
    if (
      best === null ||
      candidate.missingCents < best.missingCents ||
      (candidate.missingCents === best.missingCents && candidate.projectedCents > best.projectedCents)
    ) {
      best = candidate;
    }
  }
  return best;
}
