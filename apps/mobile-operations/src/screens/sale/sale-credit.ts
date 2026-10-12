import type { StaffCustomerOption } from '@lezzet/types';

import { money } from '@/lib/operations/money';
import { fillCopy } from '@/screens/operations/copy';
import { staffOrderCopy } from '@/screens/staff-order/copy';
import { saleCopy } from './copy';

/*
  Sepetteki vadeli seçeneği: müşterinin vade özetinden okunur ve yalnız göstergedir, kesin kapı satış yazılırken sunucudadır. Kapalı
  vadelinin sebebi seçeneğin yerinde yazar; sipariş girişinin cümleleriyle aynıdır ki aynı müşteri iki ekranda iki türlü anlatılmasın.
*/

export type SaleCredit = { open: true; text: string } | { open: false; text: string };

/** `null` = anonim satış, vadeli sorusu yoktur. */
export function saleCreditOf(customer: StaffCustomerOption | null, totalCents: number): SaleCredit | null {
  if (customer === null) return null;
  const pay = staffOrderCopy.page.pay;
  if (customer.b2bPending) return { open: false, text: pay.pending };
  if (customer.channel !== 'b2b') return { open: false, text: saleCopy.credit.none };
  if (customer.credit === null) return { open: false, text: pay.notEnabled };
  if (customer.credit.overdue) return { open: false, text: pay.overdue };
  if (customer.credit.remainingCents < totalCents) {
    return { open: false, text: fillCopy(pay.limit, { rest: money(customer.credit.remainingCents), total: money(totalCents) }) };
  }
  return { open: true, text: fillCopy(saleCopy.credit.open, { rest: money(customer.credit.remainingCents - totalCents) }) };
}
