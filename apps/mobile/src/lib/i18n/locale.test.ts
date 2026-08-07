import { getLocales } from 'expo-localization';
import { DEFAULT_LOCALE } from '@lezzet/i18n';

import { deviceLocale, resolveLocale } from './locale';

// Cihaz katmanı tek yerden taklit edilir: `deviceLocale` yalnız bu köprüyü okur.
jest.mock('expo-localization', () => ({ getLocales: jest.fn() }));
const getLocalesMock = getLocales as unknown as jest.Mock;

describe('resolveLocale — cihaz dili → desteklenen dil', () => {
  it('bölge ekini yok sayar: fr-FR → fr', () => {
    expect(resolveLocale(['fr-FR'])).toBe('fr');
  });

  it('tercih SIRASINI gezer — desteklenmeyen ilk dil atlanır', () => {
    expect(resolveLocale(['es-ES', 'it-IT', 'de-AT'])).toBe('de');
  });

  it('büyük/küçük harf yazımı fark etmez', () => {
    expect(resolveLocale(['TR-tr'])).toBe('tr');
  });

  it('hiçbiri desteklenmiyorsa varsayılana düşer (web ile aynı yedek: fr)', () => {
    expect(resolveLocale(['es-ES', 'ja-JP'])).toBe(DEFAULT_LOCALE);
    expect(DEFAULT_LOCALE).toBe('fr');
  });

  it('boş liste de varsayılana düşer — dil sorusu cevapsız kalmaz', () => {
    expect(resolveLocale([])).toBe(DEFAULT_LOCALE);
  });
});

describe('deviceLocale — cihaz köprüsü', () => {
  it('cihazın ilk desteklenen dilini çözer ve sonucu bir daha hesaplamaz', () => {
    getLocalesMock.mockReturnValue([{ languageTag: 'tr-FR' }, { languageTag: 'fr-FR' }]);

    expect(deviceLocale()).toBe('tr');

    // İkinci çağrı köprüye GİTMEZ: dil süreç ömrü boyunca sabittir (cihaz ayarı değişince
    // işletim sistemi uygulamayı yeniden başlatır).
    getLocalesMock.mockReturnValue([{ languageTag: 'de-DE' }]);
    expect(deviceLocale()).toBe('tr');
    expect(getLocalesMock).toHaveBeenCalledTimes(1);
  });
});
