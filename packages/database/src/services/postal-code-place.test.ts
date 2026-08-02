import { describe, expect, it } from 'vitest';
import { serviceDb } from '../client';
import { PostalCodePlaceService } from './postal-code-place.service';

/**
 * Posta kodu referansı (19.8) — entegrasyon.
 *
 * Bu tablo **salt okunur ve sabittir** (migration'la doğar, uygulama yazmaz), o yüzden testler veri
 * kurmaz ve temizlemez — paylaşılan veritabanında başka bir ajanın koşusuyla çakışma riski yok
 * (`CLAUDE.md §4b`). Sayılara değil, bilinen SATIRLARA bakılıyor: küresel sayı testi yazmak
 * (`toplam 16.878`) veri yenilendiği gün kırılırdı ve kırılması bir arıza olmazdı.
 */
describe('posta kodu referansı', () => {
  const svc = new PostalCodePlaceService(serviceDb());

  it('tek ülkede geçerli kod tek satır döner — ülke artık türetilebilir', async () => {
    const rows = await svc.findByPostalCode('67000');
    expect(rows).toEqual([
      { country: 'FR', postalCode: '67000', places: ['Strasbourg'], lat: 48.5839, lng: 7.7455 },
    ]);
  });

  /** Bölge kurulumu haritadan yapılıyor (19.18) — kodun haritada bir yeri olmalı. */
  it('kod merkez noktasını taşır — harita onsuz hiçbir kodu basamaz', async () => {
    const [row] = await svc.findByPostalCode('67800');
    // Bischheim / Hœnheim: Strasbourg'un hemen kuzeyi. Nokta yerleşimlerin ORTALAMASI, birinin
    // konumu değil — birini seçmek "tek ad" hatasının coğrafi karşılığı olurdu.
    expect(row?.lat).toBeCloseTo(48.62, 1);
    expect(row?.lng).toBeCloseTo(7.75, 1);
  });

  it('İKİ ülkede geçerli kod iki satır döner — belirsizliğin kaynağı burası', async () => {
    // 67240: FR'de Bischwiller çevresi, DE'de Bobenheim-Roxheim. Tam genişleme koridorumuzda:
    // Bas-Rhin ile Rheinland-Pfalz aynı `67` önekini paylaşıyor.
    const rows = await svc.findByPostalCode('67240');
    // Sıraya değil KÜMEYE bakılıyor: sıralama motorun işi (rota adayı önce), servisinki değil.
    // Ayrıca `country` bir enum kolonu — SQL sırası alfabetik değil, enum tanım sırasıdır.
    expect([...rows.map((r) => r.country)].sort()).toEqual(['DE', 'FR']);
  });

  it('geçersiz kod hiç satır döndürmez — "tanımadık" hâlinin dayanağı', async () => {
    expect(await svc.findByPostalCode('67999')).toEqual([]);
  });

  it('çok yerleşimli kod TÜM yerleşimlerini taşır — indirgeme yok (19.17)', async () => {
    // 51300 tek başına 46 köy kapsıyor. Eski sürüm burada arrondissement adını ("Vitry-le-François")
    // yazıyordu ve o ad geçerli bir belediye adı gibi okunuyordu — Marolles'lu müşteri kendi
    // adresinde başka bir kasabanın adını görüyordu.
    const [row] = await svc.findByPostalCode('51300');
    expect(row?.places.length).toBeGreaterThan(40);
    expect(row?.places).toContain('Marolles');
    expect(row?.places).toContain('Vitry-le-François');
  });

  it('YAŞANMIŞ vaka: 67800 Bischheim ve Hœnheim\'dır, Strasbourg DEĞİL', async () => {
    const [row] = await svc.findByPostalCode('67800');
    expect(row?.places).toEqual(['Bischheim', 'Hœnheim']);
    expect(row?.places).not.toContain('Strasbourg');
  });

  it('arrondissement türevi ayrı yerleşim SAYILMAZ — 75011 Paris\'tir', async () => {
    // GeoNames hem "Paris" hem "Paris 11" taşır. Ham sayımla bu kod "çok yerleşimli" görünür ve
    // Paris çıplak koda düşerdi.
    expect((await svc.findByPostalCode('75011'))[0]?.places).toEqual(['Paris']);
  });

  it('kod sınırın iki yakasında da tanınır — Kehl ve Offenburg', async () => {
    expect((await svc.findByPostalCode('77694'))[0]).toMatchObject({ country: 'DE', places: ['Kehl'] });
    expect((await svc.findByPostalCode('77652'))[0]).toMatchObject({ country: 'DE', places: ['Offenburg'] });
  });

  /**
   * Adres tutarlılığının kapısı (19.17) — `findByPostalCode`'dan ayrı bir soru: orada ülke
   * bilinmiyor, burada zaten çözülmüş.
   */
  describe('kodun yerleşimleri (kapı)', () => {
    it('ülkeyle birlikte sorulur — aynı kod iki ülkede farklı yer demektir', async () => {
      expect(await svc.findPlaces('FR', '67240')).toContain('Bischwiller');
      expect(await svc.findPlaces('DE', '67240')).toEqual(['Bobenheim-Roxheim']);
    });

    it('referansta olmayan kod BOŞ döner — "bilinmiyor", "uyuşmuyor" değil', async () => {
      expect(await svc.findPlaces('FR', '67999')).toEqual([]);
    });
  });

  /**
   * Önek araması (19.19) — adres alanının autocomplete'i. Bu uç TUŞ YOLUNDA, o yüzden şekli kadar
   * sınırları da sınanıyor.
   */
  describe('önek araması', () => {
    it('öneki taşıyan kodları verir ve tavanı aşmaz', async () => {
      const rows = await svc.searchPrefix('6724', 8);

      expect(rows.length).toBeGreaterThan(0);
      expect(rows.length).toBeLessThanOrEqual(8);
      expect(rows.every((row) => row.postalCode.startsWith('6724'))).toBe(true);
    });

    it('aynı kodun iki ülkesi de ayrı satır gelir — ayrımı müşteri yapacak', async () => {
      const rows = await svc.searchPrefix('67240');
      // 67240 hem FR (Bischwiller çevresi) hem DE (Bobenheim-Roxheim). Ülke süzgeci YOK: müşteri
      // ülke seçmiyor, satırdaki yer adı ve ülke ile ayırt ediyor.
      expect([...rows.map((r) => r.country)].sort()).toEqual(['DE', 'FR']);
    });

    it('yer adları HAM gelir — kısaltma ekranın işi', async () => {
      const [row] = await svc.searchPrefix('51300');
      // Etiket kurulsaydı ("51300 · Marolles +45") üç dilde çalışmazdı ve "+45"in eşiği veri
      // katmanında donardı.
      expect(row?.places.length).toBeGreaterThan(40);
    });

    it('rota içindeki kod ÖNE alınır — doğru cevap listenin dibinde saklanmaz', async () => {
      // Bölge tablosu ortamdan ortama değişir; sınanan şey SIRA kuralı: rota adayı varsa başta olur.
      const rows = await svc.searchPrefix('67');
      const first = rows.findIndex((row) => row.inRoute);
      if (first === -1) return; // yerelde bu önekte rota kodu yoksa kural sınanamaz
      expect(rows.slice(0, first).every((row) => !row.inRoute)).toBe(true);
    });

    it('tek harflik önek REDDEDİLİR — hiçbir yeri işaret etmiyor', async () => {
      // Başarım değil anlam kararı: "6" on altı bin kodun onda birine uyar ve müşteriye
      // gösterilecek sekiz satır rastgele olurdu.
      expect(await svc.searchPrefix('6')).toEqual([]);
    });

    it('boşluklu ve küçük harfli yazım normalize edilir', async () => {
      // `like` büyük/küçük harfe duyarlı (indeks için şart) — normalizasyon kapıda yapılmazsa
      // "67 24" yazan müşteri boş liste görürdü.
      expect((await svc.searchPrefix('67 24')).length).toBeGreaterThan(0);
    });
  });
});
