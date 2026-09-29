import { describe, expect, it } from 'vitest';
import { installModeOf } from './install-mode';

describe('installModeOf', () => {
  it('uygulama olarak açılmış sitede kart gizli, sinyal olsa bile', () => {
    // Kurulu uygulamada kart çıksaydı müşteri zaten kurduğu uygulamayı yeniden kurmaya çağrılırdı.
    expect(installModeOf({ standalone: true, ios: false }, true)).toBe('hidden');
    expect(installModeOf({ standalone: true, ios: true }, false)).toBe('hidden');
  });

  it('sinyal varsa düğme, iPhone\'da rehber, kurulum yolu yoksa hiçbiri', () => {
    expect(installModeOf({ standalone: false, ios: false }, true)).toBe('prompt');
    expect(installModeOf({ standalone: false, ios: true }, false)).toBe('ios');
    expect(installModeOf({ standalone: false, ios: false }, false)).toBe('hidden');
  });
});
