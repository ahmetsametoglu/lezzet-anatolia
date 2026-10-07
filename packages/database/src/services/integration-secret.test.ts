import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { IntegrationSecretLogService, IntegrationSecretService, anonDb, serviceDb } from '../index';
import { mustDelete } from '../testing';

/**
 * Entegrasyon anahtarı Vault'ta şifreli durur: tabloda değer yoktur, okuma yalnız sunucu rolünündür ve defter değeri yazmaz. Anahtar
 * satırı paylaşılan tekil satırdır; test öncesindeki değeri okur ve sonunda geri koyar, kendi defter satırlarını siler.
 */
const db = serviceDb();
const secrets = new IntegrationSecretService(db);
const log = new IntegrationSecretLogService(db);
const NAME = 'resend_api_key';
let before: string | undefined;
let logBefore: string[] = [];

const logOfName = async () => (await log.listRecent(100)).filter((row) => row.name === NAME);

beforeAll(async () => {
  before = (await secrets.readValues()).get(NAME);
  logBefore = (await logOfName()).map((row) => row.id);
});

afterAll(async () => {
  if (before) await secrets.set(NAME, before, null);
  else await secrets.clear(NAME, null);
  await mustDelete(db, 'integration_secret_log', (q) =>
    logBefore.length > 0 ? q.eq('name', NAME).not('id', 'in', `(${logBefore.join(',')})`) : q.eq('name', NAME),
  );
});

describe('entegrasyon anahtarı', () => {
  it('yenilenen anahtarın son değeri okunur; anahtar satırı değeri taşımaz', async () => {
    await secrets.set(NAME, 're_test_bir', null);
    await secrets.set(NAME, 're_test_iki', null);

    expect((await secrets.readValues()).get(NAME)).toBe('re_test_iki');
    const rows = (await secrets.list()).filter((candidate) => candidate.name === NAME);
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows)).not.toContain('re_test');
  });

  it('kaldırılan anahtar okunmaz; defter değişiklikleri sırasıyla ve değersiz yazar', async () => {
    await secrets.clear(NAME, null);

    expect((await secrets.readValues()).has(NAME)).toBe(false);
    const written = (await logOfName()).filter((row) => !logBefore.includes(row.id));
    expect(written.map((row) => row.action)).toEqual(['clear', 'set', 'set']);
    expect(JSON.stringify(written)).not.toContain('re_test');
  });

  it('herkese açık anahtarla anahtarlar okunamaz ve yazılamaz', async () => {
    const read = await anonDb().rpc('integration_secrets_read');
    const write = await anonDb().rpc('integration_secret_set', { p_name: NAME, p_value: 'saldiri', p_actor: null });

    expect(read.error).not.toBeNull();
    expect(write.error).not.toBeNull();
  });
});
