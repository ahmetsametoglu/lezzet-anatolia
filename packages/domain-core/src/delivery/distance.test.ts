import { describe, expect, it } from 'vitest';
import { distanceKm, nearestOf, routeFitOf } from './distance';

/**
 * Mesafe motoru (22.7) — asistanın bölge önerisinin tek sayısal dayanağı.
 *
 * Sınanan şey ondalık hassasiyet DEĞİL: sıralama doğruluğu ve **ölçülemeyenin sıfıra düşmemesi**.
 * Yanlış sıralama, aracın her hafta boşa gittiği bir durak demektir; sıfıra düşen bir ölçüm ise
 * koordinatsız bir kodu "en yakın" yapar ve bunu kimse fark etmez.
 */

// Gerçek noktalar — Strasbourg çevresi (kaba ama sıralaması gerçek).
const STRASBOURG = { lat: 48.5734, lng: 7.7521 };
const KEHL = { lat: 48.5716, lng: 7.8155 }; // ~4-5 km, sınırın öbür yakası
const COLMAR = { lat: 48.0794, lng: 7.3585 }; // ~60 km güney
const PARIS = { lat: 48.8566, lng: 2.3522 }; // ~400 km batı

describe('kuş uçuşu mesafe', () => {
  it('aynı nokta SIFIR, komşu şehir onlarca km, uzak şehir yüzlerce', () => {
    expect(distanceKm(STRASBOURG, STRASBOURG)).toBeCloseTo(0, 5);
    // Kehl sınırın hemen ötesi: 10 km'nin altında olmalı.
    expect(distanceKm(STRASBOURG, KEHL)!).toBeLessThan(10);
    expect(distanceKm(STRASBOURG, COLMAR)!).toBeGreaterThan(50);
    expect(distanceKm(STRASBOURG, PARIS)!).toBeGreaterThan(350);
  });

  it('simetriktir — yön değişince mesafe değişmez', () => {
    expect(distanceKm(STRASBOURG, COLMAR)).toBeCloseTo(distanceKm(COLMAR, STRASBOURG)!, 6);
  });

  /** Koordinatsız kod GERÇEK bir hâl: `postal_code_place.lat/lng` nullable ve dolmayan satır var. */
  it('koordinat yoksa NULL — sıfır değil (sıfır "aynı yerde" demek olurdu)', () => {
    expect(distanceKm(null, STRASBOURG)).toBeNull();
    expect(distanceKm(STRASBOURG, undefined)).toBeNull();
    expect(distanceKm({ lat: Number.NaN, lng: 7 }, STRASBOURG)).toBeNull();
  });
});

/**
 * Güzergâh uyumu — kullanıcının düzeltmesinin testi (09.08): *"araba ana yol üzerinde ilerlerken
 * sağındaki solundaki kodlara dağıtım yapabilir, ama ters yöndeki bir noktaya gidemez."*
 *
 * Sınanan şey mesafe DEĞİL, yön. Aşağıdaki kuzey/güney kurgusu gerçek veriden: STR deposu
 * merkezde, Schiltigheim hattı kuzeyde, Illkirch hattı güneyde.
 */
describe('güzergâh uyumu', () => {
  const DEPO = { lat: 48.5839, lng: 7.7455 }; // STR — 67000
  const KUZEY_UC = { lat: 48.6192, lng: 7.7545 }; // 67800, Schiltigheim hattının ucu
  const GUNEY_UC = { lat: 48.5289, lng: 7.7152 }; // 67400, Illkirch hattının ucu

  it('hattın üzerindeki nokta ON_ROUTE — araç zaten oradan geçiyor', () => {
    const ara = { lat: 48.6075, lng: 7.7493 }; // 67300, iki nokta arasında
    const r = routeFitOf({ origin: DEPO, routeEnd: KUZEY_UC, target: ara });
    expect(r?.fit).toBe('on_route');
    expect(r!.crossKm).toBeLessThan(2);
  });

  /** Kullanıcının cümlesinin tam karşılığı: kuzeye giden araç güneydeki koda uğrayamaz. */
  it('TERS yöndeki nokta OPPOSITE — mesafesi yakın olsa bile', () => {
    const r = routeFitOf({ origin: DEPO, routeEnd: KUZEY_UC, target: GUNEY_UC });
    expect(r?.fit).toBe('opposite');
    // Ve bu, mesafeye bakarak anlaşılamazdı: güney ucu kuzey ucundan uzak değil.
    expect(distanceKm(DEPO, GUNEY_UC)!).toBeLessThan(10);
  });

  it('aynı istikamette ama hattın ötesi EXTENDS_ROUTE — turu uzatır, yön doğru', () => {
    const daha_kuzey = { lat: 48.72, lng: 7.78 }; // hattın ötesinde, aynı yönde
    const r = routeFitOf({ origin: DEPO, routeEnd: KUZEY_UC, target: daha_kuzey });
    expect(r?.fit).toBe('extends_route');
    expect(r!.alongKm).toBeGreaterThan(r!.routeLengthKm);
  });

  it('yön doğru ama koridordan çıkan nokta DETOUR', () => {
    // Kuzeye doğru ama batıya belirgin kaymış: açı 90'ın altında kalsın diye kuzeyi baskın tuttuk.
    const yan = { lat: 48.66, lng: 7.55 };
    const r = routeFitOf({ origin: DEPO, routeEnd: KUZEY_UC, target: yan, corridorKm: 6 });
    expect(r?.fit).toBe('detour');
    expect(r!.crossKm).toBeGreaterThan(6);
  });

  it('koridor eşiği parametrik — aynı nokta geniş koridorda hatta girer', () => {
    const yan = { lat: 48.66, lng: 7.55 };
    expect(routeFitOf({ origin: DEPO, routeEnd: KUZEY_UC, target: yan, corridorKm: 6 })?.fit).toBe('detour');
    expect(routeFitOf({ origin: DEPO, routeEnd: KUZEY_UC, target: yan, corridorKm: 25 })?.fit).not.toBe('detour');
  });
});

describe('en yakın aday', () => {
  it('en yakını seçer ve mesafesini söyler', () => {
    const best = nearestOf(STRASBOURG, [
      { item: 'colmar', point: COLMAR },
      { item: 'kehl', point: KEHL },
      { item: 'paris', point: PARIS },
    ]);
    expect(best?.item).toBe('kehl');
    expect(best?.distanceKm).toBeLessThan(10);
  });

  /**
   * Koordinatsız aday ELENİR. Sıfır sayılsaydı listedeki ilk koordinatsız kayıt her zaman "en
   * yakın" çıkardı — ve öneri, hakkında hiçbir şey bilinmeyen bir hatta giderdi.
   */
  it('koordinatsız aday elenir; hiçbirinde koordinat yoksa NULL', () => {
    const best = nearestOf(STRASBOURG, [
      { item: 'bilinmeyen', point: null },
      { item: 'colmar', point: COLMAR },
    ]);
    expect(best?.item).toBe('colmar');

    expect(nearestOf(STRASBOURG, [{ item: 'a', point: null }])).toBeNull();
    expect(nearestOf(null, [{ item: 'a', point: COLMAR }])).toBeNull();
    expect(nearestOf(STRASBOURG, [])).toBeNull();
  });
});

/**
 * Canlıda görülen kusur (09.08): merkez bölgesinin bütün kodları deponun üstündeydi, hattın yönü
 * yoktu ve hesap "sapma 0,6 km, açı 2°" gibi İKNA EDİCİ ama uydurma bir sonuç veriyordu. İkna
 * ediciliği tam da tehlikesi: yanlış hattı birinci sıraya koyuyordu.
 */
describe('yönü olmayan hat', () => {
  const DEPO = { lat: 48.5839, lng: 7.7455 };

  it('bölge deponun ÜSTÜNDEYSE uyum NULL — sıfır yön bir yön değildir', () => {
    expect(routeFitOf({ origin: DEPO, routeEnd: DEPO, target: { lat: 48.8, lng: 7.79 } })).toBeNull();
  });

  it('eşik parametrik — kısa ama gerçek bir hat ölçülebilir kalır', () => {
    const yakinUc = { lat: 48.6, lng: 7.75 }; // ~1,8 km
    expect(routeFitOf({ origin: DEPO, routeEnd: yakinUc, target: { lat: 48.62, lng: 7.75 } })).not.toBeNull();
    expect(routeFitOf({ origin: DEPO, routeEnd: yakinUc, target: { lat: 48.62, lng: 7.75 }, minRouteKm: 5 })).toBeNull();
  });
});
