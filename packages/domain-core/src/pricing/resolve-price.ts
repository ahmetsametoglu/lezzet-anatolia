import type { Channel, CustomerPriceBasis } from '@lezzet/types';
import { addVat, removeVat } from '@lezzet/helper';
import { channelPriceForMargin } from './auto-price';
import { vatBaseOf, type VatBase } from './vat-base';

/**
 * "Bu müşteri bu varyantı kaça alır" sorusunun tek cevap yeri (DOMAIN §5). Müşteriye özel fiyat (ürün bazlı ya da genel
 * kural) yalnız grup ve liste fiyatından düşükse kazanır, near-expiry teklif ondan da düşükse o; onaysız şirket B2C görür.
 */

/** Bir kanalın liste fiyatı (kendi tabanında, cent). */
export interface ChannelPrice {
  channel: Channel;
  amountCents: number;
}

/** Açık near-expiry teklif — partiye bağlıdır (DOMAIN §5). */
export interface ActiveOffer {
  unitPriceCents: number;
  /** Partide kalan miktar — teklif fiyatından alınabilecek üst sınır. */
  remainingQty: number;
  stockId: string;
}

/** Müşterinin genel fiyat kuralı: liste fiyatından yüzde indirim ya da alış fiyatı üzerine yüzde pay. */
export interface CustomerPriceRule {
  basis: CustomerPriceBasis;
  percent: number;
}

export interface ResolvePriceInput {
  /** Müşterinin kanalı (`company_info`dan türer); ziyaretçi `b2c`. */
  channel: Channel;
  /** Şirket kaydı onaylandı mı. `b2c` müşteride anlamsızdır, `true` geçilebilir. */
  b2bApproved: boolean;
  /** Varyantın kanal listeleri (her kanal kendi tabanında). */
  channelPrices: ChannelPrice[];
  /** Müşteriye özel fiyat satırı — geçerli kanalda tanımlıysa (cent, kanal tabanında). */
  customerPriceCents?: number | null;
  /** Müşterinin genel fiyat kuralı; ürün bazlı özel fiyatla aynı basamaktadır. */
  customerRule?: CustomerPriceRule | null;
  /** KDV hariç yenileme maliyeti (cent); bilinmiyorsa `null` ve alış tabanlı kural bu varyanta uygulanmaz. */
  costCents?: number | null;
  /** Ürünün KDV oranı; alış tabanlı kuralın fiyatı B2C'de KDV dahil tabana çevrilir. */
  vatRate?: number | null;
  /** Fiyat grubunun yüzdesi; yalnız etkin kanal `b2b` iken listeden düşülür, onaysız şirkette kademe de kapanır. */
  groupPercentOff?: number | null;
  /** Varyantta açık teklif varsa (fiyat, geçerli kanalın tabanında). */
  offer?: ActiveOffer | null;
}

export type PriceSource = 'customer' | 'customer_rule' | 'group' | 'channel' | 'offer';

/** Fiyat müşteriye özel mi (ürün bazlı ya da genel kural); böyle kalem indirim matrahına girmez. */
export function isCustomerPrice(source: PriceSource): boolean {
  return source === 'customer' || source === 'customer_rule';
}

/** Yüzde düşülmüş tutar (cent, en yakına yuvarlanır) — grup fiyatının tek hesap yeri. */
export function percentOffCents(amountCents: number, percentOff: number): number {
  return Math.round(amountCents * (1 - percentOff / 100));
}

export type ResolvedPrice =
  | {
      sellable: false;
      /** Ürünün bu kanalda fiyatı yok → vitrinde "satışa kapalı" (DOMAIN §5). */
      reason: 'no_price_in_channel';
    }
  | {
      sellable: true;
      unitPriceCents: number;
      source: PriceSource;
      /** Fiyatın çözüldüğü kanal — onaysız şirkette `b2c`'ye düşer. */
      effectiveChannel: Channel;
      vatBase: VatBase;
      /** Teklif kazandıysa partide kalan miktar; aksi halde null (sınırsız). */
      quantityCap: number | null;
      /** Teklif kazandıysa bağlı parti (batch-pinned rezervasyon için); aksi halde null. */
      stockId: string | null;
      /** Kazanan fiyatın yerine geçtiği fiyat (teklifte teklifsiz fiyat, müşteriye özelde grup ya da liste); yoksa null. */
      strikeCents: number | null;
    };

export function resolvePrice(input: ResolvePriceInput): ResolvedPrice {
  const { channel, b2bApproved, channelPrices, customerPriceCents, groupPercentOff, offer } = input;

  // Onaysız şirket perakendeye düşer — özel fiyat da bu kanalda aranır (aynı gerekçe).
  const effectiveChannel: Channel = channel === 'b2b' && !b2bApproved ? 'b2c' : channel;

  const listPrice = channelPrices.find((p) => p.channel === effectiveChannel)?.amountCents ?? null;

  // Kanal fiyatı yoksa ürün satışa kapalıdır: teklif, grup ve müşteri kuralı fiyatın yerine geçer, satış açmaz.
  if (listPrice === null) return { sellable: false, reason: 'no_price_in_channel' };

  const groupPrice =
    effectiveChannel === 'b2b' && groupPercentOff != null ? percentOffCents(listPrice, groupPercentOff) : null;
  const standard = groupPrice != null ? { price: groupPrice, source: 'group' as const } : { price: listPrice, source: 'channel' as const };

  const special = cheapest([
    customerPriceCents != null ? { price: customerPriceCents, source: 'customer' as const } : null,
    customerRulePrice(input, listPrice, effectiveChannel),
  ]);
  // Eşitlikte standart fiyat kalır: müşteriyi öne çıkarmayan özel fiyat, kalemi indirimden de çıkarmamalı.
  const base = special != null && special.price < standard.price ? special : standard;

  // Eşitlikte teklif kazanmaz, yoksa aynı parayı ödeyen müşteri tavan ve parti çıpasıyla kısıtlanırdı.
  const offerWins = offer != null && offer.unitPriceCents < base.price;

  return {
    sellable: true,
    unitPriceCents: offerWins ? offer.unitPriceCents : base.price,
    source: offerWins ? 'offer' : base.source,
    effectiveChannel,
    vatBase: vatBaseOf(effectiveChannel),
    quantityCap: offerWins ? offer.remainingQty : null,
    stockId: offerWins ? offer.stockId : null,
    strikeCents: offerWins ? base.price : base === standard ? null : standard.price,
  };
}

function customerRulePrice(
  input: ResolvePriceInput,
  listPrice: number,
  effectiveChannel: Channel,
): { price: number; source: 'customer_rule' } | null {
  const rule = input.customerRule;
  if (!rule) return null;
  if (rule.basis === 'list') return { price: percentOffCents(listPrice, rule.percent), source: 'customer_rule' };
  // KDV oranı yoksa B2C tabanına çevrilemez; tahmin edilmiş oranla fiyat uydurulmaz.
  if (vatBaseOf(effectiveChannel) === 'ttc' && input.vatRate == null) return null;
  const price = channelPriceForMargin(effectiveChannel, input.costCents ?? null, rule.percent, input.vatRate ?? 0);
  return price == null ? null : { price, source: 'customer_rule' };
}

function cheapest<T extends { price: number }>(candidates: readonly (T | null)[]): T | null {
  return candidates.reduce<T | null>((best, c) => (c != null && (best == null || c.price < best.price) ? c : best), null);
}

/**
 * Çözülmüş fiyatı istenen KDV tabanında verir — gösterim/fatura içindir, saklanan değeri değiştirmez.
 * Reverse charge (DE B2B, %0) durumunda `vatRate=0` geçilir: HT girdi HT çıktı.
 */
export function priceIn(resolved: Extract<ResolvedPrice, { sellable: true }>, want: VatBase, vatRate: number): number {
  if (resolved.vatBase === want) return resolved.unitPriceCents;
  return want === 'ttc' ? addVat(resolved.unitPriceCents, vatRate) : removeVat(resolved.unitPriceCents, vatRate);
}
