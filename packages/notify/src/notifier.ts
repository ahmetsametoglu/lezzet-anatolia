import { brand } from '@lezzet/brand';
import { emailDriver } from './drivers/email.driver';
import { pushDriver } from './drivers/push.driver';
import { waLinkDriver } from './drivers/wa-link.driver';
import { whatsappApiDriver } from './drivers/whatsapp-api.driver';
import { NOTIFY_EVENT_META } from './types';
import type { NotifyDriver, NotifyEventName, NotifyPayloads, NotifyRecipient, NotifyResult } from './types';

/**
 * Sürücü kaydı + gönderim (14.4). Sürücüler **sırayla denenir**, ilk destekleyen gönderir —
 * "tercih sırası" listenin kendisidir, ayrı bir kural tablosu yoktur.
 *
 * `all: true` verilirse destekleyen HER sürücü gönderir (aynı haber hem mailde hem WhatsApp'ta).
 * Varsayılan tek kanaldır: aynı haberi iki kez almak müşteri için gürültüdür.
 */

export interface Notifier {
  send<E extends NotifyEventName>(
    event: E,
    recipient: NotifyRecipient,
    payload: NotifyPayloads[E],
    opts?: { all?: boolean },
  ): Promise<NotifyResult[]>;
}

export function createNotifier(drivers: readonly NotifyDriver[]): Notifier {
  return {
    async send(event, recipient, payload, opts = {}) {
      const usable = drivers.filter((driver) => driver.supports(event, recipient));

      // Hiçbir kanal ulaşamıyorsa bu bir hata değil, bir OLGUDUR: telefonla girilmiş müşterinin
      // e-postası yoktur. Çağıran bunu görüp karar verir (ör. operasyona düşür).
      if (usable.length === 0) {
        return [{ status: 'skipped', channel: drivers[0]?.channel ?? 'email', reason: 'no_reachable_channel' }];
      }

      /*
        SEÇİM PLANI OLAYIN SINIFINDAN (14.16 — kurgu incelemesi 2/7): sınıf bilgisi TEK yerde
        (`NOTIFY_EVENT_META`) ve plan BURADA kurulur; uygulama katmanında if/else olarak ikinci
        kez yazılsaydı "sıra tek kaynak" ilkesi ölürdü.

          HABER (ping)     → TEK kanal, sıra listenin kendisi (push başta: en ucuz, en hızlı).
          BELGE (document) → e-posta DAİMA (dayanıklı ortam); e-posta YOKSA e-posta-dışı ilk
                             yedek (bugünkü davranış — wa.me operatör eliyle). Push İLAVE gider,
                             YERİNE GEÇMEZ: bildirim çubuğundan silinen bir onay, onay değildir.

        `all` olduğu gibi duruyor ama BELGE için KULLANILMAZ: "destekleyen herkes" telefonu olan
        her müşteriye wa_link'i de "gönderir"di — alt küme seçimi sınıfın işi.
      */
      let chosen: NotifyDriver[];
      if (opts.all) {
        chosen = usable;
      } else if (NOTIFY_EVENT_META[event].class === 'document') {
        const push = usable.filter((driver) => driver.channel === 'push');
        const primary = usable.find((driver) => driver.channel === 'email') ?? usable.find((driver) => driver.channel !== 'push');
        chosen = [...push, ...(primary ? [primary] : [])];
      } else {
        chosen = [usable[0]!];
      }
      return Promise.all(chosen.map((driver) => driver.send(event, recipient, payload)));
    },
  };
}

/** Yasal alt bilgi — mail her ülkede gönderenin adresini taşımak zorundadır. */
const POSTAL_ADDRESS = `${brand.name} · 12 Rue du Marché, 67000 Strasbourg, France`;

/**
 * Projenin standart bildirim kurulumu — **sürücü sırasının tek kaynağı.**
 *
 * Sıra TERCİH sırasıdır: e-posta önce denenir. WhatsApp API'si bağlanınca (modül 15) o sürücünün
 * `supports`'u dolar ve sıralama burada bir kez gözden geçirilir; çağıran taraf değişmez.
 *
 * İki uygulama da bunu kullanır: `apps/web` istekten doğan bildirimleri (sipariş, talep),
 * `apps/backend` saatten doğanları (değerlendirme daveti) yollar. Her biri kendi listesini
 * kursaydı sıra bir gün ayrışır ve aynı olay iki yüzeyden farklı kanaldan giderdi.
 *
 * Fonksiyon, sabit değil: sürücüler ortam değişkeni okuyor ve modül yüklenme anında donmuş bir
 * liste, testin ortamı kurmasından önce oluşurdu.
 */
export function defaultNotifier(): Notifier {
  return createNotifier([
    // Push BAŞTA (14.16): HABER tek kanaldan gider ve en ucuz/en hızlı kanal kazanmalı — jetonsuz
    // alıcıda sürücü zaten yeteneksiz, sıra kendiliğinden maile düşer. BELGE'de sıranın önemi yok:
    // planı sınıf kurar (send içindeki künye).
    pushDriver(),
    emailDriver({ brandName: brand.name, postalAddress: POSTAL_ADDRESS }),
    waLinkDriver(),
    whatsappApiDriver(),
  ]);
}
