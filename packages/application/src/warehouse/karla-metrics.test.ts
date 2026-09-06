import { describe, expect, it } from 'vitest';
import { fitMm, textWidthMm, wrapMm } from './karla-metrics';
import { readTtfAdvances } from './ttf-advances';

/*
  ETİKET TİPOGRAFİSİNİN ÖLÇÜSÜ (06.09) — kullanıcı bulgusunun testi.

  Arıza: satır genişliği tek bir ORTALAMA karakter genişliğiyle hesaplanıyordu ve ortalama bir
  SINIR koyamaz — "Güney Hattı — Mulhouse" baştan sona geniş harf, ortalamayı %30 aşıyor ve ad
  kâğıdın dışına taşıyordu. Aşağıdaki iddialar ölçünün gerçekten fontun kendisinden geldiğini ve
  kırmanın kelimeden bölündüğünü çiviliyor.

  Sayısal beklentiler MUTLAK DEĞİL, İLİŞKİSEL yazıldı: yazı tipinin sürümü değişirse birkaç
  binde bir oynar ve mutlak bir sayı testi o gün kırmızıya döner — oysa kural "M, i'den geniştir"
  ve o kural fontun sürümünden bağımsızdır. Tek mutlak sınır ölçünün MAKUL ARALIĞI.
*/

describe('textWidthMm', () => {
  it('genişlik fontun kendi tablosundan geliyor — harfler birbirinden farklı', () => {
    // Geniş/dar harf ilişkisi Karla'nın tasarımıdır; ortalama bir çarpan bu farkı hiç göremezdi.
    expect(textWidthMm('M', 10)).toBeGreaterThan(textWidthMm('i', 10) * 2);
    expect(textWidthMm('W', 10)).toBeGreaterThan(textWidthMm('l', 10) * 2);
    // Yarı kalın DAHA geniş — şablon başlıkları 600 ile basıyor ve o fark hesaba girmeli.
    expect(textWidthMm('Strasbourg', 10, 600)).toBeGreaterThan(textWidthMm('Strasbourg', 10, 400));
  });

  it('punto ile doğru orantılı ve boş metin sıfır', () => {
    expect(textWidthMm('', 10)).toBe(0);
    expect(textWidthMm('Mangolu', 8)).toBeCloseTo(textWidthMm('Mangolu', 4) * 2, 6);
  });

  it('ölçü MAKUL aralıkta — em başına 0,3 ile 0,8 arası', () => {
    /* Bir üst sınır testi: `unitsPerEm` yanlış okunsaydı sayılar 100 kat şişer ya da sıfıra
       düşerdi ve ilişkisel iddiaların hepsi yine geçerdi. Bu satır o sessiz hatayı yakalar. */
    const emBasina = textWidthMm('Strasbourg Merkez', 1) / 'Strasbourg Merkez'.length;
    expect(emBasina).toBeGreaterThan(0.3);
    expect(emBasina).toBeLessThan(0.8);
  });

  it('Türkçe ve Fransızca harfler tanınıyor — yedeğe düşmüyorlar', () => {
    // Tanınmayan harf "M" genişliğine (≈0,85 em) düşer; "ı" ondan çok dar olmalı.
    expect(textWidthMm('ı', 10)).toBeLessThan(textWidthMm('M', 10) / 2);
    expect(textWidthMm('é', 10)).toBeCloseTo(textWidthMm('e', 10), 6);
    expect(textWidthMm('ş', 10)).toBeCloseTo(textWidthMm('s', 10), 6);
  });
});

describe('fitMm', () => {
  it('sığan metne dokunmaz', () => {
    expect(fitMm('kısa', 100, 4)).toBe('kısa');
  });

  it('taşan metni keser ve sonuç GERÇEKTEN sığar — üç nokta dahil', () => {
    const kesilen = fitMm('Antepfıstıklı Baklava Tepsisi Büyük Boy', 30, 4);
    expect(kesilen.endsWith('…')).toBe(true);
    expect(textWidthMm(kesilen, 4)).toBeLessThanOrEqual(30);
  });

  it('hiç yer yoksa üç nokta kalır — boş satır bir şey söylemezdi', () => {
    expect(fitMm('Mangolu', 0.1, 4)).toBe('…');
  });
});

describe('wrapMm', () => {
  it('kelime sınırından böler ve her satır sığar', () => {
    const satirlar = wrapMm('Güney Hattı — Mulhouse üzeri Saint-Louis', 40, 3.8, 2);
    expect(satirlar.length).toBe(2);
    for (const satir of satirlar) expect(textWidthMm(satir, 3.8)).toBeLessThanOrEqual(40);
    // Kelimeler bölünmemiş olmalı: birleştirince metnin başı aynen çıkar.
    expect(satirlar[0]).toBe('Güney Hattı —');
  });

  it('satır tavanını aşmaz — kalan SON satıra sığdırılıp kesilir', () => {
    const satirlar = wrapMm('bir iki üç dört beş altı yedi sekiz dokuz on', 20, 3.8, 2);
    expect(satirlar.length).toBe(2);
    expect(satirlar[1]!.endsWith('…')).toBe(true);
  });

  it('tek satırlık tavan `fitMm` ile aynı şeyi yapar', () => {
    const metin = 'Antepfıstıklı Baklava Tepsisi';
    expect(wrapMm(metin, 25, 3.8, 1)).toEqual([fitMm(metin, 25, 3.8)]);
  });

  it('bölünecek yeri olmayan uzun kelime kendi satırında kesilir', () => {
    const satirlar = wrapMm('LA26COKUZUNBIRTEKKELIMEREFERANSI', 15, 3.8, 2);
    expect(satirlar.length).toBe(1);
    expect(satirlar[0]!.endsWith('…')).toBe(true);
    expect(textWidthMm(satirlar[0]!, 3.8)).toBeLessThanOrEqual(15);
  });

  it('aynı kelime tekrar ederse kalanı YANLIŞ yerden kesmez', () => {
    /* Eski hâl kalanı `indexOf` ile buluyordu ve o, kelimenin İLK geçtiği yeri döndürür:
       tekrarlı bir adda ikinci satır baştan başlardı. */
    const satirlar = wrapMm('Kek 9 × 90 g Kek 9 × 90 g Kek', 18, 3.8, 2);
    expect(satirlar[1]).not.toContain('Kek 9 × 90 g Kek 9');
  });
});

describe('readTtfAdvances', () => {
  it('yazı tipi okunamazsa FIRLATIR — sessizce sıfır dönmez', () => {
    /* Sessiz sıfır en tehlikeli hâl olurdu: bütün metinler "sıfır genişlik" sayılır, her satır
       kâğıda sığar görünür ve arıza ancak kâğıtta ortaya çıkardı. */
    expect(() => readTtfAdvances(new Uint8Array(64))).toThrow(/yazı tipi okunamadı/);
  });
});
