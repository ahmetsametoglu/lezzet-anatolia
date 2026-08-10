import { describe, expect, it } from 'vitest';
import type { SettingsService } from '@lezzet/database';
import type { SettingScope, SettingScopeContext } from '@lezzet/types';
import { minBasketFor } from './min-basket';

/**
 * **Kargo siparişinin asgari sepeti YOKTUR** (kullanıcı kararı 10.08) — saf, DB'siz.
 *
 * Test ayarın DEĞERİNİ değil, **hangi satırların okunduğunu** tutuyor: kural "kargoda 0 €" değil,
 * "kargoda lojistik taban hiç sorulmaz"dır. Değeri sınayan bir test, operatör küresel eşiği
 * değiştirdiği gün yeşil kalıp kuralı kaybederdi.
 *
 * Sahte servis `getNumber` çağrısının argümanlarını kaydediyor; gerçek çözüm zaten
 * `SettingsService`in kendi testinde sınanıyor.
 */
function fakeSettings(rows: Record<string, number>) {
  const calls: { fallback: number; only?: readonly SettingScope[] }[] = [];
  const service = {
    getNumber: (_key: string, fallback: number, _scope: SettingScopeContext, opts?: { only?: readonly SettingScope[] }) => {
      calls.push({ fallback, only: opts?.only });
      // Sahte çözüm: yalnız izin verilen kapsamların satırlarından en yükseği (gerçeğin aynısı).
      const izin = opts?.only ?? (['zone', 'channel', 'country', 'global'] as const);
      const values = Object.entries(rows)
        .filter(([scope]) => izin.includes(scope as SettingScope))
        .map(([, value]) => value);
      return Promise.resolve(values.length > 0 ? Math.max(...values) : fallback);
    },
  } as unknown as SettingsService;
  return { service, calls };
}

const SCOPE: SettingScopeContext = { channel: 'b2b', zoneId: 'z1', country: 'FR' };

describe('minBasketFor', () => {
  it('kargo siparişinde YALNIZ kanal satırı okunur — küresel/bölge satırı hiç sorulmaz', async () => {
    const { service, calls } = fakeSettings({ global: 4000, zone: 6000, channel: 12000 });
    expect(await minBasketFor(service, 'shipping', SCOPE)).toBe(12000);
    expect(calls[0]?.only).toEqual(['channel']);
  });

  it('kanal satırı yoksa kargoda alt sınır SIFIR — varsayılan bile devreye girmez', async () => {
    // Operatörün küresel 40 € yazması kargoyu etkilemez: kuralın delinebileceği tek yol buydu.
    const { service } = fakeSettings({ global: 4000, zone: 6000 });
    expect(await minBasketFor(service, 'shipping', SCOPE)).toBe(0);
  });

  it('kapıya teslimde TÜM kapsamlar okunur ve en katısı uygulanır', async () => {
    const { service, calls } = fakeSettings({ global: 4000, zone: 6000, channel: 12000 });
    expect(await minBasketFor(service, 'route', SCOPE)).toBe(12000);
    expect(calls[0]?.only).toBeUndefined();
  });

  it('kapıya teslimde hiç satır yoksa fabrika değeri geçerli — kargodakinden AYRI', async () => {
    const { service } = fakeSettings({});
    expect(await minBasketFor(service, 'route', SCOPE)).toBe(4000);
    expect(await minBasketFor(service, 'shipping', SCOPE)).toBe(0);
  });
});
