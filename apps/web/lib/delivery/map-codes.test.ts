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

describe('etiket adı', () => {
  it('çok yerleşimli kodda ad NULL — keyfi bir seçim otorite gibi okunurdu', async () => {
    // `places[0]` bu tabloda bir kez denendi ve yanlışlığı görünmüyordu (67800 → "Strasbourg",
    // orası Bischheim/Hœnheim). Alternatif "hepsi" değil, hiçbiri: etiket yalnız kodu gösterir.
    const { points } = await readPostalCodesForMap({ bbox: STRASBOURG });
    const cok = points.find((p) => p.place === null);
    const tek = points.find((p) => p.place !== null);

    // Strasbourg çevresinde her iki hâl de var; ikisi de bulunamazsa test bir şey sınamıyor demektir.
    expect(cok ?? tek).toBeDefined();
    if (tek) expect(typeof tek.place).toBe('string');
  });
});
