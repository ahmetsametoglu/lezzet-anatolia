import { describe, expect, it } from 'vitest';
import { addressAnomalies, cityMatchesPlaces, placeLabel } from './place-name';

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

/** "Bilmiyorum" ile "çelişiyor" aynı uyarı değildir ve ikisi birden basılmaz. */
describe('addressAnomalies', () => {
  it('kod hiçbir yerde tanınmıyorsa unknown_code', () => {
    expect(addressAnomalies({ city: 'Neresi', places: [], inRoute: false })).toEqual(['unknown_code']);
  });

  it('kod KENDİ bölge tablomuzdaysa tanınır — referans susmuş olsa bile', () => {
    // Bölge tablomuz referansın üstündedir: kodu bölgemize eklediysek oraya gidiyoruz ve uyarı yanlış öterdi.
    expect(addressAnomalies({ city: 'Neresi', places: [], inRoute: true })).toEqual([]);
  });

  it('YAŞANMIŞ vaka: 67000 + LINGOLSHEIM → city_mismatch', () => {
    // Bilinmeyen bir şey yok: iki beyan birbiriyle çelişiyor.
    expect(addressAnomalies({ city: 'LINGOLSHEIM', places: ['Strasbourg'], inRoute: true })).toEqual(['city_mismatch']);
  });

  it('şehir koda uyuyorsa uyarı yok', () => {
    expect(addressAnomalies({ city: 'Hœnheim', places: ['Bischheim', 'Hœnheim'], inRoute: true })).toEqual([]);
  });

  it('şehir yazılmamışsa uyarı doğurmaz — eksik alan çelişki değildir', () => {
    expect(addressAnomalies({ city: null, places: ['Strasbourg'], inRoute: true })).toEqual([]);
  });

  it('tanınmayan kodda şehir uyuşmazlığı AYRICA basılmaz — aynı arıza iki kez sayılmaz', () => {
    expect(addressAnomalies({ city: 'Neresi', places: [], inRoute: false })).toEqual(['unknown_code']);
  });
});
