import { describe, expect, it } from 'vitest';
import { assertCheckDigit, ean13CheckDigit, ean13Modules, gtin14CheckDigit, itf14Modules, modulesToSvg } from './barcode-svg';
import { TEST_LABELS } from './seed/test-labels';

/*
  ÇİZGİLİ BARKOD KODLAMASI — burada bir hata KÂĞIDA basılır ve ancak depoda, kamera hiç tepki
  vermeyince fark edilir. Sağlama basamağı tutmayan kodu okuyucu SESSİZCE yutar: ekranda hata
  çıkmaz, kimse sebebini aramaz (yaşandı 24.08 — elde basılı koli etiketi geçersiz bir GTIN-14'tü).

  Testin asıl işi bu yüzden iki şey: kodlamanın doğruluğu ve SETİN basılabilirliği.
*/

describe('sağlama basamağı', () => {
  it('EAN-13 ağırlıkları soldan 1,3,1,3… ile sayar', () => {
    // Elle doğrulanmış: 8+18+9+3+0+0+0+0+0+21+9+3 = 71 → (10 − 1) = 9.
    expect(ean13CheckDigit('869100000791')).toBe(9);
    // Toplam 10'un katıysa basamak 0'dır — (10 − 0) % 10 kuralı burada ölçülüyor.
    expect(ean13CheckDigit('000000000000')).toBe(0);
  });

  it('GTIN-14 ağırlıkları soldan 3,1,3,1… ile sayar (EAN ile TERS)', () => {
    // Ters ağırlık kritik: EAN kuralını GTIN'e uygulamak 24.08'de geçersiz bir koli kodu üretmişti.
    expect(gtin14CheckDigit('1869100004751')).toBe(6);
  });

  it('geçersiz kodu FIRLATIR ve doğrusunu söyler — sessiz kâğıt israfı olmasın', () => {
    // 24.08'de elde basılı olan kod: son hane 4, doğrusu 6.
    expect(() => assertCheckDigit('18691000047514', 'itf14')).toThrow(/18691000047516/);
    expect(() => assertCheckDigit('8691000007910', 'ean13')).toThrow(/tutmuyor/);
  });

  it('yanlış uzunluğu ve rakam olmayanı reddeder', () => {
    expect(() => assertCheckDigit('869100000791', 'ean13')).toThrow(/13 haneli/);
    expect(() => assertCheckDigit('TEST-TANINMAYAN-01', 'ean13')).toThrow(/rakam/);
    // 13 haneli geçerli bir EAN, ITF-14 olarak basılamaz: hane sayısı çift olmak zorunda.
    expect(() => assertCheckDigit('8691000007919', 'itf14')).toThrow(/14 haneli/);
  });
});

describe('EAN-13 modülleri', () => {
  it('tam 95 modül üretir — simgenin sabit genişliği', () => {
    const { bits } = ean13Modules('8691000007919');
    expect(bits).toHaveLength(95);
  });

  it('guard çubukları standart yerlerinde (başta, ortada, sonda)', () => {
    const { bits, guardIndexes } = ean13Modules('8691000007919');
    expect(bits.slice(0, 3)).toBe('101');
    expect(bits.slice(45, 50)).toBe('01010');
    expect(bits.slice(92)).toBe('101');
    expect(guardIndexes).toContain(0);
    expect(guardIndexes).toContain(45);
    expect(guardIndexes).toContain(94);
  });

  it('İLK hane çizilmez, PARİTEDE saklanır', () => {
    /*
      İki kodun 2–7. haneleri AYNI ('691000'), yalnız ilk hane farklı. İlk hane hiçbir çubuk
      üretmez — sol yarının L/G desenini seçer. Yani sol yarı FARKLI çizilmeli.

      EAN-13'ün en kolay yanlış yazılan yeri burası: 12 haneyi çizip 13.'yü unutmak, OKUNAN ama
      YANLIŞ ürünü gösteren bir kod üretir — kâğıtta da ekranda da hata görünmez.
    */
    const kod = (govde12: string): string => `${govde12}${ean13CheckDigit(govde12)}`;
    const ilkHane0 = ean13Modules(kod('069100000791'));
    const ilkHane8 = ean13Modules(kod('869100000791'));

    expect(ilkHane0.bits.slice(3, 45)).not.toBe(ilkHane8.bits.slice(3, 45));
    /*
      Sağ yarı pariteden ETKİLENMEZ (hepsi R kodlaması) — ama son hanesi SAĞLAMA BASAMAĞIDIR ve
      gövde değişince o da değişir (ölçüldü: 7 ⟷ 9). Karşılaştırma bu yüzden son haneyi dışarıda
      bırakır: 6 haneden ilk 5'i, yani 5 × 7 = 35 modül.
    */
    expect(ilkHane0.bits.slice(50, 85)).toBe(ilkHane8.bits.slice(50, 85));
  });
});

describe('ITF-14 modülleri', () => {
  it('start ve stop desenleriyle çerçevelenir', () => {
    const { bits } = itf14Modules('18691000047516');
    expect(bits.startsWith('1010')).toBe(true);
    // Stop: geniş çubuk + dar boşluk + dar çubuk.
    expect(bits.endsWith('11101')).toBe(true);
  });

  it('haneleri ÇİFTLER hâlinde geçmeli kodlar — çubuk/boşluk sayısı hane sayısından türer', () => {
    const { bits } = itf14Modules('18691000047516');
    // 14 hane = 7 çift; her çift 5 çubuk + 5 boşluk üretir. Genişlikler 1 ve 3 olduğundan toplam
    // uzunluk sabit değil ama çift sayıda geçiş içermeli ve boş olmamalı.
    expect(bits.length).toBeGreaterThan(4 + 7 * 10);
    expect(bits).toMatch(/^[01]+$/);
  });
});

describe('SVG çizimi', () => {
  it('bitişik modülleri TEK dikdörtgende birleştirir — rasterde saç teli boşluk kalmasın', () => {
    // Ayrı çizilen komşu çubuklar arasında yarım piksel boşluk kalır ve okuyucu onu "ince çubuk"
    // sanar; kod bozulur. Birleştirme bu yüzden bir optimizasyon değil, DOĞRULUK şartı.
    const svg = modulesToSvg({ bits: '111', guardIndexes: [] }, { widthMm: 30, heightMm: 10, x: 0, y: 0 });
    expect(svg.match(/<rect/g)).toHaveLength(1);
  });

  it('guard çubukları AYRI dikdörtgen olur — daha uzun çizilecekler', () => {
    const svg = modulesToSvg({ bits: '11', guardIndexes: [0] }, { widthMm: 30, heightMm: 10, x: 0, y: 0 });
    expect(svg.match(/<rect/g)).toHaveLength(2);
  });

  it('boşluk çizmez — yalnız mürekkep', () => {
    expect(modulesToSvg({ bits: '000', guardIndexes: [] }, { widthMm: 30, heightMm: 10, x: 0, y: 0 })).toBe('');
  });
});

describe('FİZİKSEL SET basılabilir', () => {
  /*
    En değerli iddia bu: set bozulursa (biri kodu elle değiştirir, sağlama basamağını unutur)
    hata KÂĞIDA gitmeden burada çıkar. Etiketler kalıcı — yanlış basılan bir set sessizce
    çalışmayan bir test düzeneği demek.
  */
  it('çizgili simgeli her etiketin sağlama basamağı geçerli', () => {
    for (const label of TEST_LABELS) {
      // Alanlar ÖNCE ayrıştırılıyor: `label.symbology` daraltması `expect`in içindeki closure'a
      // geçmiyor (TS callback'in ne zaman çağrılacağını bilemez) ve `'qr'` orada hâlâ olası
      // görünüyordu. Ayrıştırılmış `const` daraltmayı korur.
      const { code, symbology } = label;
      if (symbology === 'qr') continue;
      expect(() => assertCheckDigit(code, symbology)).not.toThrow();
    }
  });

  it('her etiket çizilebiliyor ve boş SVG üretmiyor', () => {
    for (const label of TEST_LABELS) {
      if (label.symbology === 'qr') continue;
      const moduller = label.symbology === 'ean13' ? ean13Modules(label.code) : itf14Modules(label.code);
      const svg = modulesToSvg(moduller, { widthMm: 50, heightMm: 12, x: 3, y: 2 });
      expect(svg).toContain('<rect');
    }
  });

  it('kodlar BENZERSİZ — iki etiket aynı kodu taşıyamaz', () => {
    const kodlar = TEST_LABELS.map((l) => l.code);
    expect(new Set(kodlar).size).toBe(kodlar.length);
  });
});
