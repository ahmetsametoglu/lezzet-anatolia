import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WebhookEventService, serviceDb } from '../index';

/**
 * **AYNI OLAY İKİ KEZ İŞLENMEZ** — `02.4`'ün bitiş ölçütü olarak yazılmıştı ve 26.08'de ölçüldü ki
 * **hiç yazılmamış.** Kısıt (`webhook_event_provider_key`) vardı, testi yoktu; yani projenin
 * ödeme akışını tekrardan koruyan tek şey hiç sınanmamış bir indeksti.
 *
 * Neden bu kadar önemli: Stripe aynı olayı ağ hatasında YENİDEN gönderir. Sahiplenme kırılırsa iki
 * işleyici birden "yeni olay" der ve **tahsilat iki kez yazılır** — müşterinin parası defterde iki
 * görünür ve hiçbir yerde hata çıkmaz.
 *
 * `claim()` kontrolü ile yazımı TEK ifadede yapıyor (`ignoreDuplicates`); testin çiviledeği de bu:
 * "önce sorgula, yoksa yaz" desenine dönen bir düzenleme buradan kırmızı verir.
 */
const db = serviceDb();
const events = new WebhookEventService(db);
const stamp = Date.now();
const provider = 'stripe';
const eventId = `evt_test_${stamp}`;

beforeAll(async () => {
  await db.from('webhook_event').delete().like('event_id', `evt_test_${stamp}%`);
});

afterAll(async () => {
  await db.from('webhook_event').delete().like('event_id', `evt_test_${stamp}%`);
});

describe('webhook olayı sahiplenme (02.4)', () => {
  it('İLK geliş taze, İKİNCİ geliş taze DEĞİL — ve ikisi AYNI satırı gösterir', async () => {
    const ilk = await events.claim({ provider, eventId, type: 'payment_intent.succeeded' });
    expect(ilk.fresh).toBe(true);

    const ikinci = await events.claim({ provider, eventId, type: 'payment_intent.succeeded' });
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
      events.claim({ provider, eventId: yarisId, type: 'charge.refunded' }),
      events.claim({ provider, eventId: yarisId, type: 'charge.refunded' }),
    ]);
    // Kontrol ile yazım ayrı ifadeler olsaydı ikisi de `true` dönebilirdi — asıl arıza budur.
    expect([a.fresh, b.fresh].filter(Boolean)).toHaveLength(1);
    expect(a.event.id).toBe(b.event.id);
  });

  it('BAŞKA sağlayıcı aynı olay kimliğini kullanabilir — tekillik ÇİFTTEDİR', async () => {
    const ortakId = `evt_test_${stamp}_ortak`;
    const stripe = await events.claim({ provider: 'stripe', eventId: ortakId, type: 'x' });
    const meta = await events.claim({ provider: 'meta', eventId: ortakId, type: 'x' });
    expect(stripe.fresh).toBe(true);
    expect(meta.fresh).toBe(true); // aynı kimlik, farklı sağlayıcı → çakışma YOK
    expect(meta.event.id).not.toBe(stripe.event.id);
  });
});
