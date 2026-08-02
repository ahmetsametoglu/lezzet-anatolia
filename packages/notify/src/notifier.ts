import { brand } from '@lezzet/brand';
import { emailDriver } from './drivers/email.driver';
import { waLinkDriver } from './drivers/wa-link.driver';
import { whatsappApiDriver } from './drivers/whatsapp-api.driver';
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

      const chosen = opts.all ? usable : [usable[0]!];
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
    emailDriver({ brandName: brand.name, postalAddress: POSTAL_ADDRESS }),
    waLinkDriver(),
    whatsappApiDriver(),
  ]);
}
