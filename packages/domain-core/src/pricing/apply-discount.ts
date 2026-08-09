import type { CouponRejection, DiscountScope, DiscountTrigger, DiscountType } from '@lezzet/types';
import { distributeDiscount, percentOf } from '@lezzet/helper';

/**
 * İndirim motoru (03.4) — "bu sepete hangi indirim, ne kadar uygulanır" (DOMAIN §5).
 *
 * **Tek-en-büyük kuralı:** birden çok indirim uygun olsa bile yalnız **en büyüğü** uygulanır,
 * birleşmezler. Havuzda üç tür aday vardır: kupon (müşteri kod girer), otomatik kampanya (kod yok)
 * ve **müşterinin genel indirim oranı** (`Customer.discount_percent` — 27.07 kararı: o da bir
 * indirimdir, fiyat değil).
 *
 * **Matrah muafiyetleri** (DOMAIN §5/§13): paket kalemleri (`bundleId` dolu) ve partiye bağlı
 * teklif satırları (`offerStockId` dolu) indirime GİRMEZ — ikisi de kendi özel fiyatındadır.
 * Muaf kalem hem matrahı büyütmez hem de kendisine pay düşmez.
 *
 * Dağıtım: seçilen indirim kalemlere **oransal** paylaştırılır (`distributeDiscount`), artan kuruş
 * en büyük kaleme gider; `Σ pay = indirim` her zaman tutar (STACK §8).
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
}

/** İndirim kuralı — DB karşılığı `Discount`; motor yalnız karar için gerekli alanları görür. */
export interface DiscountRule {
  id: string;
  trigger: DiscountTrigger;
  /**
   * `trigger=coupon` ise kuralın KAPILARI — bir kuponun birden çok kodu olur (dil başına bir tane
   * gibi) ve **hepsi aynı kuralı, aynı kotayı açar**. Girilen kod herhangi biriyle eşleşirse kupon
   * tutar; hangisiyle eşleştiği kararı değiştirmez, yalnız kullanım kaydına iz olarak düşer.
   *
   * Tek kodlu bir alan olsaydı çok dilli kampanya üç ayrı kural açmak zorunda kalır ve "toplam 100
   * kullanım" sınırı sessizce 300 olurdu.
   */
  codes?: readonly string[];
  type: DiscountType;
  /**
   * Değer İKİ AYRI ALANDA (02.9): tipine uyan dolu, öteki `null`. Tek `value` alanı vardı ve birimi
   * `type`'a bağlıydı — okuyanın hangi birimde olduğunu ancak komşu alana bakarak anlayabildiği bir
   * sayı, para hesabında hata kaynağıdır (STACK §8). DB kısıtı da bu ayrımı tutuyor.
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
  /** Müşterinin genel indirim oranı — havuza aday olarak girer (yüzde). */
  customerDiscountPercent?: number | null;
  isFirstOrder?: boolean;
  /** Müşterinin girdiği kupon kodu; girilmediyse kupon adayları elenir. */
  enteredCouponCode?: string | null;
  /** Değerlendirme anı (test edilebilirlik). */
  now?: Date;
}

/** Kazanan adayın türü — kural tetikleyicileri + müşterinin genel oranı (o bir `Discount` satırı değildir). */
export type DiscountSourceKind = DiscountTrigger | 'customer_rate';

export interface AppliedDiscount {
  kind: DiscountSourceKind;
  /** Kural kimliği; müşteri oranında `null` (DB'de karşılığı yok, `Customer` alanıdır). */
  discountId: string | null;
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

  // Muaf kalemler matrahtan düşer: paket ve teklif satırı kendi özel fiyatındadır.
  const eligible = lines.map((l) => !l.bundleId && !l.offerStockId);
  const basketCents = lineTotals.reduce((sum, total, i) => (eligible[i] ? sum + total : sum), 0);
  if (basketCents <= 0) return null;

  const candidates: AppliedDiscount[] = [];

  // 1) Müşterinin genel oranı — koşulsuz aday (müşteriye zaten tanınmış).
  if (ctx.customerDiscountPercent && ctx.customerDiscountPercent > 0) {
    candidates.push(build('customer_rate', null, percentOf(basketCents, ctx.customerDiscountPercent), eligible));
  }

  // 2) Kupon ve otomatik kampanyalar — koşulları geçenler.
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
    kind: DiscountSourceKind,
    discountId: string | null,
    amountCents: number,
    applicable: readonly boolean[],
  ): AppliedDiscount {
    const base = lineTotals.map((total, i) => (applicable[i] ? total : 0));
    return { kind, discountId, amountCents, lineShares: distributeDiscount(base, amountCents) };
  }
}

/**
 * Kuponun neden geçmediği — künyeleri ve `not_yours` sızdırma kuralı tanımın yanında
 * (`CouponRejectionEnum`, `@lezzet/types`).
 *
 * **Tanım burada DEĞİL, türetiliyor** (`CartLineRoute`un aynı yolu): sebep mobil sözleşmesinde zod
 * olarak da ifade ediliyor ve iki ayrı tanım bir gün ayrışırdı. Motorun dış API'si değişmiyor.
 */
export type { CouponRejection };

export type CouponEligibility = { ok: true } | { ok: false; reason: CouponRejection };

/**
 * Kupon bu sepete uygulanabilir mi ve değilse **neden**.
 *
 * Motorun kendi yüklemiyle AYNI kaynaktan gelir (`applyBestDiscount` bunu çağırır): ret sebepleri
 * ayrı yazılsaydı bir gün ekranın söylediği sebeple motorun kararı ayrışırdı — "geçerli" diyen
 * uyarı, indirimsiz kapanan sepet.
 *
 * Kod eşleşmesi burada SORULMAZ: çağıran kuponu zaten koddan buldu. Bu fonksiyon "kod doğru mu"
 * değil, "doğru kod bu sepete yarıyor mu" sorusunu cevaplar.
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
 * Girilen kodun kuralın hangi kapısına denk düştüğü — eşleşme yoksa `null`.
 *
 * Karşılaştırma HARF AYRIMSIZ (DB'nin tekillik indeksi de öyle): müşteri "bayram10" yazdığında
 * "BAYRAM10" tutmalı. Dönen değer kodun kuraldaki YAZILIŞIDIR, müşterinin yazdığı değil — kullanım
 * kaydına ve rapora giden budur.
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
