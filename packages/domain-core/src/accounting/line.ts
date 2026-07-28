import { removeVat, toCents } from '@lezzet/helper';
import type { OrderItem } from '@lezzet/types';

/**
 * Sipariş kaleminin para hesabı — **muhasebe export'u (12.7) ile kârlılığın (12.6) ORTAK zemini.**
 * İki rapor aynı satırı iki ayrı formülle hesaplasaydı bir gün ayrışır ve hangisinin doğru olduğu
 * bilinemezdi.
 *
 * Fiyatlar B2C'de TTC, B2B'de HT tabanındadır (DOMAIN §5). Kâr **her zaman HT üstünden** hesaplanır:
 * KDV ciro değildir, devlet adına tahsil edilir.
 */

export type AccountingLine = Pick<OrderItem, 'qty' | 'fulfilledQty' | 'unitPrice' | 'lineDiscountAmount' | 'vatRate'>;

/**
 * Kalemin faturalanacak TTC tutarı (cent) — **teslim edilen** miktar üzerinden. Sipariş edilen değil:
 * gitmeyen mal ne faturalanır ne ciro sayılır.
 */
export function lineGrossCents(item: AccountingLine): number {
  const grossBeforeDiscount = toCents(item.unitPrice) * item.fulfilledQty;
  // İndirim payı tüm miktar için yazılmıştır; eksik karşılanan kalemde (07.8) oransal düşer —
  // yoksa yarısı gitmiş bir kalem indirimin tamamını taşır ve satır olduğundan ucuz görünürdü.
  const discountShare = item.qty > 0 ? Math.round((toCents(item.lineDiscountAmount) * item.fulfilledQty) / item.qty) : 0;
  return Math.max(0, grossBeforeDiscount - discountShare);
}

/**
 * Kalemin KDV hariç (HT) tutarı (cent). `zeroRated` = AB içi B2B reverse charge: KDV yoktur, tutar
 * zaten HT'dir.
 */
export function lineNetCents(item: AccountingLine, zeroRated = false): number {
  const gross = lineGrossCents(item);
  return zeroRated ? gross : removeVat(gross, item.vatRate);
}
