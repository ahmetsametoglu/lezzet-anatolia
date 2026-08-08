import { base64ToBytes } from './base64';

/*
  Çevrim kanıt yükleme yolunun tam ortasında duruyor: bozuk bir çözüm, kovaya AÇILAMAYAN bir görsel
  yazar ve bunu ancak ihtilaf gününde öğrenirdik. O yüzden bilinen sabitlerle ölçülüyor.
*/

describe('base64 → bayt', () => {
  it('bilinen metni bayt bayt çözer', () => {
    // "Man" → "TWFu" (RFC 4648'in kanonik örneği), dolgu gerekmez.
    expect([...base64ToBytes('TWFu')]).toEqual([77, 97, 110]);
  });

  it('dolguyu ve satır sonlarını yok sayar', () => {
    expect([...base64ToBytes('TWE=')]).toEqual([77, 97]);
    expect([...base64ToBytes('TQ==')]).toEqual([77]);
    expect([...base64ToBytes('TWFu\nTWFu')]).toEqual([77, 97, 110, 77, 97, 110]);
  });

  it('PNG imzasını doğru çözer — yükleme yolunun gerçek girdisi', () => {
    // `iVBORw0KGgo=` her PNG dosyasının ilk sekiz baytıdır.
    expect([...base64ToBytes('iVBORw0KGgo=')]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  });

  it('tanınmayan karakterde SESSİZCE atlamaz, fırlatır', () => {
    expect(() => base64ToBytes('TW*u')).toThrow(/tanınmayan karakter/);
  });
});
