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
 * Kanal siparişe yazıldıktan sonra değişmez. Müşteri sonradan şirkete dönse bile geçmiş siparişin
 * kanalı sabit kalır.
 *
 * ── KURALI ZORLAYAN BURASI DEĞİL (27.08 düzeltmesi, `03.12`) ─────────────────
 * Eski künye *"bu fonksiyon o kuralı çağıranın sorabileceği hale getirir"* diyordu; **soran yoktu
 * ve zorlayan da yoktu.** `OrderUpdateSchema` tam `partial()` olduğu için kanal sonradan
 * yazılabilir bir alandı — yani kural yalnızca burada, bir cümle olarak vardı. Yanlış teminat
 * teminatsızlıktan kötüdür: okuyanı kontrol etmekten alıkoyar.
 *
 * Kural artık İKİ yerde gerçek:
 *   · **Şema** — `OrderUpdateSchema` `channel`ı `omit` eder, reddi derleme anına taşır.
 *   · **Veri** — `order_channel_frozen` tetikleyicisi (`0012_order.sql`), şemayı atlayan yolu keser.
 *
 * Bu fonksiyon geriye bir SORU CÜMLESİ olarak kalıyor (kural bir yerde okunabilir olmalı), ama
 * girdisi yok ve cevabı sabit: kimse ona dayanarak dallanmamalı, çünkü ihlal zaten iki katman
 * önce reddediliyor.
 */
export function canChangeChannel(): false {
  return false;
}
