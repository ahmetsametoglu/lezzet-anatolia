import { IntegrationSecretService, type Db } from '@lezzet/database';
import { setEmailKeySource } from '@lezzet/email';
import type { IntegrationSecretName } from '@lezzet/types';

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
      return (name) => values.get(name) ?? (process.env[ENV_NAME[name]] || null);
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

/** Kurulum'dan anahtar yazan süreç kendi önbelleğini hemen bırakır; öteki süreçler ömür dolunca okur. */
export function forgetIntegrationSecrets(): void {
  shared?.forget();
}

/** E-posta paketi veritabanını bilmez; anahtarını bu okuyucudan alsın diye süreç başında bir kez takılır. */
export function installEmailKeySource(db: Db): void {
  setEmailKeySource(async () => (await integrationSecrets(db))('resend_api_key'));
}
