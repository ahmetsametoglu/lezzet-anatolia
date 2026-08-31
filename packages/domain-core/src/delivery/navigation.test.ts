import { describe, expect, it } from 'vitest';

import { navigationLink, navigationLinks } from './navigation';

describe('navigationLinks', () => {
  it('rota kurar, yer kartı AÇMAZ', () => {
    // Arızanın kendisi: `maps/search` iğne gösterir, yolculuğu başlatmaz. Bu testin tek işi o
    // dönüşün geri alınmasını engellemek.
    const url = navigationLink({ address: '12 rue des Fleurs, 67000 Strasbourg' });

    expect(url).toContain('/maps/dir/');
    expect(url).not.toContain('/maps/search');
    expect(url).toContain('travelmode=driving');
  });

  it('koordinat varsa adres metnini yener', () => {
    // Adres metni hedef uygulamada başka bir şehirde eşleşebilir; koordinat eşleşemez.
    const url = navigationLink({ point: { lat: 48.5734, lng: 7.7521 }, address: '12 rue des Fleurs' });

    expect(url).toContain(encodeURIComponent('48.573400,7.752100'));
    expect(url).not.toContain('rue');
  });

  it('koordinat altı haneye yuvarlanır — olmayan kesinlik iddia edilmez', () => {
    const url = navigationLink({ point: { lat: 48.57341234567, lng: 7.75219876543 } });

    expect(url).toContain(encodeURIComponent('48.573412,7.752199'));
  });

  it('yalnız adres varsa onu taşır', () => {
    const url = navigationLink({ address: '12 rue des Fleurs, 67000 Strasbourg' });

    expect(url).toContain(encodeURIComponent('12 rue des Fleurs, 67000 Strasbourg'));
  });

  it('hedef hiç yoksa null — çağıran düğmeyi çizmez', () => {
    expect(navigationLinks({})).toBeNull();
    expect(navigationLinks({ point: null, address: null })).toBeNull();
    expect(navigationLinks({ address: '   ' })).toBeNull();
    expect(navigationLink({})).toBeNull();
  });

  it('bozuk koordinat adrese düşer, sıfır sayılmaz', () => {
    // `NaN` bir konum değildir; (0,0) Gine Körfezi'dir ve kuryeyi oraya yollamak sessiz bir arızadır.
    const url = navigationLink({ point: { lat: Number.NaN, lng: 7.7521 }, address: 'Kehl' });

    expect(url).toContain('Kehl');
  });

  it('koordinat bozuksa ve adres de yoksa null', () => {
    expect(navigationLinks({ point: { lat: Number.NaN, lng: Number.NaN } })).toBeNull();
  });

  it('dört hedef üretir ve hepsi kaçırılmış metin taşır', () => {
    const links = navigationLinks({ address: 'rue de l&Église, Strasbourg' });

    expect(links?.map((link) => link.target)).toEqual(['universal', 'geo', 'waze', 'apple']);
    // Ham `&` sorgu dizgisini bölerdi: hedef "rue de l" olurdu ve kurye yanlış yere giderdi.
    for (const link of links ?? []) expect(link.url).not.toContain('l&Église');
  });

  it('özel şema kullanılmaz — yalnız https ve geo', () => {
    // `comgooglemaps://` kurulu değilse sessizce başarısız olur ve doğrulaması `canOpenURL` ister.
    const links = navigationLinks({ address: 'Strasbourg' }) ?? [];

    for (const link of links) {
      expect(link.url.startsWith('https://') || link.url.startsWith('geo:')).toBe(true);
    }
  });
});
