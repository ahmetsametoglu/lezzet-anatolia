import { IntegrationSecretService, type Db } from '@lezzet/database';
import { setEmailKeySource } from '@lezzet/email';
import { captureError } from '@lezzet/observability';
import { IntegrationSecretNameEnum, type IntegrationSecretName } from '@lezzet/types';

/**
 * Entegrasyon anahtarının tek okuma yolu: önce Ayarlar › Bağlantılar'dan yazılan Vault değeri, yoksa ortam dosyasındaki değer. Değerler süreç
 * belleğinde durur ki her sağlayıcı çağrısı veritabanına gitmesin; değişen anahtar en geç bir dakikada her süreçte geçer.
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
  sendcloud_public_key: 'SENDCLOUD_PUBLIC_KEY',
  sendcloud_secret_key: 'SENDCLOUD_SECRET_KEY',
  sendcloud_webhook_secret: 'SENDCLOUD_WEBHOOK_SECRET',
  meta_access_token: 'META_ACCESS_TOKEN',
  meta_page_access_token: 'META_PAGE_ACCESS_TOKEN',
  meta_app_secret: 'META_APP_SECRET',
  meta_webhook_verify_token: 'META_WEBHOOK_VERIFY_TOKEN',
  anthropic_api_key: 'ANTHROPIC_API_KEY',
  google_ai_api_key: 'GOOGLE_GENERATIVE_AI_API_KEY',
  r2_access_key_id: 'R2_ACCESS_KEY_ID',
  r2_secret_access_key: 'R2_SECRET_ACCESS_KEY',
  google_maps_api_key: 'GOOGLE_MAPS_API_KEY',
  web_push_private_key: 'WEB_PUSH_PRIVATE_KEY',
};

/** Yükleyicinin hata kaynağı; sistem ekranı bu değere göre süzer. */
const INTEGRATION_SOURCE = 'application-integration';

/** Süreç açılırken ortam dosyasından gelen değerler; Vault'tan kaldırılan anahtar bellekte bunlara döner. */
let bootEnv: Record<string, string | undefined> | null = null;
let reloadEnv: (() => Promise<void>) | null = null;

/** Önbelleğin ömrü. */
export const INTEGRATION_SECRET_TTL_MS = 60_000;

export type SecretLookup = (name: IntegrationSecretName) => string | null;

/** Anahtarın geçerli değeri ve nereden geldiği; ikisi de yoksa tanımsızdır (`null`). */
export interface ResolvedSecret {
  value: string | null;
  source: 'vault' | 'env' | null;
}

/** Vault'taki değer ortamdakinin önüne geçer; okuyucu da Bağlantılar ekranı da kararı buradan alır. */
export function resolveSecret(
  name: IntegrationSecretName,
  vault: ReadonlyMap<IntegrationSecretName, string>,
  env: Record<string, string | undefined> = bootEnv ?? process.env,
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

/** Bağlantılar ekranının görünümü; önbelleksiz okunur ki yazılan ya da kaldırılan anahtar ekranda hemen görünsün. */
export async function describeIntegrationSecrets(db: Db): Promise<Map<IntegrationSecretName, MaskedSecret>> {
  const vault = await new IntegrationSecretService(db).readValues();
  return new Map(
    IntegrationSecretNameEnum.options.map((name) => {
      const { value, source } = resolveSecret(name, vault);
      return [name, { masked: value ? maskSecret(value) : null, source }];
    }),
  );
}

/** Önbelleksiz okuyucu: Bağlantılar'ın yazma ve sınama adımı az önce değişmiş değeri görmeli. */
export async function freshIntegrationSecrets(db: Db): Promise<SecretLookup> {
  const vault = await new IntegrationSecretService(db).readValues();
  return (name) => resolveSecret(name, vault).value;
}

/** Tam değer yalnız kopyalama isteğinde okunur; ekran verisine hiçbir zaman girmez. */
export async function revealIntegrationSecret(db: Db, name: IntegrationSecretName): Promise<string | null> {
  return (await freshIntegrationSecrets(db))(name);
}

/** Anahtar yazan süreç kendi önbelleğini ve belleğindeki ortamı hemen tazeler; öteki süreçler ömür dolunca okur. */
export function forgetIntegrationSecrets(): void {
  shared?.forget();
  void reloadEnv?.();
}

/** Vault'taki değeri sürecin bellekteki ortamına yazar; Vault'ta olmayan anahtarın ortam dosyasındaki değeri geri konur. */
async function applyVaultToEnv(db: Db): Promise<void> {
  const vault = await new IntegrationSecretService(db).readValues();
  const boot = (bootEnv ??= Object.fromEntries(Object.values(ENV_NAME).map((env) => [env, process.env[env]])));
  for (const [name, env] of Object.entries(ENV_NAME) as Array<[IntegrationSecretName, string]>) {
    const value = vault.get(name) ?? boot[env];
    if (value === undefined) delete process.env[env];
    else process.env[env] = value;
  }
}

/**
 * Vault'taki anahtarları süreç belleğindeki ortama yükler ve dakikada bir tazeler; ortamı okuyan kod (yapay zekâ, depolama,
 * kargo, Meta, harita) Vault'taki değeri böylece kendisi değişmeden görür. Disk üzerindeki ortam dosyasına yazılmaz; ilk
 * yükleme düşerse süreç dosyadaki değerlerle açılır ve tazeleme yeniden dener.
 */
export async function loadIntegrationSecrets(db: Db): Promise<void> {
  const reload = () =>
    applyVaultToEnv(db).catch((err: unknown) => captureError(err, { source: INTEGRATION_SOURCE, context: { flow: 'integration/load' } }));
  if (!reloadEnv) setInterval(() => void reload(), INTEGRATION_SECRET_TTL_MS).unref();
  reloadEnv = reload;
  await reload();
}

/** E-posta paketi veritabanını bilmez; anahtarını bu okuyucudan alsın diye süreç başında bir kez takılır. */
export function installEmailKeySource(db: Db): void {
  setEmailKeySource(async () => (await integrationSecrets(db))('resend_api_key'));
}
