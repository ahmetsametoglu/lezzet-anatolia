/**
 * **Müşterinin sohbet kanalları** (15.32 · kullanıcı isteği 14.09) — saf karar, I/O yok.
 *
 * Kullanıcının sorusu: *"müşterinin bizimle hangi kanallardan irtibat kurduğunu, en son hangisinden
 * kurduğunu bilmeliyiz"*. Cevap ayrı bir kolonda DURMAZ, müşterinin sohbet satırlarından TÜRER
 * (`conversation.customer_id` + `last_inbound_at`, 0039): "son kanal" saklansaydı her gelen mesajda iki
 * yere yazılır ve bir gün ayrışırdı.
 *
 * Kural burada, çünkü iki yüzey okuyor: operasyon web'i (sipariş · müşteri kartı · talep) ve native
 * uygulamanın kurye/yönetim ekranları. Sıralamayı her yüzey kendisi yazsaydı biri "son mesaj", öteki "son
 * gelen mesaj" derdi ve aynı müşteri iki ekranda iki ayrı "son kanal" gösterirdi.
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
 * Ölçüt son GELEN mesaj: bizim son cevabımız müşterinin o kanalda "görünmesi" değildir. Hiç yazmadığı
 * kanal yazdığı kanalların arkasına düşer, kendi aralarında son harekete göre dizilir ve "en son"
 * SAYILMAZ — işaret yalnız müşterinin gerçekten yazdığı kanala konur. Çağıranın dizisine dokunmaz.
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
