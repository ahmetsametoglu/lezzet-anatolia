import type { PreferredLanguage } from '@lezzet/types';
import type { NotifyDriver, NotifyEventName, NotifyPayloads, NotifyRecipient, NotifyResult } from '../types';

/**
 * `wa.me` sürücüsü (14.4) — **gönderim yapmaz, bağlantı üretir.** WhatsApp Business API'si
 * bağlanana kadar (modül 15) operatör bu bağlantıya tıklayıp mesajı kendi elinden yollar.
 *
 * Bu bir ara çözüm değil, bilinçli bir kanal: küçük hacimde insan eliyle gönderilen mesaj hem
 * meşrudur hem de API onayı beklemeden çalışır. Aynı olay çağrısı, sürücü değişince API'ye döner.
 */

export interface WaLinkDriverOptions {
  /** Üretilen bağlantı bunu döndürür; çağıran (operasyon ekranı) tıklanabilir hâle getirir. */
  onLink?: (link: string) => void;
}

/**
 * Mesaj metinleri müşterinin dilinde (DOMAIN §10) — mail tarafıyla aynı kural. Operatör bu metni
 * kendi eliyle yollasa da alıcı müşteridir; gönderenin dili değil, okuyanın dili geçerlidir.
 */
function say(locale: PreferredLanguage, phrases: Record<PreferredLanguage, string>): string {
  return phrases[locale];
}

/**
 * **Talep mesajları konuyu TAŞIMAZ.** Sipariş referansı zaten müşterinin elindeki bir numaradır,
 * ama talep başlığı şikâyetin kendisidir ("bozuk et geldi") ve WhatsApp önizlemesi kilit ekranında
 * görünür. Bağlantı yeterli: ayrıntı talebin kendi sayfasında durur.
 */
const MESSAGE: { [E in NotifyEventName]: (data: NotifyPayloads[E]) => string } = {
  order_confirmed: (d) =>
    say(d.locale, {
      tr: `${d.referenceNo} numaralı siparişiniz alındı.`,
      fr: `Votre commande ${d.referenceNo} a bien été reçue.`,
      de: `Ihre Bestellung ${d.referenceNo} ist eingegangen.`,
    }),
  order_out_for_delivery: (d) =>
    say(d.locale, {
      tr: `${d.referenceNo} numaralı siparişiniz yola çıktı.`,
      fr: `Votre commande ${d.referenceNo} est en route.`,
      de: `Ihre Bestellung ${d.referenceNo} ist unterwegs.`,
    }),
  order_delivered: (d) =>
    say(d.locale, {
      tr: `${d.referenceNo} numaralı siparişiniz teslim edildi. Afiyet olsun!`,
      fr: `Votre commande ${d.referenceNo} a été livrée. Bon appétit !`,
      de: `Ihre Bestellung ${d.referenceNo} wurde zugestellt. Guten Appetit!`,
    }),
  order_cancelled: (d) =>
    say(d.locale, {
      tr: `${d.referenceNo} numaralı siparişiniz iptal edildi.`,
      fr: `Votre commande ${d.referenceNo} a été annulée.`,
      de: `Ihre Bestellung ${d.referenceNo} wurde storniert.`,
    }),
  order_shortfall: (d) =>
    say(d.locale, {
      tr: `${d.referenceNo} numaralı siparişinizde bir kalem eksik gönderildi.`,
      fr: `Un article de votre commande ${d.referenceNo} a été livré en quantité incomplète.`,
      de: `Ein Artikel Ihrer Bestellung ${d.referenceNo} wurde unvollständig geliefert.`,
    }),
  order_refunded: (d) =>
    say(d.locale, {
      tr: `${d.referenceNo} numaralı siparişinizin iadesi işlendi.`,
      fr: `Le remboursement de votre commande ${d.referenceNo} a été traité.`,
      de: `Die Erstattung Ihrer Bestellung ${d.referenceNo} wurde bearbeitet.`,
    }),
  ticket_replied: (d) =>
    say(d.locale, {
      tr: `Talebinize cevap verdik: ${d.ticketUrl}`,
      fr: `Nous avons répondu à votre demande : ${d.ticketUrl}`,
      de: `Wir haben auf Ihre Anfrage geantwortet: ${d.ticketUrl}`,
    }),
  ticket_status_changed: (d) =>
    d.status === 'resolved'
      ? say(d.locale, {
          tr: `Talebiniz çözüldü. Sorun sürerse yazmanız yeterli: ${d.ticketUrl}`,
          fr: `Votre demande est résolue. Si le problème persiste, écrivez-nous : ${d.ticketUrl}`,
          de: `Ihre Anfrage ist gelöst. Besteht das Problem weiterhin, schreiben Sie uns: ${d.ticketUrl}`,
        })
      : say(d.locale, {
          tr: `Talebiniz yeniden açıldı: ${d.ticketUrl}`,
          fr: `Votre demande a été rouverte : ${d.ticketUrl}`,
          de: `Ihre Anfrage wurde wieder geöffnet: ${d.ticketUrl}`,
        }),
};

/** Telefonu wa.me biçimine indirger: yalnız rakamlar (uluslararası ön ek dâhil). */
function digits(phone: string): string {
  return phone.replace(/\D/g, '');
}

export function waLinkDriver(options: WaLinkDriverOptions = {}): NotifyDriver {
  return {
    channel: 'wa_link',

    supports(event, recipient) {
      return Boolean(recipient.phone && digits(recipient.phone).length >= 8) && event in MESSAGE;
    },

    async send<E extends NotifyEventName>(event: E, recipient: NotifyRecipient, payload: NotifyPayloads[E]): Promise<NotifyResult> {
      if (!recipient.phone) return { status: 'skipped', channel: 'wa_link', reason: 'no_phone' };

      const link = `https://wa.me/${digits(recipient.phone)}?text=${encodeURIComponent(MESSAGE[event](payload))}`;
      options.onLink?.(link);
      // Bağlantı ÜRETİLDİ — mesaj henüz gitmedi. `sent` demek yanıltıcı olurdu; gönderen insandır.
      return { status: 'sent', channel: 'wa_link', ref: link };
    },
  };
}
