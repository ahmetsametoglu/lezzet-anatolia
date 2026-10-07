import type { AccountType, MoneyMovement, PaymentMethod } from '@lezzet/types';
import { refundMethodOf } from './refund-method';

/**
 * İadenin hangi paradan döneceği. Para birden çok yoldan geldiyse iade en son ödemeden geriye doğru dağılır ve her parça kendi
 * yolundan döner: kart parası geldiği kart ödemesinin üzerinden, nakit ve havale geldiği hesaptan. Kart ödemesi künyesiyle ayrı
 * kaynaktır, çünkü sağlayıcı bir ödemeden o ödemenin tutarından fazlasını iade etmez.
 */

/** İadenin dönebileceği para. */
export interface RefundSource {
  accountId: string;
  accountType: AccountType;
  /** Kart ödemesinin künyesi; künyesiz sağlayıcı parasında ve nakit ya da bankada `null`. */
  providerRef: string | null;
  /** Kaynağa giren son paranın yöntemi; iadenin yöntemi bundan ve hesabın türünden türer. */
  paidWith: PaymentMethod | null;
  /** Kaynaktan hâlâ iade edilebilecek tutar (**cent**). */
  availableCents: number;
  /** Kaynağa son paranın girdiği an; sıralama bundandır. */
  lastPaidAt: string;
}

export interface RefundLeg {
  accountId: string;
  accountType: AccountType;
  providerRef: string | null;
  method: PaymentMethod | null;
  amountCents: number;
}

export interface RefundPlan {
  legs: RefundLeg[];
  /** Kaynakların karşılayamadığı kalan; sıfır değilse iade eksik kalır ve borç açıkta görünür. */
  uncoveredCents: number;
}

type OrderMoney = Pick<MoneyMovement, 'accountId' | 'type' | 'amountCents' | 'paymentMethod' | 'meta' | 'createdAt'>;

const refOf = (movement: OrderMoney): string | null =>
  typeof movement.meta?.['providerRef'] === 'string' ? (movement.meta['providerRef'] as string) : null;

/** Zaman damgalarının sırası; milisaniyede eşitse veritabanının mikro saniyeli dizesi ayırır. */
const byTime = (a: string, b: string): number => Date.parse(a) - Date.parse(b) || a.localeCompare(b);

const newestFirst = (a: RefundSource, b: RefundSource): number =>
  byTime(b.lastPaidAt, a.lastPaidAt) || `${a.accountId}:${a.providerRef}`.localeCompare(`${b.accountId}:${b.providerRef}`);

/**
 * Siparişin iade edilebilir paraları. Künyeli iade kendi kart ödemesinden düşer; künyesiz iade hesabındaki paradan en yeniden başlayarak
 * düşer. Parası hiç girmemiş hesaptan yapılmış iade (kartla alınıp nakit iade edilmiş para) hiçbir kaynağı azaltmaz; iade edilecek tutarı
 * zaten sipariş türetimi küçültür.
 */
export function refundSourcesOf(movements: readonly OrderMoney[], accountTypes: ReadonlyMap<string, AccountType>): RefundSource[] {
  const sources = new Map<string, RefundSource>();
  const keyOf = (movement: OrderMoney): string | null => {
    const type = accountTypes.get(movement.accountId);
    if (!type) return null;
    const ref = type === 'provider' ? refOf(movement) : null;
    return ref ? `ref:${ref}` : `account:${movement.accountId}`;
  };

  for (const payment of movements.filter((movement) => movement.type === 'order_payment')) {
    const key = keyOf(payment);
    if (!key) continue;
    const known = sources.get(key);
    const latest =
      known && byTime(known.lastPaidAt, payment.createdAt) > 0 ? known : { paidWith: payment.paymentMethod, lastPaidAt: payment.createdAt };
    sources.set(key, {
      accountId: payment.accountId,
      accountType: accountTypes.get(payment.accountId)!,
      providerRef: key.startsWith('ref:') ? refOf(payment) : null,
      paidWith: latest.paidWith,
      availableCents: (known?.availableCents ?? 0) + payment.amountCents,
      lastPaidAt: latest.lastPaidAt,
    });
  }

  const unattributed = new Map<string, number>();
  for (const refund of movements.filter((movement) => movement.type === 'order_refund')) {
    const key = keyOf(refund);
    const source = key ? sources.get(key) : undefined;
    if (source) source.availableCents -= refund.amountCents;
    else unattributed.set(refund.accountId, (unattributed.get(refund.accountId) ?? 0) + refund.amountCents);
  }
  for (const [accountId, amountCents] of unattributed) {
    let left = amountCents;
    for (const source of [...sources.values()].filter((candidate) => candidate.accountId === accountId).sort(newestFirst)) {
      const taken = Math.min(left, Math.max(source.availableCents, 0));
      source.availableCents -= taken;
      left -= taken;
    }
  }

  return [...sources.values()].filter((source) => source.availableCents > 0).sort(newestFirst);
}

/**
 * İade planı. Yol verilmezse iade kaynaklara en son ödemeden geriye doğru dağılır. Operatör kart yolunu seçtiyse yalnız o hesabın kart
 * ödemelerine dağılır; nakit ya da havale yolunu seçtiyse tamamı o hesaptan çıkar, çünkü kartla alınmış parayı nakit vermek meşrudur.
 */
export function planRefund(input: {
  dueCents: number;
  sources: readonly RefundSource[];
  route: { accountId: string; accountType: AccountType } | null;
}): RefundPlan {
  if (input.dueCents <= 0) return { legs: [], uncoveredCents: 0 };
  const { route } = input;
  if (route && route.accountType !== 'provider') {
    return {
      legs: [{ ...route, providerRef: null, method: refundMethodOf(route.accountType, null), amountCents: input.dueCents }],
      uncoveredCents: 0,
    };
  }

  const candidates = route ? input.sources.filter((source) => source.accountId === route.accountId) : input.sources;
  const legs: RefundLeg[] = [];
  let left = input.dueCents;
  for (const source of [...candidates].sort(newestFirst)) {
    if (left === 0) break;
    const amountCents = Math.min(left, source.availableCents);
    if (amountCents <= 0) continue;
    legs.push({
      accountId: source.accountId,
      accountType: source.accountType,
      providerRef: source.providerRef,
      method: refundMethodOf(source.accountType, source.paidWith),
      amountCents,
    });
    left -= amountCents;
  }
  return { legs, uncoveredCents: left };
}
