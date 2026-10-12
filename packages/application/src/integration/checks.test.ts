import { createECDH } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { IntegrationSecretName } from '@lezzet/types';
import { checkIntegrationKey } from './checks';

const values =
  (entries: Partial<Record<IntegrationSecretName, string>>) =>
  (name: IntegrationSecretName): string | null =>
    entries[name] ?? null;

const answering = (status: number, body: unknown) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

afterEach(() => {
  delete process.env.NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY;
  delete process.env.PENNYLANE_MODE;
});

// Sağlayıcının reddi ile ağ hatası karışırsa, yalnız gönderim yetkili Resend anahtarı geçersiz sayılırsa, eksik anahtarla sağlayıcıya
// gidilirse ya da kipin şirketine ait olmayan Pennylane anahtarı çalışıyor sayılırsa kırmızıya döner.
describe('anahtar sınaması', () => {
  it('yetkisiz cevap reddir, ağ hatası ulaşılamazlıktır', async () => {
    const lookup = values({ anthropic_api_key: 'sk-ant-yanlis' });
    expect(
      (await checkIntegrationKey('anthropic_api_key', lookup, answering(401, { error: { message: 'invalid x-api-key' } }))).status,
    ).toBe('rejected');
    const down = vi.fn(async () => {
      throw new Error('getaddrinfo ENOTFOUND api.anthropic.com');
    }) as unknown as typeof fetch;
    expect((await checkIntegrationKey('anthropic_api_key', lookup, down)).status).toBe('unreachable');
  });

  it("Resend'in yalnız gönderim yetkili anahtarı geçerlidir", async () => {
    const restricted = answering(401, { name: 'restricted_api_key', message: 'This API key is restricted to only send emails' });
    expect(await checkIntegrationKey('resend_api_key', values({ resend_api_key: 're_gonderim' }), restricted)).toEqual({ status: 'ok' });
    const invalid = answering(400, { name: 'validation_error', message: 'API key is invalid' });
    expect((await checkIntegrationKey('resend_api_key', values({ resend_api_key: 're_yanlis' }), invalid)).status).toBe('rejected');
  });

  it('eksik anahtar varken sağlayıcıya gidilmez', async () => {
    const network = answering(200, {});
    const result = await checkIntegrationKey('hiboutik_api_key', values({ hiboutik_account: 'lezzet', hiboutik_api_key: 'k' }), network);
    expect(result).toEqual({ status: 'incomplete', missing: ['hiboutik_user'] });
    expect(network).not.toHaveBeenCalled();
  });

  it('Pennylane anahtarı kipin şirketine ait değilse reddedilir', async () => {
    process.env.PENNYLANE_MODE = 'sandbox';
    const lookup = values({ pennylane_api_token: 'pl_anahtar' });
    const live = answering(200, { company: { id: 1, name: 'Canlı şirket', reg_no: '912345678' } });
    expect((await checkIntegrationKey('pennylane_api_token', lookup, live)).status).toBe('rejected');
    const sandbox = answering(200, { company: { id: 2, name: 'Test şirketi', reg_no: 'sandbox-912345678' } });
    expect(await checkIntegrationKey('pennylane_api_token', lookup, sandbox)).toEqual({ status: 'ok' });
  });

  it('Revolut imza alanına API anahtarı yapıştırılırsa reddedilir', async () => {
    expect((await checkIntegrationKey('revolut_webhook_secret', values({ revolut_webhook_secret: 'sk_live_api' }))).status).toBe(
      'rejected',
    );
    expect((await checkIntegrationKey('revolut_webhook_secret', values({ revolut_webhook_secret: 'wsk_imza' }))).status).toBe(
      'unverifiable',
    );
  });

  it('web bildirimi gizli anahtarı ortamdaki açık anahtarla eşleşmeli', async () => {
    const pair = createECDH('prime256v1');
    pair.generateKeys();
    const privateKey = pair.getPrivateKey('base64url');
    process.env.NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY = pair.getPublicKey('base64url', 'uncompressed');
    expect(await checkIntegrationKey('web_push_private_key', values({ web_push_private_key: privateKey }))).toEqual({ status: 'ok' });

    const other = createECDH('prime256v1');
    other.generateKeys();
    process.env.NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY = other.getPublicKey('base64url', 'uncompressed');
    expect((await checkIntegrationKey('web_push_private_key', values({ web_push_private_key: privateKey }))).status).toBe('rejected');
  });
});
