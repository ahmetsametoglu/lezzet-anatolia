import { describe, expect, it } from 'vitest';
import { sendCloudApiMessage, type CloudApiMessage } from './cloud-api';
import { fakeCloudApiConfig, fakeMeta } from './testing';

/**
 * Gönderimin HTTP yarısı: sahte Meta eksik `messaging_product`, alıcısız istek, tanınmayan tip ve dilsiz şablonu Meta'nın kendi
 * koduyla (`100`) düşürür, yani bu dosya isteğin sözleşmeye uyduğunu sınar. Gerçek Meta'nın teslim ettiği ancak canlı gönderimle bilinir.
 */
const wa = (over: Partial<CloudApiMessage> = {}): CloudApiMessage => ({
  accountRef: '1227633040438008',
  to: '+33600000001',
  channel: 'whatsapp',
  text: 'Merhaba, siparişiniz hazır.',
  ...over,
});

const fb = (over: Partial<CloudApiMessage> = {}): CloudApiMessage => ({
  accountRef: '1297615503430731',
  to: 'PSID-1',
  channel: 'messenger',
  text: 'Merhaba!',
  ...over,
});

describe('WhatsApp gövdesi Meta sözleşmesine uyar', () => {
  it('metin gönderimi kabul edilir ve `wamid` geri döner', async () => {
    const meta = fakeMeta();
    const sonuc = await sendCloudApiMessage(fakeCloudApiConfig(meta), wa());

    expect(sonuc).toEqual({ ok: true, messageId: 'wamid.FAKE1' });
    // Kimliği ALAMAZSAK başarı sayılmaz: sağlayıcı kimliği olmayan satır, echo geri düştüğünde
    // ayırt edilemez ve aynı mesaj deftere iki kez yazılır.
    const call = meta.calls[0]!;
    expect(call.url).toContain('/1227633040438008/messages');
    expect(call.token).toBe('FAKE-TOKEN');
    expect(call.body).toMatchObject({ messaging_product: 'whatsapp', to: '+33600000001', type: 'text' });
  });

  it('KALIP mesaj dil zarfıyla gider — dil şablonun kimliğinin parçasıdır', async () => {
    // Aynı şablon adı farklı dillerde AYRI onaylanır; dilsiz istek Meta tarafından reddedilir ve
    // sahte de tam olarak öyle davranıyor (aşağıdaki negatif iddia bunu kanıtlıyor).
    const meta = fakeMeta();
    const sonuc = await sendCloudApiMessage(fakeCloudApiConfig(meta), wa({ text: null, templateName: 'siparis_onayi' }));

    expect(sonuc.ok).toBe(true);
    expect(meta.calls[0]!.body).toMatchObject({
      type: 'template',
      template: { name: 'siparis_onayi', language: { code: 'tr' } },
    });
  });

  it('şablon dili ÇAĞIRANDAN gelir — sabit "tr" varsayımı `en_US` şablonlarını gönderemiyordu', async () => {
    /* Meta şablonu ad ve dil çiftiyle arar: dil geçirilmezse başka dilde onaylı şablon `132001` ("şablon bulunamadı") ile düşer ve
       sebep bizdeyken sağlayıcı arızası gibi okunur. */
    const meta = fakeMeta();
    const sonuc = await sendCloudApiMessage(
      fakeCloudApiConfig(meta),
      wa({ text: null, templateName: 'hello_world', templateLanguage: 'en_US' }),
    );

    expect(sonuc.ok).toBe(true);
    expect(meta.calls[0]!.body).toMatchObject({
      type: 'template',
      template: { name: 'hello_world', language: { code: 'en_US' } },
    });
  });

  it('dil GEÇİLMEZSE `tr`ye düşer — varsayılanın kaybolmadığı da bir iddiadır', async () => {
    // Üstteki testin karşı yakası: dil parametrik oldu diye varsayılanı kaybetmiş olmayalım.
    // Çağıranların çoğu Türkçe şablon gönderiyor ve her çağrıda dil yazmak zorunda kalmamalı.
    const meta = fakeMeta();
    await sendCloudApiMessage(fakeCloudApiConfig(meta), wa({ text: null, templateName: 'siparis_onayi' }));
    expect(meta.calls[0]!.body).toMatchObject({ template: { language: { code: 'tr' } } });
  });

  it('interaktif kart HAM hâliyle geçer — burada yeniden şekillendirilmez', async () => {
    // Sağlayıcının sözleşmesini ikinci kez yazmak, Meta kartın şeklini değiştirdiği gün iki yerde
    // birden düzeltme demekti.
    const meta = fakeMeta();
    const kart = { type: 'button', body: { text: 'Onaylıyor musunuz?' }, action: { buttons: [] } };
    const sonuc = await sendCloudApiMessage(fakeCloudApiConfig(meta), wa({ text: null, interactive: kart }));

    expect(sonuc.ok).toBe(true);
    expect(meta.calls[0]!.body).toMatchObject({ type: 'interactive', interactive: kart });
  });
});

describe('Messenger/Instagram gövdesi AYRI — alıcı `recipient.id`de', () => {
  it('metin gönderimi kabul edilir ve `m_` kimliği döner', async () => {
    const meta = fakeMeta();
    const sonuc = await sendCloudApiMessage(fakeCloudApiConfig(meta), fb());

    expect(sonuc).toEqual({ ok: true, messageId: 'm_FAKE1' });
    expect(meta.calls[0]!.body).toMatchObject({
      recipient: { id: 'PSID-1' },
      // Bu bir CEVAPTIR, işletme-başlatan mesaj değil: alan boşsa Meta reddediyor, yanlış değer
      // ("UPDATE") ise pencere dışında etiket/ücret kurallarına takılır.
      messaging_type: 'RESPONSE',
      message: { text: 'Merhaba!' },
    });
    // WhatsApp'ın zorunlu alanı buraya SIZMAMALI: iki kanal iki sözleşmedir.
    expect(meta.calls[0]!.body.messaging_product).toBeUndefined();
  });

  it('Instagram aynı gövdeyi kullanır — kanal ayrımı ADRESTE, şekilde değil', async () => {
    const meta = fakeMeta();
    const sonuc = await sendCloudApiMessage(fakeCloudApiConfig(meta), fb({ channel: 'instagram', to: 'IGSID-9' }));
    expect(sonuc.ok).toBe(true);
    expect(meta.calls[0]!.body).toMatchObject({ recipient: { id: 'IGSID-9' } });
  });

  // Instagram hesabının kimliğine gönderim Meta'da `(#3) Application does not have the capability` ile düşer.
  it('Instagram cevabı kayıttaki Instagram hesabına değil sayfa jetonunun sayfasına (`/me`) gider', async () => {
    const meta = fakeMeta();
    await sendCloudApiMessage(fakeCloudApiConfig(meta), fb({ channel: 'instagram', accountRef: '17841400000000000', to: 'IGSID-9' }));
    expect(new URL(meta.calls[0]!.url).pathname).toMatch(/\/me\/messages$/);
  });

  it('insan-temsilci etiketi İKİ alanı birden değiştirir (28.08)', async () => {
    /* `messaging_type` ile `tag` birlikte yazılır: etiketsiz `MESSAGE_TAG` da, `RESPONSE` yanında
       duran bir `tag` de Meta tarafında reddedilir. Yarım yazım en tehlikelisi — istek gider,
       sağlayıcı reddeder ve sebep bizim tarafta okunamaz. */
    const meta = fakeMeta();
    await sendCloudApiMessage(fakeCloudApiConfig(meta), fb({ humanAgent: true }));
    expect(meta.calls[0]!.body).toMatchObject({
      recipient: { id: 'PSID-1' },
      messaging_type: 'MESSAGE_TAG',
      tag: 'HUMAN_AGENT',
      message: { text: 'Merhaba!' },
    });
  });

  it('etiket İSTENMEDİKÇE yazılmaz — `RESPONSE` varsayılan kalır', async () => {
    // Her mesajı etiketlemek, etiketin dayandığı gerekçeyi (insan temsilci devrede, pencere kapalı)
    // yalan yapardı; Meta bu etiketin kötüye kullanımını denetliyor.
    const meta = fakeMeta();
    await sendCloudApiMessage(fakeCloudApiConfig(meta), fb());
    expect(meta.calls[0]!.body.messaging_type).toBe('RESPONSE');
    expect(meta.calls[0]!.body.tag).toBeUndefined();
  });

  it('WhatsApp gövdesine etiket SIZMAZ — orada karşılığı ücretli şablondur', async () => {
    const meta = fakeMeta();
    await sendCloudApiMessage(fakeCloudApiConfig(meta), fb({ channel: 'whatsapp', to: '+33600000000', humanAgent: true }));
    expect(meta.calls[0]!.body.tag).toBeUndefined();
    expect(meta.calls[0]!.body.messaging_type).toBeUndefined();
  });
});

describe('hata sınıflandırması — "yeniden dene" düğmesi doğru yere konsun', () => {
  it('hız sınırı (429) DENENEBİLİR', async () => {
    const meta = fakeMeta();
    meta.failNext({ status: 429, code: 80007, message: 'Rate limit hit' });
    const sonuc = await sendCloudApiMessage(fakeCloudApiConfig(meta), wa());

    expect(sonuc).toMatchObject({ ok: false, retryable: true });
  });

  it('geçersiz jeton (190) DENENMEZ — aynı sonucu verir', async () => {
    const meta = fakeMeta();
    meta.failNext({ status: 401, code: 190, message: 'Invalid OAuth access token' });
    const sonuc = await sendCloudApiMessage(fakeCloudApiConfig(meta), wa());

    expect(sonuc).toMatchObject({ ok: false, retryable: false });
    expect((sonuc as { reason: string }).reason).toContain('meta_190');
  });

  it('pencere dışı serbest metin (131047) DENENMEZ — kural ihlali', async () => {
    // Kapımız bunu zaten önden reddediyor (`send.ts`); yine de sağlayıcı söylerse tekrar denemek
    // aynı hatayı para ve gürültüyle tekrarlamak olurdu.
    const meta = fakeMeta();
    meta.failNext({ status: 400, code: 131047, message: 'Re-engagement message' });
    expect(await sendCloudApiMessage(fakeCloudApiConfig(meta), wa())).toMatchObject({ retryable: false });
  });

  it('TANINMAYAN kod denenebilir sayılır — bilinmeyeni kalıcı ilan etmek mesajı çöpe atar', async () => {
    const meta = fakeMeta();
    meta.failNext({ status: 400, code: 999999, message: 'Yeni bir hata' });
    expect(await sendCloudApiMessage(fakeCloudApiConfig(meta), wa())).toMatchObject({ retryable: true });
  });

  it('ağ hatası DENENEBİLİR — mesajın gidip gitmediği bilinmiyor', async () => {
    const patlayan = (async () => {
      throw new Error('ECONNRESET');
    }) as unknown as typeof fetch;
    const sonuc = await sendCloudApiMessage({ token: 'T', fetchImpl: patlayan }, wa());
    expect(sonuc).toMatchObject({ ok: false, retryable: true });
    expect((sonuc as { reason: string }).reason).toContain('network_error');
  });
});

describe('sahte Meta HAKEMDİR — bozuk isteği o da reddeder', () => {
  it('jetonsuz istek 190 ile düşer', async () => {
    const meta = fakeMeta();
    const sonuc = await sendCloudApiMessage({ ...fakeCloudApiConfig(meta), token: '' }, wa());
    expect(sonuc).toMatchObject({ ok: false, retryable: false });
  });

  it('BOŞ metin reddedilir — "gönderdim" diyen boş bir mesaj olamaz', async () => {
    const meta = fakeMeta();
    const sonuc = await sendCloudApiMessage(fakeCloudApiConfig(meta), wa({ text: null }));
    expect(sonuc).toMatchObject({ ok: false });
    expect((sonuc as { reason: string }).reason).toContain('text.body');
  });

  it('ardışık gönderimler AYRI kimlik alır — aynı kimlik sahte bir "çift yazım" üretirdi', async () => {
    const meta = fakeMeta();
    const a = await sendCloudApiMessage(fakeCloudApiConfig(meta), wa());
    const b = await sendCloudApiMessage(fakeCloudApiConfig(meta), wa());
    expect(a).not.toEqual(b);
  });
});
