import { readdirSync, readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { IntegrationSecretNameEnum, type IntegrationSecretName } from '@lezzet/types';
import { maskSecret, resolveSecret, secretCache } from './secrets';

const MIGRATIONS = new URL('../../../../supabase/migrations/', import.meta.url).pathname;

/** Migration'lardaki son `integration_secret` ad kısıtının listesi; kısıt sonradan değişirse en yeni tanım geçerlidir. */
function constrainedNames(): string[] {
  let last: string | null = null;
  for (const file of readdirSync(MIGRATIONS)
    .filter((name) => name.endsWith('.sql'))
    .sort()) {
    for (const match of readFileSync(`${MIGRATIONS}${file}`, 'utf8').matchAll(/integration_secret\b[^;]*?check \(name in \(([^)]*)\)/g)) {
      last = match[1]!;
    }
  }
  if (!last) throw new Error("integration_secret ad kısıtı migration'larda bulunamadı — kısıt taşındıysa bu test güncellenmeli");
  return [...last.matchAll(/'([a-z0-9_]+)'/g)].map((match) => match[1]!);
}

const vault = (entries: Array<[IntegrationSecretName, string]>) => {
  const calls = { count: 0 };
  const read = async () => {
    calls.count += 1;
    return new Map(entries);
  };
  return { read, calls };
};

afterEach(() => {
  delete process.env.HIBOUTIK_API_KEY;
  delete process.env.PENNYLANE_API_TOKEN;
});

describe('entegrasyon anahtarı okuyucusu', () => {
  it("Bağlantılar'dan yazılan değer ortamdakinin önüne geçer; Vault'ta olmayan anahtar ortamdan okunur", async () => {
    process.env.HIBOUTIK_API_KEY = 'ortam-hiboutik';
    process.env.PENNYLANE_API_TOKEN = 'ortam-pennylane';
    const { read } = vault([['hiboutik_api_key', 'vault-hiboutik']]);

    const secret = await secretCache(read).lookup(0);

    expect(secret('hiboutik_api_key')).toBe('vault-hiboutik');
    expect(secret('pennylane_api_token')).toBe('ortam-pennylane');
    expect(secret('resend_api_key')).toBeNull();
  });

  it('Bağlantılar ekranı geçerli değeri kaynağıyla gösterir: Vault değeri ortamdakinin önünde, ikisi de yoksa tanımsız', () => {
    const stored = new Map<IntegrationSecretName, string>([['hiboutik_api_key', 'vault-hiboutik']]);
    const env = { HIBOUTIK_API_KEY: 'ortam-hiboutik', PENNYLANE_API_TOKEN: 'ortam-pennylane' };

    expect(resolveSecret('hiboutik_api_key', stored, env)).toEqual({ value: 'vault-hiboutik', source: 'vault' });
    expect(resolveSecret('pennylane_api_token', stored, env)).toEqual({ value: 'ortam-pennylane', source: 'env' });
    expect(resolveSecret('resend_api_key', stored, env)).toEqual({ value: null, source: null });
  });

  it('değerler ömrü boyunca bellekten okunur, ömür dolunca Vault yeniden okunur', async () => {
    const { read, calls } = vault([['hiboutik_api_key', 'v1']]);
    const cache = secretCache(read, 60_000);

    await cache.lookup(0);
    await cache.lookup(59_999);
    expect(calls.count).toBe(1);

    await cache.lookup(60_000);
    expect(calls.count).toBe(2);
  });

  it('düşen okuma önbelleğe yazılmaz: hata çağırana ulaşır, sonraki çağrı yeniden okur', async () => {
    let fail = true;
    const cache = secretCache(async () => {
      if (fail) throw new Error('veritabanına ulaşılamadı');
      return new Map<IntegrationSecretName, string>([['hiboutik_api_key', 'v2']]);
    });

    await expect(cache.lookup(0)).rejects.toThrow('veritabanına ulaşılamadı');
    fail = false;
    expect((await cache.lookup(1))('hiboutik_api_key')).toBe('v2');
  });
});

// Tipe eklenen anahtar veritabanı kısıtına eklenmezse (ilk kayıtta düşer) ya da kısıttan çıkan ad tipte kalırsa kırmızıya döner.
describe('anahtar adları', () => {
  it('tipteki ad listesi veritabanı kısıtıyla aynı', () => {
    expect(constrainedNames().sort()).toEqual([...IntegrationSecretNameEnum.options].sort());
  });
});

// Maske kısa anahtarın hanelerini ya da bir anahtarın uzunluğunu açığa vurursa kırmızıya döner.
describe('anahtar maskesi', () => {
  it('kısa anahtarda hane görünmez, uzunda yalnız son dört hane; maskenin boyu değerden bağımsız', () => {
    expect(maskSecret('lezzet')).toBe('••••••••');
    expect(maskSecret('x'.repeat(15))).toBe('••••••••');
    expect(maskSecret('sk_live_0123456789abcdef')).toBe('••••••••cdef');
    expect(maskSecret(`${'a'.repeat(16)}WXYZ`)).toBe(maskSecret(`${'b'.repeat(200)}WXYZ`));
  });
});
