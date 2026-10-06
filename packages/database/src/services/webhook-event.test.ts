import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WebhookEventService, serviceDb } from '../index';

/**
 * Sağlayıcı aynı olayı ağ hatasında yeniden gönderir; sahiplenme kırılırsa iki işleyici "yeni olay" der ve tahsilat iki kez yazılır.
 * `claim()` kontrolle yazımı tek ifadede yapar; "önce sorgula, yoksa yaz" desenine dönen düzenleme burada kırmızıya döner.
 */
const db = serviceDb();
const events = new WebhookEventService(db);
const stamp = Date.now();
const provider = 'revolut';
const eventId = `evt_test_${stamp}`;

beforeAll(async () => {
  await db.from('webhook_event').delete().like('event_id', `evt_test_${stamp}%`);
});

afterAll(async () => {
  await db.from('webhook_event').delete().like('event_id', `evt_test_${stamp}%`);
});

describe('webhook olayı sahiplenme (02.4)', () => {
  it('İLK geliş taze, İKİNCİ geliş taze DEĞİL — ve ikisi AYNI satırı gösterir', async () => {
    const ilk = await events.claim({ provider, eventId, type: 'payment_completed' });
    expect(ilk.fresh).toBe(true);

    const ikinci = await events.claim({ provider, eventId, type: 'payment_completed' });
    expect(ikinci.fresh).toBe(false);
    // Aynı satır: ikinci çağrı yeni bir kayıt AÇMADI, var olanı buldu.
    expect(ikinci.event.id).toBe(ilk.event.id);

    const { count } = await db
      .from('webhook_event')
      .select('id', { count: 'exact', head: true })
      .eq('provider', provider)
      .eq('event_id', eventId);
    expect(count).toBe(1);
  });

  it('EŞZAMANLI iki sahiplenmede yalnız BİRİ taze döner — yarışın kazananı tektir', async () => {
    const yarisId = `evt_test_${stamp}_yaris`;
    const [a, b] = await Promise.all([
      events.claim({ provider, eventId: yarisId, type: 'refund_completed' }),
      events.claim({ provider, eventId: yarisId, type: 'refund_completed' }),
    ]);
    // Kontrol ile yazım ayrı ifadeler olsaydı ikisi de `true` dönebilirdi — asıl arıza budur.
    expect([a.fresh, b.fresh].filter(Boolean)).toHaveLength(1);
    expect(a.event.id).toBe(b.event.id);
  });

  it('BAŞKA sağlayıcı aynı olay kimliğini kullanabilir — tekillik ÇİFTTEDİR', async () => {
    const ortakId = `evt_test_${stamp}_ortak`;
    const revolut = await events.claim({ provider: 'revolut', eventId: ortakId, type: 'x' });
    const meta = await events.claim({ provider: 'meta', eventId: ortakId, type: 'x' });
    expect(revolut.fresh).toBe(true);
    expect(meta.fresh).toBe(true); // aynı kimlik, farklı sağlayıcı → çakışma YOK
    expect(meta.event.id).not.toBe(revolut.event.id);
  });
});
