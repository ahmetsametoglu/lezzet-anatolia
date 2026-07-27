import type { Channel, OrderSource } from '@lezzet/types';

/**
 * Kanal ve sipariş kaynağı — İKİ AYRI EKSEN (03.2, DOMAIN §3).
 *
 * - **Kanal** (`b2b`/`b2c`) = siparişi veren *kim*. Müşteri şirket mi değil mi'den türer,
 *   siparişe yazılır ve **bir daha değişmez** (audit + raporlama).
 * - **Kaynak** (`order_source`) = sipariş *nereden kapandı*. Kanaldan bağımsızdır: aynı B2C
 *   müşteri hem siteden hem WhatsApp'tan sipariş verebilir, kanalı değişmez.
 *
 * Günlük dilde "WhatsApp kanalı" denir; veri modelinde bu `order_source=whatsapp`'tır ve mali
 * paylaşımla ilgisi yoktur (paylaşım tek havuz — DOMAIN §3).
 */

/** Kanal türetimi için gereken asgari müşteri bilgisi — `Customer` şeması gelince ondan beslenir. */
export interface ChannelInput {
  /** Şirket kaydı mı (vergi no / şirket bilgisi varlığı). */
  isCompany: boolean;
}

/** Müşteri tipi → kanal. Sipariş oluşurken bir kez çalışır. */
export function deriveChannel(input: ChannelInput): Channel {
  return input.isCompany ? 'b2b' : 'b2c';
}

/**
 * Kaynak, durum yolunu DEĞİŞTİRMEZ — yalnız hangi yolun kullanılacağını söyler
 * (ORDER_LIFECYCLE "Sipariş kaynağı ve yaşam döngüsü"): `door` hızlı satış, gerisi tam yol.
 */
export function usesFastSalePath(source: OrderSource): boolean {
  return source === 'door';
}

/**
 * Kanal siparişe yazıldıktan sonra değişmez. Müşteri sonradan şirkete dönse bile geçmiş
 * siparişin kanalı sabit kalır — bu fonksiyon o kuralı çağıranın sorabileceği hale getirir.
 */
export function canChangeChannel(): false {
  return false;
}
