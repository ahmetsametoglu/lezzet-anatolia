import type { Channel } from '@lezzet/types';
import { addVat, removeVat } from '@lezzet/helper';

/**
 * Fiyat çözümü — "bu müşteri bu varyantı kaça alır" sorusunun TEK cevap yeri (DOMAIN §5).
 * Saf: DB bilmez, yüzey bilmez. Web, WhatsApp ve kapı önü aynı fonksiyonu çağırır.
 *
 * Sıra (ilk bulunan kazanır): müşteriye özel fiyat → kanal fiyatı.
 *
 * Kapsam: **varyant** fiyatıdır. Paketin (`Bundle`) fiyatı buradan geçmez — paket yalnız B2C'de
 * satılır, tek sayıdır ve TTC tabanındadır (DOMAIN §13); kanal/özel fiyat/teklif boyutu yoktur.
 * Paket açılımı sepete eklenirken yapılır: `allocated_unit_price`'lar kalemlere aktarılır.
 * `Customer.discount_percent` BU SIRAYA GİRMEZ — o bir indirimdir, kupon/kampanyayla aynı
 * havuzda değerlendirilir (03.4 indirim motoru).
 *
 * İki dallanma kuralı:
 * - **Onaysız şirket B2C fiyatı görür.** Kanal `b2b` olsa da `b2bApproved=false` ise perakende
 *   fiyat çözülür — toptan liste doğrulanmamış kayda açılmaz (DOMAIN §10; SIRET herkese açıktır).
 * - **Near-expiry teklif çakışmasında düşük olan kazanır** (müşteri lehine). Teklif kazanırsa
 *   miktar tavanı + batch-pinned rezervasyon devreye girer; özel fiyat kazanırsa normal
 *   (ürün-toplamı) rezervasyon yürür ve tavan yoktur.
 */

/** Kanalın KDV tabanı: B2C dahil (TTC), B2B hariç (HT) — DOMAIN §5. */
export type VatBase = 'ttc' | 'ht';

export function vatBaseOf(channel: Channel): VatBase {
  return channel === 'b2c' ? 'ttc' : 'ht';
}

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

export interface ResolvePriceInput {
  /** Müşterinin kanalı — `company_info`'dan türetilir (03.2). Ziyaretçi `b2c`. */
  channel: Channel;
  /** Şirket kaydı onaylandı mı. `b2c` müşteride anlamsızdır, `true` geçilebilir. */
  b2bApproved: boolean;
  /** Varyantın kanal listeleri (her kanal kendi tabanında). */
  channelPrices: ChannelPrice[];
  /** Müşteriye özel fiyat satırı — geçerli kanalda tanımlıysa (cent, kanal tabanında). */
  customerPriceCents?: number | null;
  /** Varyantta açık teklif varsa (fiyat, geçerli kanalın tabanında). */
  offer?: ActiveOffer | null;
}

export type PriceSource = 'customer' | 'channel' | 'offer';

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
    };

export function resolvePrice(input: ResolvePriceInput): ResolvedPrice {
  const { channel, b2bApproved, channelPrices, customerPriceCents, offer } = input;

  // Onaysız şirket perakendeye düşer — özel fiyat da bu kanalda aranır (aynı gerekçe).
  const effectiveChannel: Channel = channel === 'b2b' && !b2bApproved ? 'b2c' : channel;

  const listPrice = channelPrices.find((p) => p.channel === effectiveChannel)?.amountCents ?? null;

  // Kanal fiyatı yoksa ürün satışa kapalıdır — teklif tek başına satış açmaz (teklif normal
  // fiyatın yerine geçer, yerine kaim olmaz).
  if (listPrice === null) return { sellable: false, reason: 'no_price_in_channel' };

  const base =
    customerPriceCents != null
      ? { price: customerPriceCents, source: 'customer' as const }
      : { price: listPrice, source: 'channel' as const };

  // Teklif çakışması: düşük olan kazanır. Eşitlikte teklif kazanmaz — tavan ve batch-pinned
  // rezervasyon gereksiz yere devreye girmesin (aynı parayı ödeyen müşteriyi kısıtlamayız).
  const offerWins = offer != null && offer.unitPriceCents < base.price;

  return {
    sellable: true,
    unitPriceCents: offerWins ? offer.unitPriceCents : base.price,
    source: offerWins ? 'offer' : base.source,
    effectiveChannel,
    vatBase: vatBaseOf(effectiveChannel),
    quantityCap: offerWins ? offer.remainingQty : null,
    stockId: offerWins ? offer.stockId : null,
  };
}

/**
 * Çözülmüş fiyatı istenen KDV tabanında verir — gösterim/fatura içindir, saklanan değeri değiştirmez.
 * Reverse charge (DE B2B, %0) durumunda `vatRate=0` geçilir: HT girdi HT çıktı.
 */
export function priceIn(resolved: Extract<ResolvedPrice, { sellable: true }>, want: VatBase, vatRate: number): number {
  if (resolved.vatBase === want) return resolved.unitPriceCents;
  return want === 'ttc' ? addVat(resolved.unitPriceCents, vatRate) : removeVat(resolved.unitPriceCents, vatRate);
}
