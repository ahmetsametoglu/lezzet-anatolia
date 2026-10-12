import { IntegrationSecretService, type Db } from '@lezzet/database';
import { setEmailKeySource } from '@lezzet/email';
import { IntegrationSecretNameEnum, type IntegrationSecretName } from '@lezzet/types';

/**
 * Entegrasyon anahtarının tek okuma yolu: önce Kurulum'dan yazılan Vault değeri, yoksa ortam değişkeni. Değerler süreç
 * başına kısa süre bellekte durur ki her sağlayıcı çağrısı veritabanına gitmesin; değişen anahtar en geç bu sürede her süreçte geçer.
 */

/** Vault'ta tanımlı değilse okunan ortam değişkeni; geçiş boyunca bugünkü kurulum kırılmasın diye. */
const ENV_NAME: Record<IntegrationSecretName, string> = {
  revolut_secret_key: 'REVOLUT_SECRET_KEY',
  revolut_webhook_secret: 'REVOLUT_WEBHOOK_SECRET',
  pennylane_api_token: 'PENNYLANE_API_TOKEN',
  hiboutik_account: 'HIBOUTIK_ACCOUNT',
  hiboutik_user: 'HIBOUTIK_USER',
  hiboutik_api_key: 'HIBOUTIK_API_KEY',
  resend_api_key: 'RESEND_API_KEY',
};

/** Önbelleğin ömrü. */
export const INTEGRATION_SECRET_TTL_MS = 60_000;

export type SecretLookup = (name: IntegrationSecretName) => string | null;

/** Anahtarın geçerli değeri ve nereden geldiği; ikisi de yoksa tanımsızdır (`null`). */
export interface ResolvedSecret {
  value: string | null;
  source: 'vault' | 'env' | null;
}

/** Kurulum'daki değer ortamdakinin önüne geçer; okuyucu da Kurulum ekranı da kararı buradan alır. */
export function resolveSecret(
  name: IntegrationSecretName,
  vault: ReadonlyMap<IntegrationSecretName, string>,
  env: Record<string, string | undefined> = process.env,
): ResolvedSecret {
  const stored = vault.get(name);
  if (stored) return { value: stored, source: 'vault' };
  const fromEnv = env[ENV_NAME[name]];
  return fromEnv ? { value: fromEnv, source: 'env' } : { value: null, source: null };
}

/** Okuyucu çekirdeği; okuma düşerse önbelleğe yazılmaz, sonraki çağrı yeniden dener ve hata çağırana ulaşır. */
export function secretCache(read: () => Promise<Map<IntegrationSecretName, string>>, ttlMs = INTEGRATION_SECRET_TTL_MS) {
  let cached: { at: number; values: Promise<Map<IntegrationSecretName, string>> } | null = null;
  return {
    async lookup(now = Date.now()): Promise<SecretLookup> {
      if (!cached || now - cached.at >= ttlMs) {
        const values = read();
        const entry = { at: now, values };
        cached = entry;
        // Önbellekten düşürmek içindir; hata `await` ile çağırana yine ulaşır.
        values.catch(() => {
          if (cached === entry) cached = null;
        });
      }
      const values = await cached.values;
      return (name) => resolveSecret(name, values).value;
    },
    forget(): void {
      cached = null;
    },
  };
}

let shared: ReturnType<typeof secretCache> | null = null;

/** Sürecin anahtar okuyucusu. */
export function integrationSecrets(db: Db): Promise<SecretLookup> {
  shared ??= secretCache(() => new IntegrationSecretService(db).readValues());
  return shared.lookup();
}

/** Ekranın gördüğü hâl: değerin kendisi yok, yalnız maskesi ve kaynağı. */
export interface MaskedSecret {
  masked: string | null;
  source: ResolvedSecret['source'];
}

const MASK = '••••••••';
/** Kısa değerde son dört hane değerin büyük kısmıdır; o yüzden yalnız bu uzunluktan sonra görünür. */
const MASK_REVEAL_MIN_LENGTH = 16;

/** Maskenin boyu sabittir ki değerin uzunluğu da sızmasın. */
export function maskSecret(value: string): string {
  return value.length >= MASK_REVEAL_MIN_LENGTH ? `${MASK}${value.slice(-4)}` : MASK;
}

/** Kurulum ekranının görünümü; önbelleksiz okunur ki yazılan ya da kaldırılan anahtar ekranda hemen görünsün. */
export async function describeIntegrationSecrets(db: Db): Promise<Map<IntegrationSecretName, MaskedSecret>> {
  const vault = await new IntegrationSecretService(db).readValues();
  return new Map(
    IntegrationSecretNameEnum.options.map((name) => {
      const { value, source } = resolveSecret(name, vault);
      return [name, { masked: value ? maskSecret(value) : null, source }];
    }),
  );
}

/** Tam değer yalnız kopyalama isteğinde, önbelleksiz okunur; ekran verisine hiçbir zaman girmez. */
export async function revealIntegrationSecret(db: Db, name: IntegrationSecretName): Promise<string | null> {
  return resolveSecret(name, await new IntegrationSecretService(db).readValues()).value;
}

/** Kurulum'dan anahtar yazan süreç kendi önbelleğini hemen bırakır; öteki süreçler ömür dolunca okur. */
export function forgetIntegrationSecrets(): void {
  shared?.forget();
}

/** E-posta paketi veritabanını bilmez; anahtarını bu okuyucudan alsın diye süreç başında bir kez takılır. */
export function installEmailKeySource(db: Db): void {
  setEmailKeySource(async () => (await integrationSecrets(db))('resend_api_key'));
}
