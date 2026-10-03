import { beforeEach, describe, expect, it, vi } from 'vitest';
import { onRequestError } from './instrumentation';

const { captureError } = vi.hoisted(() => ({ captureError: vi.fn() }));
vi.mock('@lezzet/observability', () => ({ captureError, SOURCES: { webServer: 'web-server' } }));

const request = { path: '/fr/produit/simit', method: 'GET', headers: {} } as Parameters<typeof onRequestError>[1];
const context = { routerKind: 'App Router', routePath: '/[locale]/product/[slug]', routeType: 'render' } as Parameters<
  typeof onRequestError
>[2];

describe('onRequestError', () => {
  beforeEach(() => captureError.mockClear());

  it('müşterinin yarıda kestiği akışı hata listesine yazmaz', async () => {
    await onRequestError(new Error('The destination stream closed early.'), request, context);
    expect(captureError).not.toHaveBeenCalled();
  });

  it('gerçek sunucu hatasını yazar', async () => {
    await onRequestError(new Error('relation "order" does not exist'), request, context);
    expect(captureError).toHaveBeenCalledOnce();
  });
});
