import { describe, expect, it } from 'vitest';
import { app } from './app';

/**
 * İskelet testleri — `app.request()` ile PORT AÇMADAN vurur; `serve` hiç çağrılmaz.
 *
 * Entegrasyon kökünde yaşar (kök vitest.config): çöp-token senaryosu yerel Supabase auth
 * sunucusuna gerçekten gider (`auth.getUser`), yani DB env'i şart. Satır YAZMAZ — paylaşılan-DB
 * disiplini (CLAUDE §4b) gereği purge da gerekmez.
 */
describe('mobile-api iskeleti', () => {
  it('/health 200 ve servis künyesi döner', async () => {
    const res = await app.request('/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, service: 'lezzet-mobile-api' });
  });

  it('/api/v1/me token yokken 401 zarfı döner', async () => {
    const res = await app.request('/api/v1/me');
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ data: null, error: 'unauthorized' });
  });

  it('/api/v1/me çöp token ile 401 zarfı döner', async () => {
    const res = await app.request('/api/v1/me', {
      headers: { authorization: 'Bearer gecersiz-jwt-degeri' },
    });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ data: null, error: 'unauthorized' });
  });
});
