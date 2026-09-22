/**
 * Müşterinin sohbet kanalları — saf karar. Cevap ayrı kolonda durmaz, sohbet satırlarından türer, çünkü saklanan "son kanal" her
 * gelen mesajda iki yere yazılır ve ayrışırdı; operasyon ve native aynı sıralamayı okusun diye kural burada.
 */

/** Karara gereken alanlar — `Conversation`ın alt kümesi; `types` paketine bağlanılmaz (STACK §4). */
export interface ChannelConversation {
  source: string;
  /** Müşterinin bu kanaldan son yazdığı an — `null` = hiç yazmadı (sohbeti biz açtık). */
  lastInboundAt: string | null;
  lastMessageAt: string | null;
}

export type RankedChannel<T extends ChannelConversation> = T & {
  /** Müşterinin EN SON yazdığı kanal — en çok bir satırda; hiç yazmadıysa hiçbirinde. */
  latest: boolean;
};

export interface CustomerChannelSet<T extends ChannelConversation> {
  /** En son YAZDIĞI kanal önce. */
  channels: RankedChannel<T>[];
  /**
   * WhatsApp sohbetini BİZ açabilir miyiz: kayıtlı telefon var ve WhatsApp sohbeti yok. Yalnız WhatsApp —
   * Messenger/Instagram'da işletme sohbet başlatamaz, kişi kimliği (PSID/IGSID) müşteri yazınca doğar.
   */
  canStartWhatsapp: boolean;
}

/**
 * Ölçüt son gelen mesaj, çünkü bizim son cevabımız müşterinin o kanalda görünmesi değildir; hiç yazmadığı kanal arkaya düşer ve
 * "en son" sayılmaz. Çağıranın dizisine dokunmaz.
 */
export function customerChannelsOf<T extends ChannelConversation>(input: {
  conversations: readonly T[];
  phone: string | null;
}): CustomerChannelSet<T> {
  const at = (iso: string | null) => (iso ? Date.parse(iso) : Number.NEGATIVE_INFINITY);
  // İki boş damganın farkı NaN'dır ve `||` onu ikinci ölçüte düşürür — bilinçli.
  const sorted = [...input.conversations].sort(
    (a, b) => at(b.lastInboundAt) - at(a.lastInboundAt) || at(b.lastMessageAt) - at(a.lastMessageAt),
  );
  const channels = sorted.map((conversation, index) => ({ ...conversation, latest: index === 0 && conversation.lastInboundAt !== null }));
  return {
    channels,
    canStartWhatsapp: Boolean(input.phone?.trim()) && !channels.some((c) => c.source === 'whatsapp'),
  };
}

/** Müşteriye gösterilen kanal satırı: bağlı mı, ne zamandan beri, WhatsApp'ta hangi numaralarla. */
export interface LinkedChannel<S extends string> {
  source: S;
  linked: boolean;
  /** İlk bağlanma anı; `null` = sohbet yok (WhatsApp numarası sohbetten önce doğrulanmış olabilir). */
  since: string | null;
  numbers: string[];
}

/**
 * Hesap ekranının kanal listesi: her kanal sabit sırada tek satır, bağlı olmasa da, çünkü bağlı olmayan satır bağlanma yolunu
 * söyler. WhatsApp numarayla da bağlı sayılır, çünkü doğrulanmış numara sohbet açılmadan önce de müşteriyi tanıtır.
 */
export function linkedChannelsOf<S extends string>(input: {
  sources: readonly S[];
  conversations: readonly { source: string; linkedAt: string | null; createdAt: string }[];
  whatsappNumbers: readonly string[];
}): LinkedChannel<S>[] {
  return input.sources.map((source) => {
    const starts = input.conversations.filter((c) => c.source === source).map((c) => c.linkedAt ?? c.createdAt);
    const numbers = source === 'whatsapp' ? [...input.whatsappNumbers] : [];
    const since = starts.length === 0 ? null : starts.reduce((a, b) => (a < b ? a : b));
    return { source, linked: since !== null || numbers.length > 0, since, numbers };
  });
}
