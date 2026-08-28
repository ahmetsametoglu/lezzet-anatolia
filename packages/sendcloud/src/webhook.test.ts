import { describe, expect, it } from 'vitest';
import { parseWebhookIdentity, signWebhookBody, verifyWebhookSignature } from './webhook';

describe('signWebhookBody', () => {
  /**
   * **Sağlayıcının kendi yayımladığı vektör** (doküman 28.08, PHP ve Python örnekleri):
   * gövde `{"key": "value"}`, anahtar `secretkey` → aşağıdaki hex. Testin değeri şurada: imzayı
   * biz "doğru sandığımız" bir hesapla değil, KARŞI TARAFIN yayımladığı sonuçla eşliyoruz.
   */
  it('dokümandaki vektörü birebir üretir', () => {
    expect(signWebhookBody('secretkey', '{"key": "value"}')).toBe('1eed4b3d41f4653ac64fd56f1bf1cbfd349e4482cbc11dff7134bd93e5da4b0a');
  });

  /**
   * **GÖVDE HAM OKUNMALI.** Aynı nesnenin bizim `JSON.stringify`ımızla üretilen hâli (boşluksuz)
   * BAŞKA bir özet veriyor — ölçüldü. Yani `req.json()` ile okuyup yeniden diziye çevirmek her
   * imzayı geçersiz kılardı ve arıza "Sendcloud imzası tutmuyor" diye görünürdü.
   */
  it('boşluk bile özeti değiştirir — bu yüzden req.text() şart', () => {
    expect(signWebhookBody('secretkey', JSON.stringify({ key: 'value' }))).not.toBe(signWebhookBody('secretkey', '{"key": "value"}'));
  });
});

describe('verifyWebhookSignature', () => {
  const body = '{"parcel": {"id": 42}}';
  const secret = 'sec';

  it('doğru imza geçer', () => {
    expect(verifyWebhookSignature(secret, body, signWebhookBody(secret, body))).toBe(true);
  });

  it('büyük harfli hex de geçer', () => {
    expect(verifyWebhookSignature(secret, body, signWebhookBody(secret, body).toUpperCase())).toBe(true);
  });

  it('yanlış anahtar, oynanmış gövde ve kırpılmış imza reddedilir', () => {
    expect(verifyWebhookSignature('baska', body, signWebhookBody(secret, body))).toBe(false);
    expect(verifyWebhookSignature(secret, '{"parcel": {"id": 43}}', signWebhookBody(secret, body))).toBe(false);
    // Uzunluk farkı `timingSafeEqual`ı FIRLATIR — kapı onu önce eliyor, yoksa 500 dönerdi.
    expect(verifyWebhookSignature(secret, body, signWebhookBody(secret, body).slice(0, 40))).toBe(false);
  });

  it('anahtar ya da başlık yoksa DOĞRULANAMADI = HAYIR', () => {
    expect(verifyWebhookSignature(undefined, body, signWebhookBody(secret, body))).toBe(false);
    expect(verifyWebhookSignature('', body, 'abc')).toBe(false);
    expect(verifyWebhookSignature(secret, body, null)).toBe(false);
  });
});

describe('parseWebhookIdentity', () => {
  it('klasik zarftan koli kimliğini çıkarır', () => {
    const id = parseWebhookIdentity(
      JSON.stringify({ action: 'parcel_status_changed', timestamp: 1735689600, parcel: { id: 123, tracking_number: 'TR1', status: { code: 'DELIVERED' } } }),
    );
    expect(id).toEqual({ parcelId: '123', trackingNumber: 'TR1', action: 'parcel_status_changed', eventId: '123:1735689600', reportedCode: 'DELIVERED' });
  });

  it('v3 zarfı ve çıplak koli nesnesi de okunur — şema belgeli değil, tolerans bilinçli', () => {
    expect(parseWebhookIdentity(JSON.stringify({ timestamp: 9, data: { id: 'p1' } }))?.parcelId).toBe('p1');
    expect(parseWebhookIdentity(JSON.stringify({ timestamp: 9, id: 'p2' }))?.parcelId).toBe('p2');
  });

  it('aynı olay aynı anahtarı, farklı damga farklı anahtarı üretir', () => {
    const bir = parseWebhookIdentity(JSON.stringify({ timestamp: 5, parcel: { id: 7 } }))!;
    const ayni = parseWebhookIdentity(JSON.stringify({ timestamp: 5, parcel: { id: 7 } }))!;
    const sonra = parseWebhookIdentity(JSON.stringify({ timestamp: 6, parcel: { id: 7 } }))!;
    expect(ayni.eventId).toBe(bir.eventId);
    expect(sonra.eventId).not.toBe(bir.eventId);
  });

  it('damga yoksa anahtar gövdenin özetinden kurulur — uydurulmaz', () => {
    const a = parseWebhookIdentity(JSON.stringify({ parcel: { id: 7, status: { code: 'SORTED' } } }))!;
    const b = parseWebhookIdentity(JSON.stringify({ parcel: { id: 7, status: { code: 'DELIVERED' } } }))!;
    expect(a.eventId).not.toBe(b.eventId);
    // Aynı gövde iki kez gelirse aynı anahtar — idempotens defteri ikinciyi eler.
    expect(parseWebhookIdentity(JSON.stringify({ parcel: { id: 7, status: { code: 'SORTED' } } }))!.eventId).toBe(a.eventId);
  });

  it('koli kimliği yoksa olay REDDEDİLİR — eşleşmeyen olay "işlendi" sayılmaz', () => {
    expect(parseWebhookIdentity(JSON.stringify({ action: 'integration_connected' }))).toBeNull();
    expect(parseWebhookIdentity(JSON.stringify({ parcel: { tracking_number: 'TR1' } }))).toBeNull();
    expect(parseWebhookIdentity('bu json değil')).toBeNull();
    expect(parseWebhookIdentity('[]')).toBeNull();
  });
});
