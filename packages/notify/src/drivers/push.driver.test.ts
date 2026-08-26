import { describe, expect, it } from 'vitest';
import type { TicketNotification } from '@lezzet/types';
import { pushDriver } from './push.driver';
import type { NotifyRecipient } from '../types';

/**
 * Expo push sürücüsü (14.16) — birim, ağsız (sahte taşıyıcı). Çivilenenler:
 *   · gövde ORTAK sözlükten gelir (wa.me ile aynı cümle — iki kopya yok)
 *   · bilet kimlikleri `ref`e iner — makbuz cron'unun (ikinci yarı) tek girdisi
 *   · zile düşmeyen olay (teyit) cihaza da düşmez — iki zil tek karardan
 *   · hiçbir cihaz kabul edilmediyse bu bir ARIZADIR, "gönderdim" değil
 */

const data: TicketNotification = {
  ticketId: '00000000-0000-4000-8000-000000000001',
  subject: 'Test',
  type: 'question',
  status: 'open',
  customerName: 'Ayşe',
  locale: 'tr',
  orderReferenceNo: null,
  openedOn: '01.01.2026',
  history: [],
  previousStatus: null,
  ticketUrl: 'https://example.test/t',
  notificationPreferencesUrl: 'https://example.test/p',
};

const alici = (tokens?: string[]): NotifyRecipient => ({ name: 'Ayşe', email: null, phone: null, locale: 'tr', pushTokens: tokens });

function fakeFetch(response: { ok?: boolean; status?: number; json?: unknown }) {
  const calls: { url: string; body: unknown }[] = [];
  const f = (async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), body: JSON.parse(String(init?.body)) });
    return {
      ok: response.ok ?? true,
      status: response.status ?? 200,
      json: async () => response.json ?? { data: [] },
    } as Response;
  }) as typeof fetch;
  return { f, calls };
}

describe('pushDriver', () => {
  it('cihaz başına bir mesaj, gövde ORTAK sözlükten; biletler ref\'e iner', async () => {
    const { f, calls } = fakeFetch({ json: { data: [{ status: 'ok', id: 'T1' }, { status: 'ok', id: 'T2' }] } });
    const sonuc = await pushDriver({ fetcher: f }).send('ticket_replied', alici(['tok-1', 'tok-2']), data);

    // `ref` eşlemedir, düz liste değil: makbuz turu çürük bileti görünce hangi cihazı
    // sileceğini buradan öğrenir.
    expect(sonuc).toEqual({
      status: 'sent',
      channel: 'push',
      ref: JSON.stringify([
        { token: 'tok-1', ticket: 'T1' },
        { token: 'tok-2', ticket: 'T2' },
      ]),
    });
    const mesajlar = calls[0]!.body as { to: string; body: string }[];
    expect(mesajlar).toHaveLength(2);
    expect(mesajlar[0]!.body).toContain('cevap'); // sözlüğün cümlesi — uydurma metin değil
  });

  it('jetonsuz alıcıda YETENEKSİZ; teyit olayı jetonla bile desteklenmez (zil kararı tek yerde)', () => {
    const driver = pushDriver();
    expect(driver.supports('ticket_replied', alici())).toBe(false);
    expect(driver.supports('ticket_received', alici(['tok-1']))).toBe(false); // meta.inApp=false
    expect(driver.supports('ticket_replied', alici(['tok-1']))).toBe(true);
  });

  it('hiçbir cihaz kabul edilmediyse ERROR — "gönderdim" yalanı yok', async () => {
    const { f } = fakeFetch({ json: { data: [{ status: 'error', message: 'DeviceNotRegistered' }] } });
    const sonuc = await pushDriver({ fetcher: f }).send('ticket_replied', alici(['tok-olu']), data);
    expect(sonuc).toMatchObject({ status: 'error', channel: 'push', error: 'DeviceNotRegistered' });
  });

  it('HTTP düşüşü error döner, fırlatmaz — bildirim kaydın kendisinden önemli değildir', async () => {
    const { f } = fakeFetch({ ok: false, status: 503 });
    const sonuc = await pushDriver({ fetcher: f }).send('ticket_replied', alici(['tok-1']), data);
    expect(sonuc).toMatchObject({ status: 'error', error: 'Expo 503' });
  });
});
