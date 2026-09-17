import { describe, expect, it } from 'vitest';
import packagesMessages from '@lezzet/i18n/customer/packages';
import { packageNoteOf } from './package-note';

const copy = packagesMessages.tr.note;
const regionOnly = { coldChain: true, inRouteOnly: true };

describe('packageNoteOf', () => {
  it('kapalı kapıda susar — cümleyi künyedeki yer notu söylüyor', () => {
    expect(packageNoteOf(regionOnly, 'blocked', copy, 'tr')).toBe('');
  });

  it('bekleyen bölgede paketin kendi gerçeği kalır — yer notu onu söylemiyor', () => {
    expect(packageNoteOf(regionOnly, 'pending', copy, 'tr')).toBe(`${copy.coldChain} · ${copy.regionOnly}`);
  });

  it('adres bilinmiyorsa ya da paket geliyorsa kargoya uygunluğu yazar', () => {
    expect(packageNoteOf(regionOnly, null, copy, 'tr')).toBe(`${copy.coldChain} · ${copy.regionOnly}`);
    expect(packageNoteOf({ coldChain: true, inRouteOnly: false }, 'info', copy, 'tr')).toBe(`${copy.coldChain} · ${copy.shippable}`);
  });

  it('soğuk zincirsiz pakete soğuk zincir yazmaz', () => {
    expect(packageNoteOf({ coldChain: false, inRouteOnly: false }, null, copy, 'tr')).not.toContain(copy.coldChain);
  });
});
