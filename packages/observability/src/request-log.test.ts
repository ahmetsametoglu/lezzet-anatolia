import { afterEach, describe, expect, it, vi } from 'vitest';
import { logger } from './logger';
import { requestLog, type RequestLogContext } from './request-log';

vi.mock('./logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

// İki uygulamanın ortak ara katmanı: isteğe kimlik yazmazsa ya da seviyeyi durumdan türetmezse bu test kırmızıya döner.
async function run(status: number): Promise<string | undefined> {
  let reqId: string | undefined;
  const c: RequestLogContext = {
    set: (_key, value) => {
      reqId = value;
    },
    req: { method: 'GET', path: '/v1/catalog' },
    res: { status },
  };
  await requestLog(c, async () => {});
  return reqId;
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('requestLog', () => {
  it('isteğe kimlik atar ve satırı aynı kimlikle yazar', async () => {
    const reqId = await run(200);

    expect(reqId).toMatch(/^[0-9a-f-]{36}$/);
    expect(vi.mocked(logger.info)).toHaveBeenCalledWith(
      expect.objectContaining({ reqId, method: 'GET', path: '/v1/catalog', status: 200 }),
      'request',
    );
  });

  it.each([
    [503, 'error'],
    [404, 'warn'],
    [201, 'info'],
  ] as const)('%i durumu %s seviyesinde yazılır', async (status, level) => {
    await run(status);

    expect(vi.mocked(logger[level])).toHaveBeenCalledTimes(1);
    for (const other of (['info', 'warn', 'error'] as const).filter((l) => l !== level)) {
      expect(vi.mocked(logger[other])).not.toHaveBeenCalled();
    }
  });

  // Bu dönüşüm kalkarsa Hono düz nesneyi `onError`a vermez; istemci boş 500 alır ve `error_log`a kayıt düşmez.
  it('düz nesne fırlatılırsa mesajı ve kodu taşıyan bir Error olarak yeniden fırlatır', async () => {
    const postgrest = { code: '22P02', message: 'invalid input syntax for type uuid', details: null, hint: null };
    const c: RequestLogContext = { set: () => undefined, req: { method: 'GET', path: '/v1/orders' }, res: { status: 200 } };

    const thrown = await requestLog(c, async () => {
      throw postgrest;
    }).catch((err: unknown) => err);

    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toBe('invalid input syntax for type uuid [22P02]');
    expect((thrown as Error).cause).toBe(postgrest);
    expect(vi.mocked(logger.error)).toHaveBeenCalledWith(expect.objectContaining({ path: '/v1/orders', status: 500 }), 'request');
  });

  it('Error olduğu gibi geçer; kaydı onError yazar', async () => {
    const original = new Error('boom');
    const c: RequestLogContext = { set: () => undefined, req: { method: 'GET', path: '/v1/x' }, res: { status: 200 } };

    await expect(
      requestLog(c, async () => {
        throw original;
      }),
    ).rejects.toBe(original);
  });
});
