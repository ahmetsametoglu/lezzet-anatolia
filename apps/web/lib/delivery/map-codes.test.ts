import { describe, expect, it } from 'vitest';
import { readPostalCodesForMap } from './map-codes';

/**
 * Haritanın posta kodu okuması (19.20).
 *
 * **Fikstür kurulmuyor:** `postal_code_place` migration'la doğan ÜRETİLMİŞ referans veridir
 * (GeoNames) ve uygulama ona yazmaz. Test gerçek veriye vuruyor — kutu Strasbourg çevresi.
 * Küresel sayıya bakılmıyor (`CLAUDE §4b`): sınanan şey kutunun DIŞINI dışarıda tutması ve
 * kesmenin bildirilmesi, satır sayısının kendisi değil.
 */
const STRASBOURG = { minLat: 48.5, maxLat: 48.7, minLng: 7.6, maxLng: 7.9 };

describe('kutu içi okuma', () => {
  it('kutunun DIŞINDA kalan kod dönmez', async () => {
    const { points } = await readPostalCodesForMap({ bbox: STRASBOURG });

    expect(points.length).toBeGreaterThan(0);
    for (const p of points) {
      expect(p.lat).toBeGreaterThanOrEqual(STRASBOURG.minLat);
      expect(p.lat).toBeLessThanOrEqual(STRASBOURG.maxLat);
      expect(p.lng).toBeGreaterThanOrEqual(STRASBOURG.minLng);
      expect(p.lng).toBeLessThanOrEqual(STRASBOURG.maxLng);
    }
  });

  it('ülke süzgeci uygulanır — sınır bölgesinde iki ülke aynı ekranda', async () => {
    const { points } = await readPostalCodesForMap({ bbox: STRASBOURG, country: 'FR' });
    expect(points.every((p) => p.country === 'FR')).toBe(true);
  });

  it('her nokta KOORDİNATLI gelir — koordinatsız kod haritaya basılmaz', async () => {
    // Süzgeç bunu kendiliğinden yapıyor (`lat >= x` null için null'dur); test kuralın veride
    // durduğunu çiviliyor, çünkü ikinci bir `is not null` yazmamayı bilerek seçtik.
    const { points } = await readPostalCodesForMap({ bbox: STRASBOURG });
    expect(points.every((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng))).toBe(true);
  });
});

describe('kesme SESSİZ kalmaz', () => {
  it('tavan aşılınca truncated true döner ve tam olarak tavan kadar nokta gelir', async () => {
    // Eksik çizilen bir harita, operatöre olmayan kodu "yok" diye okutur.
    const { points, truncated } = await readPostalCodesForMap({ bbox: STRASBOURG, limit: 3 });

    expect(points).toHaveLength(3);
    expect(truncated).toBe(true);
  });

  it('tavana dayanılmadıysa truncated false', async () => {
    const { truncated } = await readPostalCodesForMap({ bbox: STRASBOURG, limit: 5000 });
    expect(truncated).toBe(false);
  });

  it('kesme belirli — aynı istek aynı kümeyi verir, harita titremez', async () => {
    const a = await readPostalCodesForMap({ bbox: STRASBOURG, limit: 5 });
    const b = await readPostalCodesForMap({ bbox: STRASBOURG, limit: 5 });
    expect(a.points.map((p) => p.postalCode)).toEqual(b.points.map((p) => p.postalCode));
  });
});

describe('yerleşim adları', () => {
  /**
   * **Sözleşme 15.08'de DEĞİŞTİ** (`OB-04`, kullanıcının arayüz testi).
   *
   * Bu blok eskiden tersini çiviliyordu: *"çok yerleşimli kodda ad NULL"*. O karar `places[0]`
   * hatasına karşı alınmıştı ve o yarısı hâlâ doğru — keyfi bir ilk ad otorite gibi okunur
   * (`67800` "Strasbourg" değil, Bischheim/Hœnheim). Ama seçilen alternatif ("hepsi değil hiçbiri")
   * kodların ~%39'unu haritada adsız bırakıyordu ve operatör nereye baktığını göremiyordu.
   *
   * Yeni kural: okuma **karar vermez**, ham listeyi taşır. Kaç adın yazılacağı çizim anında
   * veriliyor (`placesLabel`) — kalıcı etiket dar, üzerine gelince açılan ipucu tam.
   */
  it('adlar HAM geçer — okuma kırpmaz, seçmez, tek ada indirmez', async () => {
    const { points } = await readPostalCodesForMap({ bbox: STRASBOURG });
    expect(points.length).toBeGreaterThan(0);

    // Her nokta bir dizi taşır: "ad yok" boş dizidir, `null` değil — okuyan taraf dallanmasın.
    for (const point of points) expect(Array.isArray(point.places)).toBe(true);

    // Asıl iddia: çok yerleşimli kod ARTIK adsız değil. Strasbourg çevresi bu hâli içeriyor
    // (kodların ~%39'u çok yerleşimli); hiç bulunamazsa test bir şey sınamıyor demektir.
    const cok = points.find((p) => p.places.length > 1);
    expect(cok, 'Strasbourg kutusunda çok yerleşimli kod bekleniyordu').toBeDefined();
    expect(cok!.places.every((name) => name.length > 0)).toBe(true);
  });
});
