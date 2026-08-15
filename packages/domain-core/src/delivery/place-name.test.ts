import { describe, expect, it } from 'vitest';
import { addressAnomalies, cityMatchesPlaces, placeLabel } from './place-name';

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

// `normalizePlaceName`in kendi testleri `@lezzet/helper`a taşındı (`OB-03` · 15.08), fonksiyonla
// birlikte. Aşağıdaki `cityMatchesPlaces` testleri onu dolaylı olarak zaten sürüyor.

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

/**
 * Adres uyarıları (19.19) — operasyon listesinin işareti. Sınanan şey ayrımın kendisi: "bilmiyorum"
 * ile "çelişiyor" aynı uyarı DEĞİL, ve ikisi birden basılmaz.
 */
describe('addressAnomalies', () => {
  it('kod hiçbir yerde tanınmıyorsa unknown_code', () => {
    expect(addressAnomalies({ city: 'Neresi', places: [], inRoute: false })).toEqual(['unknown_code']);
  });

  it('kod KENDİ bölge tablomuzdaysa tanınır — referans susmuş olsa bile', () => {
    // 19.16a: kendi tablomuz referansın üstündedir. GeoNames bir kodu bilmiyor olabilir; biz o kodu
    // bölgemize eklediysek oraya gidiyoruz demektir ve uyarı yanlış öterdi.
    expect(addressAnomalies({ city: 'Neresi', places: [], inRoute: true })).toEqual([]);
  });

  it('YAŞANMIŞ vaka: 67000 + LINGOLSHEIM → city_mismatch', () => {
    // 19.17'yi doğuran şikâyet. Burada bilinmeyen bir şey yok: iki beyan birbiriyle çelişiyor.
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
