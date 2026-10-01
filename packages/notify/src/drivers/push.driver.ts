import type { NotifyDriver, NotifyEventName, NotifyRecipient, NotifyResult } from '../types';
import { NOTIFY_EVENT_META } from '../types';
import { MESSAGE } from '../event-copy';

/**
 * Expo push sürücüsü: jetonlar alıcıyla gelir, sürücü DB'ye bakmaz ve yalnız uygulama içi satır yazan olayı (`inApp`) cihaza taşır.
 * Expo'nun döndürdüğü biletler `ref`e {jeton, bilet} çifti olarak yazılır, çünkü makbuz turu çürük jetonu yalnız bu çiftten silebilir.
 */

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

/** Yanıt vermeyen Expo, bildirimi doğuran eylemi (sipariş, talep) bekletirdi. */
const TIMEOUT_MS = 10_000;

/** Cihaza giden mesaj; müşteri ve personel bildirimi aynı gönderimden geçer. */
export interface DevicePushMessage {
  /** Yoksa işletim sistemi uygulama adını basar. */
  title?: string;
  body?: string;
  /** Dokunuşun adresi: uygulama bildirime dokununca onu okuyup ilgili ekrana gider. */
  data?: Record<string, unknown>;
  /** Android kanalı; uygulamanın kurduğu kanalla aynı kimlik (`PUSH_CHANNEL`). */
  channelId?: string;
}

export interface PushDriverOptions {
  /** Test enjeksiyonu — ağ yerine sahte taşıyıcı (meta-sender'ın `fetcher` deseni). */
  fetcher?: typeof fetch;
}

interface ExpoTicket {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
}

export async function sendExpoPush(tokens: readonly string[], message: DevicePushMessage, fetcher: typeof fetch = fetch): Promise<NotifyResult> {
  if (tokens.length === 0) return { status: 'skipped', channel: 'push', reason: 'no_device' };
  try {
    const res = await fetcher(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        // Erişim jetonu OPSİYONEL (Expo hesabında "Enhanced Security" açıksa şart olur);
        // yokken uç açık çalışır — boş başlık göndermek ise isteği reddettirirdi.
        ...(process.env.EXPO_ACCESS_TOKEN ? { authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN}` } : {}),
      },
      // Cihaz başına bir mesaj, tek istekte (Expo 100'e kadar kabul eder); `sound` verilmezse bildirim sessiz düşer.
      body: JSON.stringify(tokens.map((to) => ({ to, ...message, sound: 'default' }))),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return { status: 'error', channel: 'push', error: `Expo ${res.status}` };

    const json = (await res.json()) as { data?: ExpoTicket[] };
    const tickets = json.data ?? [];
    // Biletler mesajlarla AYNI SIRADA döner (Expo sözleşmesi) — eşleme bu sıradan kurulur.
    // `ref` düz kimlik listesi DEĞİL, {token, ticket} çiftleri: makbuz turu çürük bileti
    // görünce hangi CİHAZI sileceğini bilmek zorunda; kimlik tek başına o soruyu cevaplamaz.
    const pairs = tickets
      .map((ticket, i) => (ticket.status === 'ok' && ticket.id ? { token: tokens[i]!, ticket: ticket.id } : null))
      .filter((pair): pair is { token: string; ticket: string } => pair !== null);
    // HİÇBİR cihaza kabul edilmediyse bu bir arızadır; kısmi kabul `sent`tir — kalan cihazın
    // akıbetini makbuz turu söyler, burada tahmin edilmez.
    if (pairs.length === 0) {
      return { status: 'error', channel: 'push', error: tickets[0]?.message ?? 'Expo bilet vermedi' };
    }
    return { status: 'sent', channel: 'push', ref: JSON.stringify(pairs) };
  } catch (err) {
    return { status: 'error', channel: 'push', error: err instanceof Error ? err.message : String(err) };
  }
}

export function pushDriver(options: PushDriverOptions = {}): NotifyDriver {
  return {
    channel: 'push',

    supports(event: NotifyEventName, recipient: NotifyRecipient): boolean {
      return NOTIFY_EVENT_META[event].inApp && (recipient.pushTokens?.length ?? 0) > 0;
    },

    send(event, recipient, payload): Promise<NotifyResult> {
      // Dağıtım kapısının metni uygulama içi listeyle aynıdır; yalnız kapıdan geçmeyen gönderim olayın tek cümlesine düşer.
      const text = recipient.pushText ?? { body: MESSAGE[event](payload) };
      return sendExpoPush(recipient.pushTokens ?? [], { ...text, ...(recipient.pushData ? { data: recipient.pushData } : {}) }, options.fetcher);
    },
  };
}
