import { describe, expect, it } from 'vitest';
import { parseSettingsUrl, settingsLink, settingsUrl } from './settings-url';

describe('parseSettingsUrl', () => {
  it('boş adres varsayılan sekmeyi verir', () => {
    expect(parseSettingsUrl({})).toEqual({ tab: 'order', q: '' });
  });

  it('tanınmayan sekme sessizce varsayılana düşer — bozuk link ekranı kırmaz', () => {
    expect(parseSettingsUrl({ tab: 'yok-boyle-bir-sekme' }).tab).toBe('order');
  });

  it('personel sekmesi de geçerli bir sekmedir', () => {
    expect(parseSettingsUrl({ tab: 'staff' }).tab).toBe('staff');
  });

  it('arama terimi kırpılır', () => {
    expect(parseSettingsUrl({ q: '  sepet ' }).q).toBe('sepet');
  });

  it('dizi gelen parametrede ilki okunur', () => {
    expect(parseSettingsUrl({ tab: ['points', 'stock'] }).tab).toBe('points');
  });
});

describe('settingsUrl', () => {
  it('varsayılanlar adrese yazılmaz', () => {
    expect(settingsUrl({ tab: 'order', q: '' })).toBe('/operations/settings');
  });

  it('sekme ve arama yazılır', () => {
    expect(settingsUrl({ tab: 'payment', q: 'tavan' })).toBe('/operations/settings?tab=payment&q=tavan');
  });

  it('gidiş-dönüş aynı durumu verir', () => {
    const state = { tab: 'cost' as const, q: 'rota' };
    const params = Object.fromEntries(new URL(`http://x${settingsUrl(state)}`).searchParams);
    expect(parseSettingsUrl(params)).toEqual(state);
  });
});

describe('settingsLink', () => {
  it('yalnız verilen alanı değiştirir — başka ekranlar parametre adı yazmasın diye', () => {
    expect(settingsLink({ tab: 'stock' })).toBe('/operations/settings?tab=stock');
  });
});
