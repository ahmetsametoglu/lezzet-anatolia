import { describe, expect, it } from 'vitest';
import { ambalajAlanlari, ambalajOlcusu, olcuHali } from './packing';

/*
  Sınanan şey formülün "doğru" olması DEĞİL — sayılar zaten uydurma (dosya künyesi). Sınanan şey
  üreticinin BOZUK VERİ ÜRETMEMESİ: veri kısıtlarına uyması, ölçüsüzden ölçü uydurmaması ve
  kurduğu üç hâlin gerçekten üçü birden doğması.
*/

describe('ambalajOlcusu', () => {
  it('net ağırlık yoksa künye de YOK — ölçüsüzden ölçü uydurulmaz', () => {
    expect(ambalajOlcusu(null)).toBeNull();
    expect(ambalajOlcusu(undefined)).toBeNull();
    // Sıfır ve negatif de yokluktur: "0 g" bir ölçüm değil, ölçülmemişliğin yanlış yazılmış hâli.
    expect(ambalajOlcusu(0)).toBeNull();
    expect(ambalajOlcusu(-5)).toBeNull();
  });

  it('brüt ağırlık NETTEN BÜYÜKTÜR — dara eklenmeden kargo tarifesi eksik çıkar', () => {
    for (const net of [90, 250, 500, 810, 1250, 2500]) {
      expect(ambalajOlcusu(net)!.packedWeightG).toBeGreaterThan(net);
    }
  });

  it('ölçüler pozitif TAM SAYI — kolon int ve kısıt > 0', () => {
    const o = ambalajOlcusu(700)!;
    for (const v of [o.packedWeightG, o.packedLengthMm, o.packedWidthMm, o.packedHeightMm]) {
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThan(0);
    }
  });

  it('ağır paket daha büyük kutuya girer — sıralama korunur', () => {
    const kucuk = ambalajOlcusu(90)!;
    const buyuk = ambalajOlcusu(2500)!;
    expect(buyuk.packedLengthMm).toBeGreaterThan(kucuk.packedLengthMm);
    expect(buyuk.packedHeightMm).toBeGreaterThan(kucuk.packedHeightMm);
  });

  it('boy en ve yükseklikten büyüktür — kutu oranı bozulmaz', () => {
    const o = ambalajOlcusu(1250)!;
    expect(o.packedLengthMm).toBeGreaterThanOrEqual(o.packedWidthMm);
    expect(o.packedWidthMm).toBeGreaterThanOrEqual(o.packedHeightMm);
  });

  it('aynı girdi aynı çıktıyı verir — sahne tekrarlanabilir olmalı', () => {
    expect(ambalajOlcusu(500)).toEqual(ambalajOlcusu(500));
  });
});

describe('olcuHali — beslemenin kurduğu üç hâl', () => {
  it('kusursuz katmanda her varyant ÖLÇÜLÜ', () => {
    for (let i = 0; i < 50; i++) expect(olcuHali(i, false)).toBe('tam');
  });

  it('kusurlu katmanda ÜÇ hâl de doğar — biri hiç doğmazsa o ekran sınanmamış olur', () => {
    const haller = new Set(Array.from({ length: 100 }, (_, i) => olcuHali(i, true)));
    expect(haller).toEqual(new Set(['tam', 'yarim', 'yok']));
  });
});

describe('ambalajAlanlari — kısıt uyumu', () => {
  it('“yok” hâli hiçbir alan yazmaz', () => {
    expect(ambalajAlanlari(700, 'yok')).toEqual({});
  });

  it('“yarim” hâli YALNIZ ağırlık yazar — ölçüler all-or-none kısıtına takılmaz', () => {
    const alanlar = ambalajAlanlari(700, 'yarim');
    expect(alanlar.packedWeightG).toBeGreaterThan(700);
    expect(alanlar.packedLengthMm).toBeUndefined();
    expect(alanlar.packedWidthMm).toBeUndefined();
    expect(alanlar.packedHeightMm).toBeUndefined();
  });

  it('“tam” hâli ÜÇ ÖLÇÜYÜ BİRLİKTE yazar — ikisi dolu biri boş bir kutu kısıtı ihlal eder', () => {
    const alanlar = ambalajAlanlari(700, 'tam');
    const olculer = [alanlar.packedLengthMm, alanlar.packedWidthMm, alanlar.packedHeightMm];
    expect(olculer.every((v) => typeof v === 'number')).toBe(true);
  });

  it('net ağırlığı olmayan varyant “tam” istense bile alansız kalır — kısıt korunur', () => {
    expect(ambalajAlanlari(null, 'tam')).toEqual({});
  });
});
