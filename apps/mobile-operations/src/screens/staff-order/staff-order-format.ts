import type {
  PaymentMethod,
  StaffCustomerOption,
  StaffDeliveryContext,
  StaffOrderRequest,
  StaffPaymentOptions,
  StaffVariantRow,
} from '@lezzet/types';

import { money } from '@/lib/operations/money';
import { dateLabelOf } from '@/lib/operations/stamp';
import { fillCopy } from '@/screens/operations/copy';
import { staffOrderCopy as t } from './copy';

/*
  Personel sipariş girişinin ekran kararları; saf ve testli. Fiyat, gün, depo ve ödeme kararını sunucu verir, burada yalnız o kararların
  ekrandaki cümlesi ve gönderilecek isteğin kurulması durur.
*/

/**
 * Formdaki kalem; seçici satırından doğar, liste fiyatı kesindir çünkü satışa kapalı satır kaleme dönmez. Adedi sıfıra inen kalem
 * yerinde kalır ("çıkarıldı") ve gönderilmez; `availableQty` stok reddinden ve depo değişince tazelenir.
 */
export type OrderLine = Omit<StaffVariantRow, 'listPriceCents'> & {
  listPriceCents: number;
  qty: number;
  /** Yöneticinin yazdığı birim fiyat; liste fiyatına eşitse pazarlık yoktur ve sunucuya fiyat gitmez. */
  unitPriceCents: number;
};

/** Vadeli bir ödeme yöntemi değil siparişin bayrağıdır; ekranda yöntemlerin yanında üçüncü seçenek olarak durur. */
export type PaymentChoice = 'cash' | 'card' | 'credit';

/** Seçici satırından kalem; müşteriye satışa kapalı boy (`listPriceCents === null`) kaleme dönüşmez. */
export function lineFromRow(row: StaffVariantRow, qty: number): OrderLine | null {
  if (row.listPriceCents === null) return null;
  return { ...row, listPriceCents: row.listPriceCents, qty, unitPriceCents: row.listPriceCents };
}

/** Ara toplamın tabanı fiyatın kanalından okunur: B2B fiyatı vergisizdir, onay bekleyen şirketinki dahil perakende fiyat KDV dahildir. */
export function subtotalBasisOf(customer: Pick<StaffCustomerOption, 'channel'>): string {
  return customer.channel === 'b2b' ? t.page.basis.b2b : t.page.basis.b2c;
}

export function activeLines(lines: readonly OrderLine[]): OrderLine[] {
  return lines.filter((line) => line.qty > 0);
}

/** Ekrandaki ara toplam, müşterinin kanal tabanında; kesin toplam (kargo, indirim, KDV) sipariş açılınca sunucudan gelir. */
export function subtotalCents(lines: readonly OrderLine[]): number {
  return activeLines(lines).reduce((sum, line) => sum + line.qty * line.unitPriceCents, 0);
}

export type LineIssue =
  { kind: 'removed' } | { kind: 'cold_chain' } | { kind: 'sold_out' } | { kind: 'over_stock'; available: number } | null;

/** Kalemin sorunu; sırası gönderimi engelleme önceliğidir. Bilinmeyen kalan (`null`) sorun sayılmaz, kesin kapı sunucudadır. */
export function lineIssueOf(line: OrderLine, shipping: boolean): LineIssue {
  if (line.qty === 0) return { kind: 'removed' };
  if (shipping && !line.shippable) return { kind: 'cold_chain' };
  if (line.availableQty === null) return null;
  if (line.availableQty === 0) return { kind: 'sold_out' };
  if (line.qty > line.availableQty) return { kind: 'over_stock', available: line.availableQty };
  return null;
}

/** Kalemin ikinci satırı; uyarı araya kutu olarak girmez, bu satırın yerine yazar. */
export function lineSubOf(line: OrderLine, issue: LineIssue): { text: string; tone: 'muted' | 'error' } {
  if (issue?.kind === 'cold_chain') return { text: t.page.coldChain, tone: 'error' };
  if (issue?.kind === 'sold_out') return { text: t.page.soldOut, tone: 'error' };
  if (issue?.kind === 'over_stock') return { text: fillCopy(t.page.overStock, { n: String(issue.available) }), tone: 'error' };
  const price = money(line.unitPriceCents);
  const text =
    line.availableQty === null
      ? fillCopy(t.page.lineSubNoStock, { qty: String(line.qty), price })
      : fillCopy(t.page.lineSub, { qty: String(line.qty), price, stock: String(line.availableQty) });
  return { text, tone: 'muted' };
}

const WEEKDAYS = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'] as const;

/** `2026-10-15` → `Per 15 Eki`; ay adı `dateLabelOf`tan kısalır, ikinci bir ay listesi tutulmaz. */
export function dayChipLabelOf(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  const label = dateLabelOf(isoDate);
  if (!match || label === null) return isoDate;
  const weekday = WEEKDAYS[new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))).getUTCDay()];
  const [day, month] = label.split(' ');
  return `${weekday ?? ''} ${day ?? ''} ${(month ?? '').slice(0, 3)}`.trim();
}

export type CustomerTone = 'credit' | 'warn' | 'muted';

/** Müşterinin rozeti; onaysız şirket B2B rozeti taşımaz, çünkü fiyatı perakendedir. */
export function customerBadgeOf(customer: StaffCustomerOption): { label: string; tone: 'ok' | 'warn' | 'mute' } {
  if (customer.b2bPending) return { label: t.customer.badgePending, tone: 'warn' };
  if (customer.channel === 'b2b') return { label: t.customer.badgeB2b, tone: 'ok' };
  return { label: t.customer.badgeB2c, tone: 'mute' };
}

/** Müşterinin vade satırı; sayfada kanal da yazılır, seçicide rozet onu zaten söyler. */
export function customerCreditLineOf(customer: StaffCustomerOption, place: 'page' | 'picker'): { text: string; tone: CustomerTone } {
  if (customer.b2bPending) return { text: t.customer.pending, tone: 'muted' };
  if (customer.channel !== 'b2b') {
    return { text: customer.type === 'company' ? t.customer.company : t.customer.individual, tone: 'muted' };
  }
  const page = place === 'page';
  if (customer.credit === null) return { text: page ? t.customer.noCreditPage : t.customer.noCredit, tone: 'muted' };
  if (customer.credit.overdue) return { text: page ? t.customer.overduePage : t.customer.overdue, tone: 'warn' };
  const values = { days: String(customer.credit.termDays), rest: money(customer.credit.remainingCents) };
  return { text: fillCopy(page ? t.customer.creditPage : t.customer.credit, values), tone: 'credit' };
}

export interface PaymentRow {
  key: PaymentChoice;
  label: string;
  sub: string;
  enabled: boolean;
  /** `credit` açık vadenin rengi, `warn` kapalı yöntemin sebebi, `muted` sıradaki adımı bekleyen satır. */
  tone: 'muted' | 'warn' | 'credit';
}

/**
 * Ödeme satırları; kapalı yöntem gizlenmez, sebebi kendi ikinci satırında yazar. Ön izleme sunucunun kararıdır (`StaffPaymentOptions`),
 * satırlar ancak kalem varken ve kalemler düzgünken açılır.
 */
export function paymentRowsOf(input: {
  payment: StaffPaymentOptions | null;
  customer: StaffCustomerOption | null;
  totalCents: number;
  hasLines: boolean;
  linesOk: boolean;
}): PaymentRow[] {
  const labels: Record<PaymentChoice, string> = { cash: t.page.pay.cash, card: t.page.pay.card, credit: t.page.pay.credit };
  const keys: PaymentChoice[] = ['cash', 'card', 'credit'];
  if (!input.hasLines || !input.linesOk || input.payment === null) {
    const sub = !input.hasLines ? t.page.after.products : !input.linesOk ? t.page.after.fix : t.page.pay.reading;
    return keys.map((key) => ({ key, label: labels[key], sub, enabled: false, tone: 'muted' }));
  }
  const payment = input.payment;
  const cod = (method: 'cash' | 'card', openSub: string): PaymentRow => {
    if (payment.methods.includes(method)) return { key: method, label: labels[method], sub: openSub, enabled: true, tone: 'muted' };
    const sub =
      payment.codBlockedReason === 'over_limit'
        ? fillCopy(t.page.pay.overLimit, { cap: money(payment.codMaxCents) })
        : payment.codBlockedReason === 'shipping'
          ? t.page.pay.shipping
          : t.page.pay.customerBlocked;
    return { key: method, label: labels[method], sub, enabled: false, tone: 'warn' };
  };
  const credit = input.customer?.credit ?? null;
  const creditRow: PaymentRow = payment.creditAvailable
    ? {
        key: 'credit',
        label: labels.credit,
        sub: fillCopy(t.page.pay.creditSub, {
          days: String(credit?.termDays ?? ''),
          rest: money(Math.max(0, (credit?.remainingCents ?? 0) - input.totalCents)),
        }),
        enabled: true,
        tone: 'credit',
      }
    : {
        key: 'credit',
        label: labels.credit,
        sub:
          payment.creditBlockedReason === 'overdue'
            ? t.page.pay.overdue
            : payment.creditBlockedReason === 'limit_exceeded'
              ? fillCopy(t.page.pay.limit, { rest: money(credit?.remainingCents ?? 0), total: money(input.totalCents) })
              : input.customer?.b2bPending
                ? t.page.pay.pending
                : t.page.pay.notEnabled,
        enabled: false,
        tone: payment.creditBlockedReason === 'not_enabled' ? 'muted' : 'warn',
      };
  return [cod('cash', t.page.pay.cashSub), cod('card', t.page.pay.cardSub), creditRow];
}

export interface FooterState {
  customer: StaffCustomerOption | null;
  addressId: string | null;
  context: StaffDeliveryContext | null;
  /** Ön izleme son kalemlerle mi; değilse ödeme kararı bayattır ve düğme beklemelidir. */
  contextFresh: boolean;
  deliveryDate: string | null;
  lines: readonly OrderLine[];
  payment: PaymentChoice | null;
  paymentRows: readonly PaymentRow[];
}

/** Alttaki düğmenin üstündeki cümle: ilk eksik, sırasıyla. Düğme yalnız `ready` iken açılır. */
export function footerReasonOf(state: FooterState): { text: string; ready: boolean } {
  const no = (text: string) => ({ text, ready: false });
  if (state.customer === null) return no(t.page.why.customer);
  if (state.addressId === null || state.context === null) return no(t.page.why.address);
  const delivery = state.context.delivery;
  if (delivery.unresolvedReason !== null || delivery.warehouseId === null) return no(t.page.why.unresolved);
  const route = delivery.deliveryType === 'route';
  if (route && state.deliveryDate === null) return no(t.page.why.date);
  if (activeLines(state.lines).length === 0) return no(t.page.why.lines);
  for (const line of state.lines) {
    const issue = lineIssueOf(line, !route);
    if (issue?.kind === 'cold_chain') return no(fillCopy(t.page.why.coldChain, { name: line.title }));
    if (issue?.kind === 'sold_out') return no(fillCopy(t.page.why.stock, { name: line.title, n: '0' }));
    if (issue?.kind === 'over_stock') return no(fillCopy(t.page.why.stock, { name: line.title, n: String(issue.available) }));
  }
  if (!state.contextFresh) return no(t.page.why.reading);
  if (!state.paymentRows.some((row) => row.enabled)) return no(t.page.why.noMethod);
  const chosen = state.paymentRows.find((row) => row.key === state.payment);
  if (chosen === undefined || !chosen.enabled) return no(t.page.why.payment);
  const method = t.page.methodShort[chosen.key];
  return {
    ready: true,
    text: route
      ? fillCopy(t.page.why.ready, { day: dayChipLabelOf(state.deliveryDate ?? ''), warehouse: delivery.warehouseName ?? '', method })
      : fillCopy(t.page.why.readyShipping, { method }),
  };
}

const METHOD_OF: Record<PaymentChoice, PaymentMethod> = { cash: 'cash', card: 'card', credit: 'bank_transfer' };

/**
 * Gönderilecek istek: sıfıra inen kalem gitmez, fiyat yalnız pazarlık edilen kalemde gider. Vadeli havale yöntemi ile siparişin
 * vadeli bayrağıdır; ikisi ayrı gönderilir, çünkü sunucu ikisini birlikte denetler.
 */
export function orderRequestOf(input: {
  customerId: string;
  addressId: string;
  deliveryType: 'route' | 'shipping';
  deliveryDate: string | null;
  lines: readonly OrderLine[];
  payment: PaymentChoice;
  idempotencyKey: string;
}): StaffOrderRequest {
  return {
    customerId: input.customerId,
    addressId: input.addressId,
    deliveryDate: input.deliveryType === 'route' ? input.deliveryDate : null,
    paymentMethod: METHOD_OF[input.payment],
    onAccount: input.payment === 'credit',
    lines: activeLines(input.lines).map((line) => ({
      variantId: line.variantId,
      qty: line.qty,
      ...(line.unitPriceCents === line.listPriceCents ? {} : { unitPriceCents: line.unitPriceCents }),
    })),
    idempotencyKey: input.idempotencyKey,
  };
}
