import { describe, expect, it } from 'vitest';
import { fakeCloudApiConfig, fakeMeta } from '@lezzet/notify/testing';
import { messageSenderFor, metaCloudSender, metaSenderFromEnv, metaTokensFromEnv } from './meta-sender';
import { unconfiguredSender } from './send';

/**
 * **"YAPILANDIRILMIŞ MI" KURALI** (15.8) — tek satırlık bir fonksiyon, ama taşıdığı karar ucuz değil.
 *
 * ── NEDEN SINANIYOR ─────────────────────────────────────────────────────────
 * İki tüketicisi var (backend cron'u, web action'ı) ve ikisi de env'den okuduğu değeri buraya
 * veriyor. Kural yanlış çalışırsa arıza SESSİZ olur: boş jetonla gerçek sürücü kurulur, sürücü her
 * çağrıda Meta'dan `190` yer ve teşhis "sağlayıcı hatası" diye okunur — oysa sebep bizim
 * yapılandırmamızdır. `unconfiguredSender` bunu adıyla söyler (`not_configured`) ve özerk motor da
 * o ada bakıp modu DEĞİŞTİRMEMEYE karar veriyor (`runAutonomousConversationReply` künyesi).
 *
 * Yani bu üç iddia, "jeton yok" hâlinin doğru adı taşımasını çiviliyor — yanlış ad, kuyruktaki her
 * sohbetin gereksiz yere insana devredilmesine kadar gidiyordu.
 */
describe('messageSenderFor — jeton var mı, sürücü hangisi', () => {
  it('jeton VARSA gerçek Cloud API sürücüsü döner', () => {
    expect(messageSenderFor('EAAG-gerçek-jeton').name).toBe(metaCloudSender({ token: 'x' }).name);
  });

  it('jeton YOKSA reddeden sürücü döner — sessizce "gönderdim" diyen bir sahte değil', () => {
    expect(messageSenderFor(undefined)).toBe(unconfiguredSender);
    expect(messageSenderFor(null)).toBe(unconfiguredSender);
  });

  it('BOŞ ve boşluklu dizge de "jeton yok" sayılır', () => {
    // `.env`'de `META_ACCESS_TOKEN=` satırı bırakmak jeton koymaktan farksız görünür ama değildir:
    // boş dizge doğruluk sınavını geçen bir değer olsaydı, gerçek sürücü jetonsuz kurulurdu.
    expect(messageSenderFor('')).toBe(unconfiguredSender);
    expect(messageSenderFor('   ')).toBe(unconfiguredSender);
  });
});

describe('çeviri katmanı — çağıranın söylediği sürücüye ULAŞIYOR mu (28.08)', () => {
  /*
    Bu dosyanın ikinci işi: `metaCloudSender` bir ÇEVİRMEN ve çevirmenin sessizce alan düşürmesi
    en pahalı arıza türü — istek gider, sağlayıcı reddeder, sebep bizde okunamaz.

    Gerçekten yaşandı: şablon dili istemciye HİÇ geçirilmiyordu ve varsayılan sabit `tr`ydi. Meta
    şablonu ad + dil ÇİFTİYLE arıyor, yani `en_US`te onaylanmış hiçbir şablon gönderilemiyordu ve
    hata `132001` ("şablon bulunamadı") diye geliyordu — şablon vardı, dili başkaydı. Alanın
    varlığını `cloud-api.test.ts` sınıyor; burada sınanan şey **köprünün kendisi**.
  */
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
    /* Aynı sınıf: bayrak burada düşseydi Messenger'a etiketsiz mesaj giderdi ve Meta pencere
       dışında reddederdi. Karar `send.ts`in, hesabı domain-core'un; bu satır yalnız köprüyü sınar. */
    const meta = fakeMeta();
    await metaCloudSender(fakeCloudApiConfig(meta)).send(
      { source: 'messenger', externalRef: 'PSID-1', accountRef: 'PAGE-1', humanAgent: true },
      { conversationId: 'c1', text: 'pazartesi cevabı' },
    );

    expect(meta.calls[0]!.body).toMatchObject({ messaging_type: 'MESSAGE_TAG', tag: 'HUMAN_AGENT' });
  });

  it('hedefin İKİ kimliği karışmıyor — accountRef adrese, externalRef alıcıya', async () => {
    /* Künyenin uyardığı tuzak: ikisi karışırsa mesaj KENDİ numaramıza gider ve sağlayıcı bunu hata
       olarak döndürmez — sessizce başka bir sohbete yazar. Hiçbir yerde kırmızı görünmez. */
    const meta = fakeMeta();
    await metaCloudSender(fakeCloudApiConfig(meta)).send(hedef, { conversationId: 'c1', text: 'merhaba' });

    expect(meta.calls[0]!.url).toContain('PNID-1');
    expect(meta.calls[0]!.body).toMatchObject({ to: '+33600000000' });
  });
});

describe('kanala göre jeton (08.09) — WhatsApp sistem jetonu, Messenger/IG Sayfa jetonu', () => {
  /*
    Ölçülen arıza: sistem jetonunda `pages_messaging` yoktu ve Messenger cevabı o jetonla gidecekti.
    Meta'nın Send API'si Sayfa jetonu ister; seçim tek yerde (`tokenForChannel`) ve bu üç iddia onu
    çiviliyor. Sahte Meta her çağrının jetonunu kaydediyor — "hangi jetonla gitti" doğrudan okunur.
  */
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
    // Küresel env: önce oku, sonra geri koy (deponun "boşa çek de bir varsayımdır" kuralı).
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
      // Sayfa jetonu tek başına "yapılandırılmış" saymaz: WhatsApp'ın ve çapa kodunun jetonu sistemdir.
      expect(metaSenderFromEnv()).toBe(unconfiguredSender);
    } finally {
      geriKoy('META_ACCESS_TOKEN', eski.token);
      geriKoy('META_PAGE_ACCESS_TOKEN', eski.page);
    }
  });
});
