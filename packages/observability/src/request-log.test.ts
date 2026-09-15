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
});
