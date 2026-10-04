import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { serviceDb } from '@lezzet/database';
import { purgeTestData } from '@lezzet/database/testing';
import { app } from '../../app';
import { bearer, createSignedInUser, envelopeData, envelopeError } from '../../lib/testing';

/**
 * Talep müşterinin serbest metnini taşır; liste ve detay kimliği jetondan çözüp sorguyu ona daraltmazsa kimliği bilen biri başkasının
 * yazışmasını okur. Retlerin içeriği uygulama katmanının işi, burada taşıma sınanır: kapı, sahiplik, gövde, sorgu ve açılış teyidi.
 */

// Teyit gerçek sürücüye gitmez; sınanan, ucun açılışta teyidi çağırıp çağırmadığı.
const { notifyTicketReceived } = vi.hoisted(() => ({ notifyTicketReceived: vi.fn(async () => []) }));
vi.mock('@lezzet/application', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  notifyTicketReceived,
}));

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
  // Fikstür sessizce düşemez: talep açılamazsa sahiplik iddiaları atlanır ve paket yine yeşil görünürdü.
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

  it('mobilden açılan talep de webdeki gibi açılış teyidi doğurur', async () => {
    notifyTicketReceived.mockClear();
    const created = await envelopeData<{ id: string }>(
      await req('', benimToken, { method: 'POST', body: JSON.stringify({ type: 'question', body: `Teyit sınaması ${stamp}` }) }),
    );

    expect(notifyTicketReceived).toHaveBeenCalledOnce();
    expect(notifyTicketReceived).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ id: created.id }), 'customer');
  });

  it('BAŞKASININ talebine mesaj yazılamaz', async () => {
    const res = await req(`/${otekiTalepId}/messages`, benimToken, {
      method: 'POST',
      body: JSON.stringify({ body: 'araya giren mesaj' }),
    });

    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});

/*
  Adres gerçek private kovaya imzalanır ve imzalamak ağa çıkmaz; dosyanın kendisi yüklenmez, çünkü yüklemeyi istemci doğrudan R2'ye
  yapar. `profileIds[0]` kurulum sırası gereği benim müşterimdir.
*/
describe('POST /uploads — talep fotoğrafı (21.309)', () => {
  const upload = (token: string, body: unknown) => req('/uploads', token, { method: 'POST', body: JSON.stringify(body) });

  it('anahtar müşterinin TASLAK klasörüne kurulur; adres imzalı, içerik türü cevapta', async () => {
    const data = await envelopeData<{ key: string; uploadUrl: string; contentType: string }>(
      await upload(benimToken, { filename: 'kirik.jpg', alreadyRequested: 0 }),
    );

    // Anahtarı kapı kurar: istemciden gelen bir yol doğrulanmak zorunda kalmasın.
    expect(data.key).toMatch(new RegExp(`^support/tickets/drafts/${profileIds[0]}/[^/]+\\.jpg$`));
    expect(data.uploadUrl).toContain('X-Amz-Signature');
    // İmza türü bağlıyor ve türü kapı söylüyor — istemci eşlemeyi ikinci kez yazmıyor.
    expect(data.contentType).toBe('image/jpeg');
  });

  it('biçimsiz gövde 400 `invalid_body`', async () => {
    const res = await upload(benimToken, { alreadyRequested: 0 });

    expect(res.status).toBe(400);
    expect(await envelopeError(res)).toBe('invalid_body');
  });

  it('görsel olmayan dosya 400 `unsupported_type` — private kova dosya paylaşım alanı değil', async () => {
    const res = await upload(benimToken, { filename: 'fatura.pdf', alreadyRequested: 0 });

    expect(res.status).toBe(400);
    expect(await envelopeError(res)).toBe('unsupported_type');
  });

  it('tavan dolunca 400 `too_many`', async () => {
    const res = await upload(benimToken, { filename: 'altinci.jpg', alreadyRequested: 5 });

    expect(res.status).toBe(400);
    expect(await envelopeError(res)).toBe('too_many');
  });

  it('açılış KENDİ taslak anahtarını iliştirir — detayda fotoğraf görünür', async () => {
    const { key } = await envelopeData<{ key: string }>(await upload(benimToken, { filename: 'kanit.jpg', alreadyRequested: 0 }));

    const created = await envelopeData<{ id: string }>(
      await req('', benimToken, {
        method: 'POST',
        body: JSON.stringify({ type: 'other', body: `Fotoğraflı talep ${stamp}`, attachments: [key] }),
      }),
    );
    const detail = await envelopeData<{ messages: { photos: string[] }[] }>(await req(`/${created.id}`, benimToken));

    expect(detail.messages[0]!.photos).toHaveLength(1);
  });

  it('BAŞKASININ taslak anahtarı iliştirilemez — 400 `attachment_not_yours`', async () => {
    const { key } = await envelopeData<{ key: string }>(await upload(otekiToken, { filename: 'baskasi.jpg', alreadyRequested: 0 }));

    const res = await req('', benimToken, {
      method: 'POST',
      body: JSON.stringify({ type: 'other', body: `Araya giren ek ${stamp}`, attachments: [key] }),
    });

    expect(res.status).toBe(400);
    expect(await envelopeError(res)).toBe('attachment_not_yours');
  });
});

describe('POST /:id/uploads — yazışma fotoğrafı', () => {
  // Uç cevaptaki ekleri kapıya iletmezse fotoğraf sessizce düşer; bu test o hâlde kırmızıya döner.
  it('ek talebin KENDİ klasörüne kurulur ve cevapla yazışmaya girer', async () => {
    const created = await envelopeData<{ id: string }>(
      await req('', benimToken, { method: 'POST', body: JSON.stringify({ type: 'other', body: `Yazışma eki ${stamp}` }) }),
    );
    const { key } = await envelopeData<{ key: string }>(
      await req(`/${created.id}/uploads`, benimToken, {
        method: 'POST',
        body: JSON.stringify({ filename: 'etiket.jpg', alreadyRequested: 0 }),
      }),
    );
    expect(key).toMatch(new RegExp(`^support/tickets/${created.id}/[^/]+\\.jpg$`));

    const detail = await envelopeData<{ messages: { photos: string[] }[] }>(
      await req(`/${created.id}/messages`, benimToken, {
        method: 'POST',
        body: JSON.stringify({ body: 'İşte etiket', attachments: [key] }),
      }),
    );

    expect(detail.messages.at(-1)!.photos).toHaveLength(1);
  });

  // Sahiplik kapıya iletilmezse müşteri başkasının talep klasörüne yazma izni alır; bu test o hâlde kırmızıya döner.
  it('BAŞKASININ talebine yükleme adresi alınamaz — 404 `ticket_not_found`', async () => {
    const res = await req(`/${otekiTalepId}/uploads`, benimToken, {
      method: 'POST',
      body: JSON.stringify({ filename: 'araya.jpg', alreadyRequested: 0 }),
    });

    expect(res.status).toBe(404);
    expect(await envelopeError(res)).toBe('ticket_not_found');
  });
});
