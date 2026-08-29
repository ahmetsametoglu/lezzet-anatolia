import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { verifyMetaSignature } from './meta-webhook';

/*
  Meta webhook imzası (15.7 · test dalgası 15.18).

  Bu test bir hijyen kontrolü değil, KİMLİK KURGUSUNUN nöbetçisi. `04.10`'un güvenlik kodu
  "kod doğru **ve** doğru numaradan geldi" şartına dayanıyor; numaranın doğruluğunu bize Meta
  beyan ediyor ve o beyana ancak imza doğruysa güvenilir. İmza gevşerse, imzasız uca "şu
  numaradan geliyorum" diyebilen birine karşı geriye yalnız 6 haneyi tahmin etmek kalır.

  Beş hâl 21.08'de elle ölçülmüştü ve teste dönmemişti; bu dosya o borcu kapatıyor.

  DOSYA `apps/web/lib` ALTINDA AMA DB'SİZ: `verifyMetaSignature` saf bir fonksiyon
  (`node:crypto` + dize). Bu yüzden `vitest.config.ts`in `WEB_LIB_DBSIZ` listesine yazıldı —
  liste olmadan test entegrasyon projesine düşer ve şeridin kendisi koşamaz (`CLAUDE §4b`).
*/

const SECRET = 'test-app-secret';
const BODY = JSON.stringify({ object: 'whatsapp_business_account', entry: [{ id: 'x' }] });
const sign = (body: string, secret = SECRET) => `sha256=${createHmac('sha256', secret).update(body, 'utf8').digest('hex')}`;

describe('verifyMetaSignature', () => {
  it('doğru imza kabul edilir', () => {
    expect(verifyMetaSignature(BODY, sign(BODY), SECRET)).toBe(true);
  });

  it('gövde OYNANIRSA reddedilir', () => {
    // Meta'nın imzaladığı gövde ile bizim okuduğumuz gövde aynı olmalı; tek karakter bile yeter.
    const signature = sign(BODY);
    expect(verifyMetaSignature(`${BODY} `, signature, SECRET)).toBe(false);
    expect(verifyMetaSignature(BODY.replace('whatsapp', 'whatsapq'), signature, SECRET)).toBe(false);
  });

  it('YANLIŞ sırla üretilmiş imza reddedilir', () => {
    expect(verifyMetaSignature(BODY, sign(BODY, 'baska-sir'), SECRET)).toBe(false);
  });

  it('başlık yoksa reddedilir', () => {
    expect(verifyMetaSignature(BODY, null, SECRET)).toBe(false);
    expect(verifyMetaSignature(BODY, '', SECRET)).toBe(false);
  });

  it('`sha1=` öneki reddedilir — algoritma düşürülemez', () => {
    // Meta `sha1` de yollayabiliyor; kabul etmek zayıf algoritmaya sessiz geçiş olurdu.
    const sha1ish = `sha1=${createHmac('sha1', SECRET).update(BODY, 'utf8').digest('hex')}`;
    expect(verifyMetaSignature(BODY, sha1ish, SECRET)).toBe(false);
  });

  it('öneksiz ham özet reddedilir', () => {
    const raw = createHmac('sha256', SECRET).update(BODY, 'utf8').digest('hex');
    expect(verifyMetaSignature(BODY, raw, SECRET)).toBe(false);
  });

  it('UZUNLUĞU farklı imzada erken döner ve PATLAMAZ', () => {
    // `timingSafeEqual` eşit olmayan uzunlukta FIRLATIR; erken dönüş olmasaydı uç nokta 401 yerine
    // 500 verir, Meta da olayı 7 gün boyunca yeniden denerdi.
    expect(() => verifyMetaSignature(BODY, 'sha256=kisa', SECRET)).not.toThrow();
    expect(verifyMetaSignature(BODY, 'sha256=kisa', SECRET)).toBe(false);
    expect(verifyMetaSignature(BODY, `sha256=${'a'.repeat(200)}`, SECRET)).toBe(false);
  });

  it('boş gövde de doğru imzayla kabul edilir', () => {
    // Meta boş gövde yollamaz ama kapı bunu bir istisna gibi ele almamalı: kural imzadır, içerik değil.
    expect(verifyMetaSignature('', sign(''), SECRET)).toBe(true);
  });
});
