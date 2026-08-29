import { describe, expect, it } from 'vitest';
import { fakeCloudApiConfig, fakeMeta } from '@lezzet/notify/testing';
import { messageSenderFor, metaCloudSender } from './meta-sender';
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
