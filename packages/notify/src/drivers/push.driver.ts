import type { NotifyDriver, NotifyEventName, NotifyRecipient, NotifyResult } from '../types';
import { NOTIFY_EVENT_META } from '../types';
import { MESSAGE } from '../event-copy';

/**
 * **Expo push sürücüsü** (14.16) — cihaz bildirimi: en ucuz, en hızlı, bizim kanal.
 *
 * ── DB'YE BAKMAZ ────────────────────────────────────────────────────────────
 * Jetonlar `NotifyRecipient.pushTokens` ile GELİR (tek kapı doldurur, izni kapalı cihaz listeye
 * hiç girmez). Sürücünün tek işi Expo'ya POST atmak — paketin sözleşmesi: "sürücü seçimi yeteneğe
 * bakmadır", yetenek burada jetonun varlığıdır.
 *
 * ── YALNIZ UYGULAMA-İÇİ SATIR YAZAN OLAYLAR ─────────────────────────────────
 * `supports` olay-metasının `inApp` bayrağını okur: push da bir ZİLDİR ve zile düşmeyen olay
 * (ticket_received — teyit) cihaza da düşmez. İki liste ayrı tutulsaydı biri gün gelip teyidi
 * gece yarısı bildirimi yapardı.
 *
 * ── BAŞLIK YOK, GÖVDE ORTAK SÖZLÜKTEN ───────────────────────────────────────
 * Başlığı işletim sistemi zaten uygulama adıyla basar; gövde `event-copy`nin tek cümlesi —
 * wa.me metniyle AYNI cümle, iki kopya değil (CLAUDE §1).
 *
 * ── MAKBUZ SONRAYA, BİLETLER REF'E ──────────────────────────────────────────
 * Expo teslimi asenkron söyler: dönen BİLET kimlikleri `ref`e virgülle yazılır ve teslim
 * defterine iner — makbuz süpürme cron'u (14.16'nın ikinci yarısı) `DeviceNotRegistered`ı
 * oradan okuyup çürük jetonu silecek. Bilet saklanmasaydı makbuz hiç sorulamazdı.
 */

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

export interface PushDriverOptions {
  /** Test enjeksiyonu — ağ yerine sahte taşıyıcı (meta-sender'ın `fetcher` deseni). */
  fetcher?: typeof fetch;
}

interface ExpoTicket {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
}

export function pushDriver(options: PushDriverOptions = {}): NotifyDriver {
  return {
    channel: 'push',

    supports(event: NotifyEventName, recipient: NotifyRecipient): boolean {
      return NOTIFY_EVENT_META[event].inApp && (recipient.pushTokens?.length ?? 0) > 0;
    },

    async send(event, recipient, payload): Promise<NotifyResult> {
      const tokens = recipient.pushTokens ?? [];
      if (tokens.length === 0) return { status: 'skipped', channel: 'push', reason: 'no_device' };

      const body = MESSAGE[event](payload);
      const f = options.fetcher ?? fetch;
      try {
        const res = await f(EXPO_PUSH_URL, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            accept: 'application/json',
            // Erişim jetonu OPSİYONEL (Expo hesabında "Enhanced Security" açıksa şart olur);
            // yokken uç açık çalışır — boş başlık göndermek ise isteği reddettirirdi.
            ...(process.env.EXPO_ACCESS_TOKEN ? { authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN}` } : {}),
          },
          // Cihaz başına bir mesaj, tek POST (Expo 100'e kadar kabul eder; kişi başına cihaz
          // sayısı bir avuç). `sound` varsayılan: sessiz bildirim, bildirim değildir.
          // `data` DOKUNUŞUN adresidir (kind + hedef + satır payload'u): uygulama bildirime
          // dokununca bunu okuyup doğru ekrana gider. Alıcıyla gelir (jetonlarla aynı yol) —
          // olay başına değişir, sürücü kuruluşunda donamaz; kuran tek kapıdır, sürücü taşır.
          body: JSON.stringify(tokens.map((to) => ({ to, body, sound: 'default', ...(recipient.pushData ? { data: recipient.pushData } : {}) }))),
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
    },
  };
}
