import { z } from 'zod';

// Entegrasyon anahtarları: değer Vault'ta şifreli, bu satırlar yalnız hangi anahtarın tanımlı olduğunu ve değişikliğini taşır.

/** Bağlantılar'dan yazılabilen anahtarlar; adlar veritabanı kısıtıyla aynı listedir. */
export const IntegrationSecretNameEnum = z.enum([
  'revolut_secret_key',
  'revolut_webhook_secret',
  'pennylane_api_token',
  'hiboutik_account',
  'hiboutik_user',
  'hiboutik_api_key',
  'resend_api_key',
  'sendcloud_public_key',
  'sendcloud_secret_key',
  'sendcloud_webhook_secret',
  'meta_access_token',
  'meta_page_access_token',
  'meta_app_secret',
  'meta_webhook_verify_token',
  'anthropic_api_key',
  'google_ai_api_key',
  'r2_access_key_id',
  'r2_secret_access_key',
  'google_maps_api_key',
  'web_push_private_key',
]);
export type IntegrationSecretName = z.infer<typeof IntegrationSecretNameEnum>;

export const IntegrationSecretSchema = z.object({
  name: IntegrationSecretNameEnum,
  vaultSecretId: z.string().uuid(),
  updatedAt: z.string(),
  updatedBy: z.string().uuid().nullable(),
});
export type IntegrationSecret = z.infer<typeof IntegrationSecretSchema>;

/** Sağlayıcıda sınamanın sonucu; defter yazım anındakini taşır. */
export const IntegrationCheckStatusEnum = z.enum(['ok', 'rejected', 'unreachable', 'incomplete', 'unverifiable']);
export type IntegrationCheckStatus = z.infer<typeof IntegrationCheckStatusEnum>;

export const IntegrationSecretLogSchema = z.object({
  id: z.string().uuid(),
  name: IntegrationSecretNameEnum,
  action: z.enum(['set', 'clear', 'copy']),
  checkStatus: IntegrationCheckStatusEnum.nullable(),
  actor: z.string().uuid().nullable(),
  createdAt: z.string(),
});
export type IntegrationSecretLog = z.infer<typeof IntegrationSecretLogSchema>;
