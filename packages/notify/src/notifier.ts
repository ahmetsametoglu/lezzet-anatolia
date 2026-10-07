import { brand, companyAddressLine } from '@lezzet/brand';
import { emailDriver } from './drivers/email.driver';
import { pushDriver } from './drivers/push.driver';
import { webPushDriver } from './drivers/web-push.driver';
import { waLinkDriver } from './drivers/wa-link.driver';
import { whatsappApiDriver } from './drivers/whatsapp-api.driver';
import { DEVICE_CHANNELS, NOTIFY_EVENT_META } from './types';
import type { NotifyChannel, NotifyDriver, NotifyEventName, NotifyPayloads, NotifyRecipient, NotifyResult } from './types';

/**
 * Sürücüler sırayla denenir ve tercih sırası listenin kendisidir, ayrı bir kural tablosu yoktur. `all: true` destekleyen her sürücüye
 * gönderir; varsayılan tek kanaldır, çünkü aynı haberi iki kez almak gürültüdür.
 */

export interface Notifier {
  send<E extends NotifyEventName>(
    event: E,
    recipient: NotifyRecipient,
    payload: NotifyPayloads[E],
    /** `channels`: yalnız bu kanalların sürücüleri denenir, ki aynı olayın cihaz bildirimi ile e-postası ayrı anlarda gidebilsin. */
    opts?: { all?: boolean; channels?: readonly NotifyChannel[] },
  ): Promise<NotifyResult[]>;
}

export function createNotifier(drivers: readonly NotifyDriver[]): Notifier {
  return {
    async send(event, recipient, payload, opts = {}) {
      const usable = drivers.filter(
        (driver) => (!opts.channels || opts.channels.includes(driver.channel)) && driver.supports(event, recipient),
      );

      // Hiçbir kanalın ulaşamaması hata değil olgudur (telefonla girilmiş müşterinin e-postası yoktur); çağıran görüp karar verir.
      if (usable.length === 0) {
        return [{ status: 'skipped', channel: drivers[0]?.channel ?? 'email', reason: 'no_reachable_channel' }];
      }

      /*
        Plan olayın sınıfından kurulur: HABER tek kanala, YAZIŞMA cihaza ve e-postaya birlikte, BELGE e-postaya (yoksa e-posta dışı ilk
        yedeğe) ve cihaz bildirimi yanına eklenerek gider, çünkü bildirim çubuğundan silinen onay onay değildir. `all` BELGE'de
        kullanılmaz, yoksa telefonu olan her müşteriye wa_link de giderdi.
      */
      const eventClass = NOTIFY_EVENT_META[event].class;
      let chosen: NotifyDriver[];
      if (opts.all) {
        chosen = usable;
      } else if (eventClass === 'conversation') {
        // Cihazı da e-postası da olmayan müşteri HABER gibi ilk yedeğe düşer; yazışma uygulamada da okunduğu için cihazın yanına yedek eklenmez.
        const written = usable.filter((driver) => DEVICE_CHANNELS.includes(driver.channel) || driver.channel === 'email');
        chosen = written.length > 0 ? written : [usable[0]!];
      } else if (eventClass === 'document') {
        const device = usable.filter((driver) => DEVICE_CHANNELS.includes(driver.channel));
        const primary = usable.find((driver) => driver.channel === 'email') ?? usable.find((driver) => !DEVICE_CHANNELS.includes(driver.channel));
        chosen = [...device, ...(primary ? [primary] : [])];
      } else {
        chosen = [usable[0]!];
      }
      return Promise.all(chosen.map((driver) => driver.send(event, recipient, payload)));
    },
  };
}

/** Mail her ülkede gönderenin adresini taşımak zorundadır; ülke adı her dilde "France", çünkü alt satır tek dilli. */
export const POSTAL_ADDRESS = `${brand.name} · ${companyAddressLine}, France`;

/**
 * Sürücü sırasının tek kaynağı: web istekten, backend saatten doğan bildirimleri buradan yollar ki aynı olay iki yüzeyden farklı
 * kanala gitmesin. Sabit değil fonksiyon, çünkü sürücüler ortam değişkeni okur ve yüklenme anında donan liste testin ortamını görmezdi.
 */
export function defaultNotifier(): Notifier {
  return createNotifier([
    // Cihazsız alıcıda iki cihaz sürücüsü de yeteneksizdir, HABER kendiliğinden maile düşer. YAZIŞMA ve BELGE'de sıranın önemi yok, planı sınıf kurar.
    pushDriver(),
    webPushDriver(),
    emailDriver({ brandName: brand.name, postalAddress: POSTAL_ADDRESS }),
    waLinkDriver(),
    whatsappApiDriver(),
  ]);
}
