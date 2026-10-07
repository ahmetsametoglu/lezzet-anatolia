import type { SupabaseClient } from '@supabase/supabase-js';
import {
  IntegrationSecretLogSchema,
  IntegrationSecretNameEnum,
  IntegrationSecretSchema,
  type IntegrationSecret,
  type IntegrationSecretLog,
  type IntegrationSecretName,
} from '@lezzet/types';
import { z } from 'zod';
import { BaseDbService } from '../core/base.service';

const SecretValueRowsSchema = z.array(z.object({ name: IntegrationSecretNameEnum, value: z.string() }));

/**
 * Entegrasyon anahtarları: değer Vault'ta şifreli durur, yazım ve çözülmüş okuma yalnız sunucu rolünün çağırabildiği
 * fonksiyonlardan geçer; tablolara doğrudan yazılmaz.
 */
export class IntegrationSecretService extends BaseDbService<IntegrationSecret, never, never> {
  constructor(supabase: SupabaseClient) {
    super(
      supabase,
      'integration_secret',
      IntegrationSecretSchema,
      IntegrationSecretSchema as never,
      IntegrationSecretSchema as never,
      false,
    );
  }

  /** Tanımlı anahtarların çözülmüş değerleri; değer bu süreçten öteye yazılmaz, loglanmaz. */
  async readValues(): Promise<Map<IntegrationSecretName, string>> {
    const rows = SecretValueRowsSchema.parse(await this.executeRpc('integration_secrets_read', {}));
    return new Map(rows.map((row) => [row.name, row.value]));
  }

  /** Anahtarı yazar ya da yeniler; değişiklik deftere kimlikle düşer, değerle değil. */
  async set(name: IntegrationSecretName, value: string, actorId: string | null): Promise<void> {
    await this.executeRpc('integration_secret_set', { p_name: name, p_value: value, p_actor: actorId });
  }

  async clear(name: IntegrationSecretName, actorId: string | null): Promise<void> {
    await this.executeRpc('integration_secret_clear', { p_name: name, p_actor: actorId });
  }

  /** Hangi anahtarın tanımlı olduğu ve son değişikliği; değer yok. */
  list(): Promise<IntegrationSecret[]> {
    return this.getAll(undefined, { orderBy: 'name' });
  }
}

/** Değişiklik defteri; yalnız okunur, satırları yazım fonksiyonu yazar. */
export class IntegrationSecretLogService extends BaseDbService<IntegrationSecretLog, never, never> {
  constructor(supabase: SupabaseClient) {
    super(
      supabase,
      'integration_secret_log',
      IntegrationSecretLogSchema,
      IntegrationSecretLogSchema as never,
      IntegrationSecretLogSchema as never,
      false,
    );
  }

  /** En yeni değişiklikler; defter operatörün kurduğu küçük bir kümedir, sabit sınırla okunur. */
  listRecent(limit = 20): Promise<IntegrationSecretLog[]> {
    return this.getAll(undefined, { orderBy: 'createdAt', orderDirection: 'desc', limit });
  }
}
