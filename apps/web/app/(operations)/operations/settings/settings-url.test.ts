import { describe, expect, it } from 'vitest';
import { parseSettingsUrl, settingsLink, settingsUrl } from './settings-url';

describe('parseSettingsUrl', () => {
  it('boş adres varsayılan sekmeyi verir', () => {
    expect(parseSettingsUrl({})).toEqual({ tab: 'order', q: '', changed: false });
  });

  it('tanınmayan sekme sessizce varsayılana düşer — bozuk link ekranı kırmaz', () => {
    expect(parseSettingsUrl({ tab: 'yok-boyle-bir-sekme' }).tab).toBe('order');
  });

  it('kurulum sekmesi de geçerli bir sekmedir', () => {
    expect(parseSettingsUrl({ tab: 'setup' }).tab).toBe('setup');
  });

  it('arama terimi kırpılır', () => {
    expect(parseSettingsUrl({ q: '  sepet ' }).q).toBe('sepet');
  });

  it('dizi gelen parametrede ilki okunur', () => {
    expect(parseSettingsUrl({ tab: ['customer', 'money'] }).tab).toBe('customer');
  });

  it('değişenler süzgeci yalnız `1` ile açılır', () => {
    expect(parseSettingsUrl({ changed: '1' }).changed).toBe(true);
    expect(parseSettingsUrl({ changed: 'evet' }).changed).toBe(false);
  });
});

describe('settingsUrl', () => {
  it('varsayılanlar adrese yazılmaz', () => {
    expect(settingsUrl({ tab: 'order', q: '', changed: false })).toBe('/operations/settings');
  });

  it('sekme, arama ve süzgeç yazılır', () => {
    expect(settingsUrl({ tab: 'money', q: 'tavan', changed: true })).toBe('/operations/settings?tab=money&q=tavan&changed=1');
  });

  it('gidiş-dönüş aynı durumu verir', () => {
    const state = { tab: 'customer' as const, q: 'puan', changed: true };
    const params = Object.fromEntries(new URL(`http://x${settingsUrl(state)}`).searchParams);
    expect(parseSettingsUrl(params)).toEqual(state);
  });
});

describe('settingsLink', () => {
  it('yalnız verilen alanı değiştirir — başka ekranlar parametre adı yazmasın diye', () => {
    expect(settingsLink({ tab: 'setup' })).toBe('/operations/settings?tab=setup');
  });
});
