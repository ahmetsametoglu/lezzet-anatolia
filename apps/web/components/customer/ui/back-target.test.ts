import { describe, expect, it } from 'vitest';
import { backStaysInSite, type HistoryFacts } from './back-target';

const SITE = 'http://localhost:3000';
const CART = `${SITE}/tr/sepet`;

const facts = (over: Partial<HistoryFacts>): HistoryFacts => ({
  length: 5,
  navigationIndex: null,
  firstEntryUrl: CART,
  currentUrl: CART,
  referrer: '',
  ...over,
});

describe('backStaysInSite', () => {
  it('Google girişinden dönülen sepette geri siteden çıkarmaz (Navigation API: öncesi site dışı)', () => {
    expect(backStaysInSite(facts({ navigationIndex: 0 }))).toBe(false);
  });

  it('site içinde gezinilmişse geri geçmişe döner (Navigation API)', () => {
    expect(backStaysInSite(facts({ navigationIndex: 2 }))).toBe(true);
  });

  it('Navigation API yokken: ilk kayıttayız ve açan başka site → siteden çıkarmaz', () => {
    expect(backStaysInSite(facts({ referrer: 'https://accounts.google.com/' }))).toBe(false);
  });

  it('Navigation API yokken: açan yer bilinmiyorsa (yeni sekme) siteden çıkarmaz', () => {
    expect(backStaysInSite(facts({ referrer: '' }))).toBe(false);
  });

  it('Navigation API yokken: ilk kayıt ama açan bu site → geçmişe döner', () => {
    expect(backStaysInSite(facts({ referrer: `${SITE}/tr/katalog` }))).toBe(true);
  });

  it('Navigation API yokken: belgenin ilk kaydından sonra gezinilmişse geçmişe döner', () => {
    expect(backStaysInSite(facts({ currentUrl: `${SITE}/tr/urun/baklava`, referrer: 'https://accounts.google.com/' }))).toBe(true);
  });

  it('geçmişte tek kayıt varsa geri siteden çıkarmaz', () => {
    expect(backStaysInSite(facts({ length: 1, navigationIndex: 3 }))).toBe(false);
  });
});
