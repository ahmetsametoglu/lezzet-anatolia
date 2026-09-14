import { keypadDelete, keypadDisplay, keypadFill, keypadFrom, keypadPress } from './keypad-value';

/*
  TUŞ TAKIMININ KURALLARI (v3 · `00-ortak`) — ekrandan ayrı ve ucuz ölçülüyor, çünkü hepsi PARA
  yazma kuralı: bir hatası kapıda yanlış tahsilat, kasada yanlış sayım demek.
*/

describe('ilk dokunuş mevcut tutarı EZER', () => {
  /* v3'ün kendi cümlesi: "ilk rakam mevcut tutarın yerine yazılır". Sebebi kapıda: alan motorun
     önerdiği tutarla dolu gelir ve kurye çoğu zaman onu DEĞİŞTİRİR, uzatmaz. */
  it('dolu alanda ilk rakam eskisini siler', () => {
    expect(keypadPress(keypadFrom('60,00'), '5').text).toBe('5');
  });

  it('ikinci rakam artık eklenir — ezme yalnız İLK dokunuştadır', () => {
    const first = keypadPress(keypadFrom('60,00'), '5');
    expect(keypadPress(first, '0').text).toBe('50');
  });

  it('ilk dokunuş virgülse "0," olur — kullanıcı kuruş yazmaya başlıyor', () => {
    expect(keypadPress(keypadFrom('60,00'), ',').text).toBe('0,');
  });
});

describe('virgül ve kuruş', () => {
  it('ikinci virgül YAZILMAZ', () => {
    const v = keypadPress(keypadPress(keypadFrom(''), '4'), ',');
    expect(keypadPress(v, ',').text).toBe('4,');
  });

  it('virgülden sonra en fazla iki hane', () => {
    let v = keypadFrom('');
    for (const key of ['4', ',', '5', '0']) v = keypadPress(v, key);
    expect(v.text).toBe('4,50');
    expect(keypadPress(v, '9').text).toBe('4,50'); // üçüncü hane yutulur
  });

  it('"00" tuşu iki hane birden yazar ama kuruş tavanını AŞMAZ', () => {
    expect(keypadPress(keypadPress(keypadFrom(''), '7'), '00').text).toBe('700');
    let v = keypadFrom('');
    for (const key of ['7', ',', '5']) v = keypadPress(v, key);
    // Kuruşta tek hane kaldı: "00" tuşunun yalnız BİR hanesi girer.
    expect(keypadPress(v, '00').text).toBe('7,50');
  });
});

describe('baştaki sıfır', () => {
  it('ikinci rakam gelince düşer — "05" değil "5"', () => {
    expect(keypadPress(keypadPress(keypadFrom(''), '0'), '5').text).toBe('5');
  });

  it('tek başına "0" MEŞRUDUR — bedelsiz teslim de bir tutardır', () => {
    expect(keypadPress(keypadFrom('12,00'), '0').text).toBe('0');
  });
});

describe('silme', () => {
  it('son karakteri atar', () => {
    expect(keypadDelete({ text: '4,50', fresh: false }).text).toBe('4,5');
  });

  /* Metin bitince hâl "taze"ye DÖNMEZ: kullanıcı alanı bilerek boşalttı, bir sonraki rakam da
     onun devamıdır — tazeye dönseydi ilk rakam "silinmiş" değeri geri getirir gibi davranırdı. */
  it('boşaldığında taze hâle DÖNMEZ', () => {
    const empty = keypadDelete({ text: '4', fresh: false });
    expect(empty.text).toBe('');
    expect(keypadPress(empty, '7').text).toBe('7');
  });
});

describe('beklenen tutar çipi', () => {
  it('alanı doldurur ve hâl artık TAZE DEĞİLDİR — kullanıcı o tutarı seçti', () => {
    const filled = keypadFill('39,80');
    expect(filled.text).toBe('39,80');
    expect(keypadPress(filled, '5').text).toBe('39,805'.slice(0, 5)); // ezmez, sürdürür
  });
});

describe('ekranda yazan', () => {
  it('boş metin "0" gösterir — alan ölü bir kutu gibi durmasın', () => {
    expect(keypadDisplay({ text: '', fresh: false })).toBe('0');
    expect(keypadDisplay({ text: '4,5', fresh: false })).toBe('4,5');
  });
});
