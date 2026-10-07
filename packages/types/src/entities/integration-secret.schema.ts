import { z } from 'zod';

// Entegrasyon anahtarları: değer Vault'ta şifreli, bu satırlar yalnız hangi anahtarın tanımlı olduğunu ve değişikliğini taşır.

/** Kurulum'dan yazılabilen anahtarlar; adlar veritabanı kısıtıyla aynı listedir. */
export const IntegrationSecretNameEnum = z.enum([
  'revolut_secret_key',
  'revolut_webhook_secret',
  'pennylane_api_token',
  'hiboutik_account',
  'hiboutik_user',
  'hiboutik_api_key',
  'resend_api_key',
]);
export type IntegrationSecretName = z.infer<typeof IntegrationSecretNameEnum>;

export const IntegrationSecretSchema = z.object({
  name: IntegrationSecretNameEnum,
  vaultSecretId: z.string().uuid(),
  updatedAt: z.string(),
  updatedBy: z.string().uuid().nullable(),
});
export type IntegrationSecret = z.infer<typeof IntegrationSecretSchema>;

export const IntegrationSecretLogSchema = z.object({
  id: z.string().uuid(),
  name: IntegrationSecretNameEnum,
  action: z.enum(['set', 'clear']),
  actor: z.string().uuid().nullable(),
  createdAt: z.string(),
});
export type IntegrationSecretLog = z.infer<typeof IntegrationSecretLogSchema>;
