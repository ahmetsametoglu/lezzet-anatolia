import { describe, expect, it } from 'vitest';
import { cityMatchesPlaces, normalizePlaceName, placeLabel } from './place-name';

/**
 * Beklentiler SQL'deki `place_search_text()`in ürettiği değerlerle aynı sabitlerdir, karşılaştırma değil: o taraf bu dosyadan
 * görünmez ve birbirine eşitlenen iki çağrı ikisi birden kaysa da yeşil kalırdı.
 */
describe('yazım farkı anlam farkı değildir', () => {
  it('ligatür açılır — müşteri "Hoenheim" yazar, veri "Hœnheim" tutar', () => {
    expect(normalizePlaceName('Hœnheim')).toBe('hoenheim');
    expect(normalizePlaceName('HOENHEIM')).toBe('hoenheim');
  });

  it('diyakritik ve tire silinir', () => {
    expect(normalizePlaceName('Vitry-le-François')).toBe('vitry le francois');
    expect(normalizePlaceName('Sélestat')).toBe('selestat');
  });

  it('Alman eszett açılır', () => {
    expect(normalizePlaceName('Weißenburg')).toBe('weissenburg');
    expect(normalizePlaceName('Straßburg')).toBe('strassburg');
  });
});

/**
 * Fransız arrondissement'ı merkez kasabasının adını taşır: üst idari birime çıkan bir etiket 67800'e "Strasbourg" yazar, oysa
 * orası Bischheim / Hœnheim.
 */
describe('kodun tartışmasız adı var mı', () => {
  it('tek yerleşimli kod adını verir — kodların %60,6\'sı böyle', () => {
    expect(placeLabel(['Strasbourg'])).toBe('Strasbourg');
  });

  it('ÇOK yerleşimli kodda ad YOKTUR — birini seçmek yanlış belediye adı yazmaktı', () => {
    // `null` "gösterilecek bir şey yok" demek değil: `places` ekranın elinde ve ne yazacağına ekran karar verir.
    expect(placeLabel(['Bischheim', 'Hœnheim'])).toBeNull();
  });

  it('bilinmeyen kod ad VERMEZ — uydurulmaz', () => {
    expect(placeLabel([])).toBeNull();
  });
});

/**
 * Yol yalnız posta kodundan belirlenir: `67000` + `LINGOLSHEIM` yazan müşterinin kapısı rotada olmayan 67380'dedir ve kurye
 * oraya gidemez.
 */
describe('yazılan şehir bu koda ait mi', () => {
  it('ait olmayan şehir YAKALANIR', () => {
    expect(cityMatchesPlaces('LINGOLSHEIM', ['Strasbourg'])).toBe(false);
  });

  it('çok yerleşimli kodda HER yerleşim geçerlidir — yanlış alarm ötmez', () => {
    // 67800 tam olarak bu yüzden yanlış uyarı üretirdi: tek ada indirgenmiş veride Bischheim
    // "kodun şehri değil" görünürdü.
    expect(cityMatchesPlaces('Bischheim', ['Bischheim', 'Hœnheim'])).toBe(true);
    expect(cityMatchesPlaces('Hoenheim', ['Bischheim', 'Hœnheim'])).toBe(true);
  });

  it('BİLİNMEYEN kod engellemez — ölçülemeyen değer sıfır değildir', () => {
    // Kod referansta olmayıp bölge tablomuzda olabilir; boş listeyi "uyuşmadı" saymak eksik referanslı her adresi reddederdi.
    expect(cityMatchesPlaces('Bischheim', [])).toBe(true);
  });

  it('boş şehir bu kuralın sorusu DEĞİLDİR', () => {
    expect(cityMatchesPlaces('  ', ['Strasbourg'])).toBe(true);
  });

  it('arrondissement eki kabul edilir — "Paris 11" da Paris\'tir', () => {
    expect(cityMatchesPlaces('Paris 11', ['Paris'])).toBe(true);
    expect(cityMatchesPlaces('Paris 11e', ['Paris'])).toBe(true);
    expect(cityMatchesPlaces('Lyon 7ème', ['Lyon'])).toBe(true);
  });

  it('CEDEX eki kabul edilir — kurumsal adreslerde sık', () => {
    expect(cityMatchesPlaces('STRASBOURG CEDEX', ['Strasbourg'])).toBe(true);
    expect(cityMatchesPlaces('STRASBOURG CEDEX 2', ['Strasbourg'])).toBe(true);
  });

  it('ek atma kuralı YANLIŞ eşleşme üretmez — yalnız kabul kümesini büyütür', () => {
    expect(cityMatchesPlaces('Lingolsheim 2', ['Strasbourg'])).toBe(false);
  });
});
