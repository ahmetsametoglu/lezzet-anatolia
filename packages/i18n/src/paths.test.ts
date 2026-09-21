import { describe, expect, it } from 'vitest';
import { localizedHref } from './paths';

// Canonical, hreflang, og:url ve site haritası bu adresi kullanır; `/fr/` 308 ile yönlendiği için kök rota eğik çizgisiz olmalı.
describe('localizedHref', () => {
  it('kök rotada sonda eğik çizgi yok', () => {
    expect(localizedHref('/', 'fr')).toBe('/fr');
    expect(localizedHref('/', 'tr')).toBe('/tr');
  });

  it('diğer rotalarda dilin segmenti ve parametre', () => {
    expect(localizedHref('/catalog', 'fr')).toBe('/fr/catalogue');
    expect(localizedHref('/product/[slug]', 'de', { slug: 'baklava' })).toBe('/de/produkt/baklava');
  });
});
