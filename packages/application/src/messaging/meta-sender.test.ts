import { describe, expect, it } from 'vitest';
import { fakeCloudApiConfig, fakeMeta } from '@lezzet/notify/testing';
import { messageSenderFor, metaCloudSender, metaSenderFromEnv, metaTokensFromEnv } from './meta-sender';
import { unconfiguredSender } from './send';

// Kural yanlış çalışırsa arıza sessizdir: boş jetonla gerçek sürücü kurulur ve her çağrı Meta'dan `190` yer. `unconfiguredSender`
// bunu adıyla söyler ve özerk motor o ada bakıp sohbeti insana devretmez.
describe('messageSenderFor — jeton var mı, sürücü hangisi', () => {
  it('jeton VARSA gerçek Cloud API sürücüsü döner', () => {
    expect(messageSenderFor('EAAG-gerçek-jeton').name).toBe(metaCloudSender({ token: 'x' }).name);
  });

  it('jeton YOKSA reddeden sürücü döner — sessizce "gönderdim" diyen bir sahte değil', () => {
    expect(messageSenderFor(undefined)).toBe(unconfiguredSender);
    expect(messageSenderFor(null)).toBe(unconfiguredSender);
  });

  it('BOŞ ve boşluklu dizge de "jeton yok" sayılır', () => {
    // Boş dizge doğruluk sınavını geçen bir değer olsaydı gerçek sürücü jetonsuz kurulurdu.
    expect(messageSenderFor('')).toBe(unconfiguredSender);
    expect(messageSenderFor('   ')).toBe(unconfiguredSender);
  });
});

describe('çeviri katmanı — çağıranın söylediği sürücüye ULAŞIYOR mu (28.08)', () => {
  // Çevirmenin sessizce alan düşürmesi en pahalı arıza türü: istek gider, sağlayıcı reddeder, sebep bizde okunamaz.
  const hedef = { source: 'whatsapp', externalRef: '+33600000000', accountRef: 'PNID-1' } as const;

  it('şablon dili çağırandan istemciye geçer — kopan halka tam buydu', async () => {
    const meta = fakeMeta();
    await metaCloudSender(fakeCloudApiConfig(meta)).send(hedef, {
      conversationId: 'c1',
      text: null,
      templateName: 'hello_world',
      templateLanguage: 'en_US',
    });

    expect(meta.calls[0]!.body).toMatchObject({ template: { name: 'hello_world', language: { code: 'en_US' } } });
  });

  it('insan-temsilci bayrağı da geçer — `send.ts` karar verir, çevirmen taşır', async () => {
    // Bayrak burada düşseydi Messenger'a etiketsiz mesaj gider ve Meta pencere dışında reddederdi.
    const meta = fakeMeta();
    await metaCloudSender(fakeCloudApiConfig(meta)).send(
      { source: 'messenger', externalRef: 'PSID-1', accountRef: 'PAGE-1', humanAgent: true },
      { conversationId: 'c1', text: 'pazartesi cevabı' },
    );

    expect(meta.calls[0]!.body).toMatchObject({ messaging_type: 'MESSAGE_TAG', tag: 'HUMAN_AGENT' });
  });

  it('hedefin İKİ kimliği karışmıyor — accountRef adrese, externalRef alıcıya', async () => {
    // İki kimlik karışırsa mesaj kendi numaramıza gider ve sağlayıcı hata döndürmez.
    const meta = fakeMeta();
    await metaCloudSender(fakeCloudApiConfig(meta)).send(hedef, { conversationId: 'c1', text: 'merhaba' });

    expect(meta.calls[0]!.url).toContain('PNID-1');
    expect(meta.calls[0]!.body).toMatchObject({ to: '+33600000000' });
  });
});

describe('kanala göre jeton (08.09) — WhatsApp sistem jetonu, Messenger/IG Sayfa jetonu', () => {
  // Send API Messenger/Instagram'da sayfa jetonu ister; sahte Meta her çağrının jetonunu kaydeder.
  const messenger = { source: 'messenger', externalRef: 'PSID-1', accountRef: 'PAGE-1' } as const;
  const instagram = { source: 'instagram', externalRef: 'IGSID-1', accountRef: 'PAGE-1' } as const;
  const whatsapp = { source: 'whatsapp', externalRef: '+33600000000', accountRef: 'PNID-1' } as const;
  const girdi = { conversationId: 'c1', text: 'selam' };

  it('Messenger ve Instagram SAYFA jetonuyla, WhatsApp sistem jetonuyla gider', async () => {
    const meta = fakeMeta();
    const sender = metaCloudSender({ ...fakeCloudApiConfig(meta), pageToken: 'SAYFA-JETONU' });
    await sender.send(messenger, girdi);
    await sender.send(instagram, girdi);
    await sender.send(whatsapp, girdi);

    expect(meta.calls.map((c) => c.token)).toEqual(['SAYFA-JETONU', 'SAYFA-JETONU', 'FAKE-TOKEN']);
  });

  it('Sayfa jetonu YOKSA ya da boşsa Messenger sistem jetonuna düşer — ret Meta\'dan gelir, sessiz değil', async () => {
    const meta = fakeMeta();
    await metaCloudSender({ ...fakeCloudApiConfig(meta), pageToken: '   ' }).send(messenger, girdi);
    await metaCloudSender(fakeCloudApiConfig(meta)).send(messenger, girdi);

    expect(meta.calls.map((c) => c.token)).toEqual(['FAKE-TOKEN', 'FAKE-TOKEN']);
  });

  it('env kapısı: adlar tek yerde, boşluk "yok" sayılır, sistem jetonu yoksa sürücü yapılandırılmamış', () => {
    // Küresel env: önce oku, sonra geri koy.
    const eski = { token: process.env.META_ACCESS_TOKEN, page: process.env.META_PAGE_ACCESS_TOKEN };
    const geriKoy = (ad: string, deger: string | undefined) => {
      if (deger === undefined) delete process.env[ad];
      else process.env[ad] = deger;
    };
    try {
      process.env.META_ACCESS_TOKEN = ' SISTEM ';
      process.env.META_PAGE_ACCESS_TOKEN = '   ';
      expect(metaTokensFromEnv()).toEqual({ token: 'SISTEM', pageToken: null });
      expect(metaSenderFromEnv().name).toBe('meta-cloud-api');

      process.env.META_ACCESS_TOKEN = '';
      process.env.META_PAGE_ACCESS_TOKEN = 'SAYFA';
      // Sayfa jetonu tek başına yapılandırılmış saymaz: WhatsApp'ın ve çapa kodunun jetonu sistemdir.
      expect(metaSenderFromEnv()).toBe(unconfiguredSender);
    } finally {
      geriKoy('META_ACCESS_TOKEN', eski.token);
      geriKoy('META_PAGE_ACCESS_TOKEN', eski.page);
    }
  });
});
