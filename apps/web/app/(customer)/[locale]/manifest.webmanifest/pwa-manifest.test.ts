import { describe, expect, it } from 'vitest';
import { LOCALES } from '@lezzet/i18n/locale';
import { pwaManifest } from './pwa-manifest';

describe('pwaManifest', () => {
  it('üç dil aynı uygulama kimliğini taşır, açılış adresi dile göre değişir', () => {
    // Kimlik dile göre değişseydi müşteri Fransızcadan ve Almancadan iki ayrı uygulama kurardı; açılış sabit olsaydı yanlış dilde açılırdı.
    const manifestler = LOCALES.map((locale) => pwaManifest(locale, 'x'));

    expect(new Set(manifestler.map((m) => m.id)).size).toBe(1);
    expect(manifestler.map((m) => m.start_url)).toEqual(LOCALES.map((locale) => `/${locale}`));
  });
});
