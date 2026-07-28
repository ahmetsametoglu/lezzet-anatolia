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
