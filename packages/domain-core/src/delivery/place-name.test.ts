import { describe, expect, it } from 'vitest';
import { cityMatchesPlaces, normalizePlaceName, placeLabel } from './place-name';

/**
 * Yer adının güvenilirliği (19.17).
 *
 * Bu testlerin çivilediği şey 19.8'in YANLIŞ İDDİASI: "birden çok yerleşim varsa üst idari birime
 * çık, daha geniş ama asla yanlış değil". Fransız arrondissement'ı merkez kasabasının adını taşıdığı
 * için o etiket geçerli bir belediye adı gibi okunuyordu — 67800 için "Strasbourg", oysa orası
 * Bischheim / Hœnheim.
 */
describe('kodun tartışmasız adı var mı', () => {
  it('tek yerleşimli kod adını verir — kodların %60,6\'sı böyle', () => {
    expect(placeLabel(['Strasbourg'])).toBe('Strasbourg');
  });

  it('ÇOK yerleşimli kodda ad YOKTUR — birini seçmek yanlış belediye adı yazmaktı', () => {
    // 67800: gerçek hâl. Eski kural buraya "Strasbourg" yazıyordu ve Bischheim'lı müşteri
    // adresinde başka bir şehrin adını görüyordu.
    //
    // `null` "gösterilecek bir şey yok" DEMEK DEĞİL: `places` ekranın elinde ve ne yazacağına
    // (liste, ilk N + "+X", çıplak kod) o karar verir. Burada verilen cevap VERİYE aittir.
    expect(placeLabel(['Bischheim', 'Hœnheim'])).toBeNull();
  });

  it('bilinmeyen kod ad VERMEZ — uydurulmaz', () => {
    expect(placeLabel([])).toBeNull();
  });
});

describe('yazım farkı anlam farkı değildir', () => {
  it('ligatür açılır — müşteri "Hoenheim" yazar, veri "Hœnheim" tutar', () => {
    expect(normalizePlaceName('Hœnheim')).toBe(normalizePlaceName('HOENHEIM'));
  });

  it('diyakritik ve tire silinir', () => {
    expect(normalizePlaceName('Vitry-le-François')).toBe(normalizePlaceName('vitry le francois'));
  });

  it('Alman eszett açılır', () => {
    expect(normalizePlaceName('Weißenburg')).toBe(normalizePlaceName('Weissenburg'));
  });
});

/**
 * Adres tutarlılığı — YAŞANMIŞ arızanın kapısı.
 *
 * `LA-26-RFRWKK`: `67000` + `LINGOLSHEIM`, rota + kapıda ödeme. Lingolsheim'ın kodu 67380 ve o kod
 * rotamızda yok; kurye kapıya gidemezdi. Yolu belirleyen tek şey posta koduydu ve hiçbir yerde
 * adresle karşılaştırılmıyordu.
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
    // Kod referansta yok ama kendi bölge tablomuzda olabilir (19.16a). Boş listeyi "uyuşmadı"
    // saymak, referansı eksik olan her adresi reddetmek olurdu.
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
