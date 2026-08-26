import type { NotifyDriver, NotifyEventName, NotifyPayloads, NotifyRecipient, NotifyResult } from '../types';
import { MESSAGE } from '../event-copy';

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
