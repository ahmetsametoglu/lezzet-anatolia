import { describe, expect, it } from 'vitest';
import packagesMessages from '@lezzet/i18n/customer/packages';
import { packageContentsLine, packageNoteOf, packageRouteStatusOf, packageThumbsOf } from './package';

/* Native paket ekranları ve web telefon görünümü aynı eşlemeyi okur; tam takımı hiçbir havuzda olmayan paket "başka yerde"dir. */

describe('packageRouteStatusOf', () => {
  it('kargo yolu kargo hâlidir', () => {
    expect(packageRouteStatusOf('shipping')).toBe('shipping');
  });

  it('kapıya kilitli ya da tam takımı bu havuzlarda olmayan paket "başka yerde"', () => {
    expect(packageRouteStatusOf('not_shippable_here')).toBe('elsewhere');
    expect(packageRouteStatusOf('unavailable')).toBe('elsewhere');
  });

  it('yerelden gelen paket ve bilinmeyen yer SESSİZ', () => {
    expect(packageRouteStatusOf('local')).toBeNull();
    expect(packageRouteStatusOf(null)).toBeNull();
  });
});

const note = packagesMessages.tr.note;
const regionOnly = { coldChain: true, inRouteOnly: true };

describe('packageNoteOf', () => {
  it('kapalı kapıda susar, cümleyi yer notu söylüyor', () => {
    expect(packageNoteOf(regionOnly, 'blocked', note, 'tr')).toBe('');
  });

  it('bekleyen bölgede ve bilinmeyen yerde paketin kendi gerçeği kalır', () => {
    expect(packageNoteOf(regionOnly, 'pending', note, 'tr')).toBe(`${note.coldChain} · ${note.regionOnly}`);
    expect(packageNoteOf(regionOnly, null, note, 'tr')).toBe(`${note.coldChain} · ${note.regionOnly}`);
    expect(packageNoteOf({ coldChain: true, inRouteOnly: false }, 'info', note, 'tr')).toBe(`${note.coldChain} · ${note.shippable}`);
  });

  it('soğuk zincirsiz pakete soğuk zincir yazmaz', () => {
    expect(packageNoteOf({ coldChain: false, inRouteOnly: false }, null, note, 'tr')).not.toContain(note.coldChain);
  });
});

describe('paket kartının içeriği', () => {
  it('birden çok adet kalıpla yazılır, tek adet yalın ad kalır', () => {
    const items = [
      { name: 'Künefe', unitLabel: '145 g', qty: 2 },
      { name: 'Baklava', unitLabel: '450 g', qty: 1 },
    ];
    expect(packageContentsLine(items, '{label} (×{qty})')).toBe('Künefe (×2), Baklava');
  });

  it('aynı ürünün iki boyu boy etiketiyle ayrılır', () => {
    const items = [
      { name: 'Fıstıklı Baklava', unitLabel: '450 g', qty: 2 },
      { name: 'Fıstıklı Baklava', unitLabel: '225 g', qty: 1 },
    ];
    expect(packageContentsLine(items, '{label} (×{qty})')).toBe('Fıstıklı Baklava 450 g (×2), Fıstıklı Baklava 225 g');
  });

  it('aynı ürünün iki boyu yığında tek halkadır; fazlası +N olur', () => {
    const items = [{ name: 'Fıstıklı Baklava' }, { name: 'Fıstıklı Baklava' }, { name: 'Künefe' }, { name: 'Sade Baklava' }];
    expect(packageThumbsOf(items, 2)).toEqual({ shown: [{ name: 'Fıstıklı Baklava' }, { name: 'Künefe' }], more: 1 });
  });
});
