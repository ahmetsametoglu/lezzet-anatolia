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

  /*
    YANIT SIKIŞTIRMA (21.303) — katalog cevapları görsel türevleriyle (`frames`) 15 kat büyüdü; tekrar
    eden CDN adresleri gzip ile ~%95 küçülüyor. Bu iki test sunucunun istendiğinde sıkıştırdığını ve
    istenmediğinde dokunmadığını kilitler — ara katman bir gün sökülse büyüme sessizce tele giderdi.
  */
  it('büyük JSON cevabı `Accept-Encoding: gzip` isteğinde sıkıştırılmış döner', async () => {
    const res = await app.request('/api/v1/categories?locale=tr', { headers: { 'accept-encoding': 'gzip' } });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-encoding')).toBe('gzip');
  });

  it('sıkıştırma istenmezse cevap düz gider', async () => {
    const res = await app.request('/api/v1/categories?locale=tr');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-encoding')).toBeNull();
  });

  it('/api/v1/me çöp token ile 401 zarfı döner', async () => {
    const res = await app.request('/api/v1/me', {
      headers: { authorization: 'Bearer gecersiz-jwt-degeri' },
    });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ data: null, error: 'unauthorized' });
  });
});
