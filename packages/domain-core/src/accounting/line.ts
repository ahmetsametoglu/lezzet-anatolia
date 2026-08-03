import { addVat, removeVat } from '@lezzet/helper';
import type { Channel, OrderItem } from '@lezzet/types';
import { vatBaseOf } from '../pricing/resolve-price';

/**
 * Sipariş kaleminin para hesabı — **muhasebe export'u (12.7) ile kârlılığın (12.6) ORTAK zemini.**
 * İki rapor aynı satırı iki ayrı formülle hesaplasaydı bir gün ayrışır ve hangisinin doğru olduğu
 * bilinemezdi.
 *
 * **Kalem tutarı kanalın KENDİ TABANINDADIR** (DOMAIN §5): B2C satırları KDV dahil, B2B satırları
 * KDV hariç. Bu yüzden HT'ye inmek her kanalda aynı işlem DEĞİLDİR — b2c'de KDV çıkarılır, b2b'de
 * tutar zaten HT'dir ve dokunulmaz. Taban `vatBaseOf`'tan sorulur; fiyat motoru da aynı yerden
 * soruyor, iki katman aynı soruya iki cevap veremesin diye.
 *
 * Kâr **her zaman HT üstünden** hesaplanır: KDV ciro değildir, devlet adına tahsil edilir.
 */

export type AccountingLine = Pick<OrderItem, 'qty' | 'fulfilledQty' | 'unitPriceCents' | 'lineDiscountAmountCents' | 'vatRate'>;

/**
 * Kalemin faturalanacak tutarı **kanalın kendi tabanında** (cent) — **teslim edilen** miktar
 * üzerinden. Sipariş edilen değil: gitmeyen mal ne faturalanır ne ciro sayılır.
 */
export function lineAmountCents(item: AccountingLine): number {
  const beforeDiscount = item.unitPriceCents * item.fulfilledQty;
  // İndirim payı tüm miktar için yazılmıştır; eksik karşılanan kalemde (07.8) oransal düşer —
  // yoksa yarısı gitmiş bir kalem indirimin tamamını taşır ve satır olduğundan ucuz görünürdü.
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
 * Kanal tabanındaki bir tutarı TTC/HT/KDV'ye ayırır.
 *
 * **Yön kanaldan gelir:** b2c'de tutar TTC'dir, KDV içinden çıkarılır; b2b'de tutar HT'dir, KDV
 * üstüne eklenir. Tek yön varsaymak B2B satırında KDV'yi İKİ KEZ düşürürdü — HT tutar bir daha
 * "KDV'den arındırılınca" hem ciro hem beyan olduğundan düşük çıkar.
 *
 * `zeroRated` = AB içi B2B reverse charge (`Autoliquidation`): KDV yoktur, tutar zaten HT'dir ve
 * brütü de kendisidir — müşteri vergiyi kendi ülkesinde beyan eder.
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
