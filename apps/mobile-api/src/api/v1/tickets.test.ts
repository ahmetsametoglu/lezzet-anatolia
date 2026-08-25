import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { serviceDb } from '@lezzet/database';
import { purgeTestData } from '@lezzet/database/testing';
import { app } from '../../app';
import { bearer, createSignedInUser, envelopeData, envelopeError } from '../../lib/testing';

/**
 * TALEP / ŞİKÂYET — `/api/v1/me/tickets`, dört uç.
 *
 * ── ÇİVİLENEN ASIL KARAR: TALEP KİMLİĞE DARALTILIR ──────────────────────────
 * Talep, müşterinin yazdığı SERBEST METNİ taşıyor — şikâyetin içeriği, sipariş künyesi, bazen
 * kişisel bir durum. Liste ve detay kimliği jetondan çözüp sorguyu ona daraltıyor; daraltma
 * düşerse kimliği bilen biri başkasının yazışmasını okuyabilir. Mail sızıntısından farkı yok,
 * yalnız daha sessiz.
 *
 * ── İKİNCİ KARAR: SAYFA BOYU İSTEMCİNİN KEYFİNE BIRAKILMAZ ──────────────────
 * Talep listesi veriyle SINIRSIZ büyüyen bir küme (CLAUDE §1) ve imleçli. Tavanı aşan `limit`
 * reddediliyor; edilmeseydi tek istek bütün defteri çekebilirdi.
 *
 * Retlerin İÇERİĞİ (hangi tip açılabilir, hangi sipariş bağlanabilir) uygulama katmanının işi;
 * burada TAŞIMA sınanıyor: kapı, sahiplik, gövde ve sorgu denetimi.
 */
const db = serviceDb();
const stamp = Date.now();

const authUserIds: string[] = [];
const profileIds: string[] = [];
let benimToken: string;
let otekiToken: string;
let otekiTalepId: string;

function req(path: string, token: string, init: RequestInit = {}) {
  const sep = path.includes('?') ? '&' : '?';
  return app.request(`/api/v1/me/tickets${path}${sep}locale=tr`, {
    ...init,
    headers: { ...bearer(token), 'content-type': 'application/json', ...(init.headers ?? {}) },
  });
}

beforeAll(async () => {
  const benim = await createSignedInUser({ prefix: 'tickets-api', label: 'benim' });
  const oteki = await createSignedInUser({ prefix: 'tickets-api', label: 'oteki' });
  benimToken = benim.token;
  otekiToken = oteki.token;
  authUserIds.push(benim.authUserId, oteki.authUserId);
  profileIds.push(benim.profileId, oteki.profileId);

  // ÖTEKİ müşterinin talebi UÇ ÜZERİNDEN açılıyor: servisin doğrudan yazılması, ucun kendi
  // kabul kurallarını atlar ve sahiplik iddiası gerçek bir kayıtla sınanamaz olurdu.
  const res = await req('', otekiToken, {
    method: 'POST',
    body: JSON.stringify({ type: 'other', body: `Öteki müşterinin talebi ${stamp}` }),
  });
  /* FİKSTÜR SESSİZCE BAŞARISIZ OLAMAZ. İlk taslak `if (status === 200)` ile sarmalıyordu ve her
     iddianın başında `if (!otekiTalepId) return;` vardı — talep açılamasaydı testlerin YARISI
     sessizce atlanır, paket yine yeşil görünürdü. Sahiplik iddiası tam da atlanan yarıdaydı. */
  otekiTalepId = (await envelopeData<{ id: string }>(res)).id;
  expect(otekiTalepId).toBeTruthy();
});

afterAll(async () => {
  await purgeTestData(db, { profileIds, authUserIds });
});

describe('kapı', () => {
  it('liste Bearer olmadan 401', async () => {
    expect((await app.request('/api/v1/me/tickets?locale=tr')).status).toBe(401);
  });

  it('açma Bearer olmadan 401 — talep kimliğe yazılır', async () => {
    const res = await app.request('/api/v1/me/tickets?locale=tr', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'other', body: 'deneme' }),
    });

    expect(res.status).toBe(401);
  });
});

describe('GET /api/v1/me/tickets — liste', () => {
  it('BAŞKASININ talebi listede GÖRÜNMEZ', async () => {
    const page = await envelopeData<{ tickets: { id: string }[] }>(await req('', benimToken));

    expect(page.tickets.map((t) => t.id)).not.toContain(otekiTalepId);
  });

  it('sahibi kendi talebini GÖRÜR — iddia boşluğa geçmesin', async () => {
    // Yukarıdaki "görünmez" iddiası, liste HER ZAMAN boş olsaydı da geçerdi (sahte yeşil).
    const page = await envelopeData<{ tickets: { id: string }[] }>(await req('', otekiToken));

    expect(page.tickets.map((t) => t.id)).toContain(otekiTalepId);
  });

  it('TAVANI AŞAN `limit` reddedilir — tek istek bütün defteri çekemez', async () => {
    const res = await req('?limit=9999', benimToken);

    expect(res.status).toBe(400);
    expect(await envelopeError(res)).toBe('invalid_query');
  });

  it('BOZUK imleç listeyi düşürmez', async () => {
    // Opak imleç dışarıdan gelir; bozulduğunda ekranı hata sayfasına düşürmek yerine ilk sayfayı
    // vermek doğru (sipariş ve puan listelerinin aynı sözleşmesi).
    const res = await req('?cursor=bozuk-imlec', benimToken);

    expect(res.status).toBe(200);
  });
});

describe('GET /api/v1/me/tickets/:id — detay', () => {
  it('BAŞKASININ talebi 404 — serbest metin sızmaz', async () => {
    const res = await req(`/${otekiTalepId}`, benimToken);

    expect(res.status).toBe(404);
    expect(await envelopeError(res)).toBe('ticket_not_found');
  });

  it('SAHİBİ kendi talebini okur', async () => {
    const detail = await envelopeData<{ id: string }>(await req(`/${otekiTalepId}`, otekiToken));

    expect(detail.id).toBe(otekiTalepId);
  });

  it('OLMAYAN kimlik 404 `ticket_not_found`', async () => {
    const res = await req('/00000000-0000-4000-9000-000000000000', benimToken);

    expect(res.status).toBe(404);
    expect(await envelopeError(res)).toBe('ticket_not_found');
  });
});

describe('POST — açma ve mesaj', () => {
  it('BOZUK gövde 400 `invalid_body`', async () => {
    const res = await req('', benimToken, { method: 'POST', body: JSON.stringify({ type: 'other' }) });

    expect(res.status).toBe(400);
    expect(await envelopeError(res)).toBe('invalid_body');
  });

  it('BAŞKASININ talebine mesaj yazılamaz', async () => {
    const res = await req(`/${otekiTalepId}/messages`, benimToken, {
      method: 'POST',
      body: JSON.stringify({ body: 'araya giren mesaj' }),
    });

    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});
