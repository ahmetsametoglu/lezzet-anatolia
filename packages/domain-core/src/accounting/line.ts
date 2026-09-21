import { addVat, removeVat } from '@lezzet/helper';
import type { Channel, OrderItem } from '@lezzet/types';
import { vatBaseOf } from '../pricing/resolve-price';

/**
 * Sipariş kaleminin para hesabı, muhasebe export'u ile kârlılığın ortak zemini. Tutar kanalın kendi tabanındadır
 * (`vatBaseOf`) ve kâr her zaman HT üstünden hesaplanır, çünkü KDV ciro değildir.
 */

export type AccountingLine = Pick<OrderItem, 'qty' | 'fulfilledQty' | 'unitPriceCents' | 'lineDiscountAmountCents' | 'vatRate'>;

/**
 * `lineAmountCents`in gerçekten istediği alanlar; KDV oranı yok, çünkü kurye sözleşmesi onu taşımaz.
 */
export type LineAmountInput = Pick<OrderItem, 'qty' | 'fulfilledQty' | 'unitPriceCents' | 'lineDiscountAmountCents'>;

/**
 * Kalemin faturalanacak tutarı **kanalın kendi tabanında** (cent) — **teslim edilen** miktar
 * üzerinden. Sipariş edilen değil: gitmeyen mal ne faturalanır ne ciro sayılır.
 */
export function lineAmountCents(item: LineAmountInput): number {
  const beforeDiscount = item.unitPriceCents * item.fulfilledQty;
  // İndirim payı eksik karşılanan kalemde oransal düşer, yoksa yarısı gitmiş kalem indirimin tamamını taşırdı.
  const discountShare = item.qty > 0 ? Math.round((item.lineDiscountAmountCents * item.fulfilledQty) / item.qty) : 0;
  return Math.max(0, beforeDiscount - discountShare);
}

/** Bir tutarın KDV kırılımı (cent). `net + vat === gross` her zaman tutar. */
export interface VatSplit {
  /** TTC — müşterinin ödediği. */
  grossCents: number;
  /** HT — KDV hariç, kârın ve beyanın tabanı. */
  netCents: number;
  vatCents: number;
}

/**
 * Kanal tabanındaki tutarı TTC/HT/KDV'ye ayırır: b2c'de KDV içinden çıkar, b2b'de üstüne eklenir, tek yön B2B'de KDV'yi
 * iki kez düşürürdü. `zeroRated` AB içi ters yüklemedir, KDV yoktur.
 */
export function vatSplitOf(amountCents: number, channel: Channel, vatRate: number, zeroRated = false): VatSplit {
  if (zeroRated) return { grossCents: amountCents, netCents: amountCents, vatCents: 0 };

  if (vatBaseOf(channel) === 'ttc') {
    const net = removeVat(amountCents, vatRate);
    return { grossCents: amountCents, netCents: net, vatCents: amountCents - net };
  }

  const gross = addVat(amountCents, vatRate);
  return { grossCents: gross, netCents: amountCents, vatCents: gross - amountCents };
}

/** Kalemin KDV hariç (HT) tutarı (cent). */
export function lineNetCents(item: AccountingLine, channel: Channel, zeroRated = false): number {
  return vatSplitOf(lineAmountCents(item), channel, item.vatRate, zeroRated).netCents;
}
