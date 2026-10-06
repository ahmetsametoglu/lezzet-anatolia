import { describe, expect, it, vi } from 'vitest';

// Eylem sunucu yoluna bağlı; karar onu çağıran döngüde olduğu için taklit edilir.
vi.mock('./actions', () => ({ resumeOAuthLoginAction: vi.fn() }));

import { waitForSession } from './use-oauth-resume.hook';

const bekleme = () => vi.fn(async () => undefined);

describe('waitForSession', () => {
  // Oturum geç belirdiğinde hedef yerine hata gösterilirse ya da yoklama sürerse bu test kırmızıya döner.
  it('oturum üçüncü yoklamada belirirse gidilecek yeri döner ve yoklamayı bırakır', async () => {
    const sonuclar = [null, null, '/fr/compte', '/baska'];
    const yokla = vi.fn(async () => sonuclar.shift() ?? null);
    const uyku = bekleme();

    await expect(waitForSession(yokla, uyku, 6, 500)).resolves.toBe('/fr/compte');
    expect(yokla).toHaveBeenCalledTimes(3);
    expect(uyku).toHaveBeenCalledTimes(2);
  });

  // Oturum hiç belirmezse sonsuz yoklar ya da hatayı hiç göstermezse bu test kırmızıya döner.
  it('oturum hiç belirmezse pencere dolunca boş döner, yoklama sayısı sınırlıdır', async () => {
    const yokla = vi.fn(async () => null);
    const uyku = bekleme();

    await expect(waitForSession(yokla, uyku, 6, 500)).resolves.toBeNull();
    expect(yokla).toHaveBeenCalledTimes(6);
    expect(uyku).toHaveBeenCalledTimes(5);
  });
});
