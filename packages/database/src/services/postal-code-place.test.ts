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
    expect(rows).toEqual([{ country: 'FR', postalCode: '67000', placeName: 'Strasbourg' }]);
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

  it('çok yerleşimli kodda üst idari birim yazılır — uydurulmuş köy adı yok', async () => {
    // 51300 tek başına 46 köy kapsıyor; birini seçmek keyfi olurdu. Üst birim (FR'de arrondissement)
    // hem dar hem doğru: bu kodun 46 köyü Vitry-le-François çevresindedir.
    const [row] = await svc.findByPostalCode('51300');
    expect(row?.placeName).toBe('Vitry-le-François');
  });

  it('kod sınırın iki yakasında da tanınır — Kehl ve Offenburg', async () => {
    expect((await svc.findByPostalCode('77694'))[0]).toMatchObject({ country: 'DE', placeName: 'Kehl' });
    expect((await svc.findByPostalCode('77652'))[0]).toMatchObject({ country: 'DE', placeName: 'Offenburg' });
  });
});
