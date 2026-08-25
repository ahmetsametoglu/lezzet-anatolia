import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  CartService,
  CategoryService,
  PriceService,
  ProductService,
  StockService,
  UserProfileService,
  anonDb,
  serviceDb,
} from '@lezzet/database';
import { createTestWarehouse, purgeTestData } from '@lezzet/database/testing';
import { app } from '../../app';

/**
 * GİRİŞLİ MÜŞTERİNİN SEPETİ — `/api/v1/me/cart`, beş uç (21.21).
 *
 * ── BU DOSYA BİR SIZINTI BULDU ──────────────────────────────────────────────
 * `viewOf` okuma kapısının TAM dönüşünü veriyor (`CartRead = {body, source, place}`) ve `ok()`
 * gevşek tipli — tamamını göndermek derlemede hata VERMEZ. Beş uçtan **üçü** (`PATCH`, `DELETE`,
 * `takeover`) `.body` çıkarmayı unutmuştu; `source` (sepetin iç karar nesnesi) ve `place` (depo
 * çözümü) istemciye sızıyordu.
 *
 * Aynı sınıftan bir sızıntı `cart-view`da 24.08'de gözle yakalanıp düzeltilmişti — **kardeşleri
 * atlanmış.** Gözle arama tam olarak böyle yarım kalıyor: düzeltilen yer görülür, görülmeyen yer
 * düzeltilmez. Testler önce yazıldı, kırmızıyı gördü, sonra kod düzeltildi.
 *
 * ── ÖTEKİ ÇİVİLENEN KARARLAR ────────────────────────────────────────────────
 * · **Gövde HER ZAMAN LİSTE**, tek ürün bile (09.08): eşzamanlı ekleme birbirini eziyordu
 *   (ölçüldü: eşzamanlı üç ekleme → 1–2 satır). Bir kullanıcı eylemi tek yazma turuna indi.
 * · **Aynı adres birleşir, ikinci satır açılmaz** — kural serviste, ama davranışı uç üzerinden
 *   sınanıyor: ekranın gördüğü şey bu.
 * · **DEVİR sunucudaki sepeti KORUR** — gelen kalemler üstüne eklenir. Ezseydi, telefonunda boş
 *   sepetle giriş yapan müşteri masaüstünde biriktirdiği sepeti kaybederdi.
 * · **Başkasının satırı silinemez** — kimlik JETONDAN, gövdeden değil.
 */
const db = serviceDb();
const stamp = Date.now();

const authUserIds: string[] = [];
const profileIds: string[] = [];
let warehouseId: string;
let categoryId: string;
let productId: string;
let variantId: string;
let musteriId: string;
let musteriToken: string;
let otekiId: string;

const BIRIM_FIYAT = 1250;
const ileriGun = (offset: number): string => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

async function signedInUser(label: string) {
  const email = `cart-api-${label}-${stamp}@example.test`;
  const password = `Sepet!${stamp}`;
  const { data: created, error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !created.user) throw new Error(`test kullanıcısı açılamadı: ${error?.message ?? 'kullanıcı yok'}`);
  authUserIds.push(created.user.id);

  const profiles = new UserProfileService(db);
  const profile = await profiles.findByAuthUserId(created.user.id);
  if (!profile) throw new Error('auth trigger profil satırı açmadı');
  profileIds.push(profile.id);
  await profiles.update({ id: profile.id, roles: ['customer'], name: `Sepet ${label}` });

  const { data: session, error: signInError } = await anonDb().auth.signInWithPassword({ email, password });
  if (signInError || !session.session) throw new Error(`oturum açılamadı: ${signInError?.message ?? 'oturum yok'}`);
  return { profileId: profile.id, token: session.session.access_token };
}

/** Sepet uçları dili SORGU DİZESİNDEN okur (`localeOf` künyesi) — başlıktan değil. */
function req(path: string, init: RequestInit = {}) {
  const sep = path.includes('?') ? '&' : '?';
  return app.request(`/api/v1/me/cart${path}${sep}locale=tr`, {
    ...init,
    headers: { authorization: `Bearer ${musteriToken}`, 'content-type': 'application/json', ...(init.headers ?? {}) },
  });
}

async function dataOf<T>(res: Response): Promise<T> {
  const envelope = (await res.json()) as { data: T; error: string | null };
  expect(envelope.error).toBeNull();
  return envelope.data;
}

const satir = (qty = 2) => ({ items: [{ kind: 'variant', variantId, qty, stockId: null }] });

beforeAll(async () => {
  warehouseId = (await createTestWarehouse(db, { label: 'SPT' })).id;
  categoryId = (await new CategoryService(db).create({ name: { tr: `Sepet ucu ${stamp}` } })).id;
  const { product, variants } = await new ProductService(db).create({
    name: { tr: `Sepet böreği ${stamp}` },
    categoryId,
    shelfLifeDays: 200,
    variants: [{ label: { tr: '500 g' } }],
  });
  productId = product.id;
  variantId = variants[0]!.id;
  await new PriceService(db).setPrice({ variantId, channel: 'b2c', amountCents: BIRIM_FIYAT });
  await new StockService(db).insert({
    warehouseId,
    variantId,
    physicalQty: 100,
    expiryDate: ileriGun(60),
    purchasePriceCents: 400,
  });

  const musteri = await signedInUser('musteri');
  musteriId = musteri.profileId;
  musteriToken = musteri.token;
  otekiId = (await signedInUser('oteki')).profileId;
});

beforeEach(async () => {
  // Her senaryo kendi sepetini kursun — önceki turun satırları adet iddialarını oynatır.
  const carts = new CartService(db);
  await carts.replace(musteriId, []);
  await carts.replace(otekiId, []);
});

afterAll(async () => {
  await purgeTestData(db, {
    productIds: [productId],
    categoryIds: [categoryId],
    profileIds,
    authUserIds,
    warehouseIds: [warehouseId],
  });
});

describe('kapının şekli — zarf yalnız GÖRÜNÜMÜ taşır', () => {
  /**
   * Beş ucun BEŞİ de aynı sözleşmeyi vermeli. Tek tek yazılıyor çünkü sızıntı tam da "biri
   * ötekinden ayrıldı" hâliydi: `GET` ve `POST /items` doğruydu, üçü değildi.
   */
  it.each([
    ['GET /', async () => req('')],
    ['POST /items', async () => req('/items', { method: 'POST', body: JSON.stringify(satir()) })],
    ['POST /takeover', async () => req('/takeover', { method: 'POST', body: JSON.stringify(satir()) })],
  ])('%s — `source` ve `place` SIZMAZ', async (_ad, çağır) => {
    const body = await dataOf<Record<string, unknown>>(await çağır());

    expect(body).not.toHaveProperty('source');
    expect(body).not.toHaveProperty('place');
    // Görünümün kendisi geldi mi — boş bir nesne de yukarıdaki iki iddiayı geçerdi (sahte yeşil).
    expect(body).toHaveProperty('lines');
  });

  it('PATCH ve DELETE de aynı sözleşmeyi verir', async () => {
    await req('/items', { method: 'POST', body: JSON.stringify(satir()) });
    // `lineId` AYRI bir kimlik DEĞİL, varyantın kendisidir (`readLineKey` künyesi): satır sepette
    // adresiyle yaşıyor. Ayrı bir kimlik uydurmak, sepetin veri modelini yanlış varsaymak olurdu.
    const lineId = variantId;

    const patched = await dataOf<Record<string, unknown>>(
      await req(`/items/${lineId}`, { method: 'PATCH', body: JSON.stringify({ qty: 3 }) }),
    );
    expect(patched).not.toHaveProperty('source');
    expect(patched).toHaveProperty('lines');

    const deleted = await dataOf<Record<string, unknown>>(await req(`/items/${lineId}`, { method: 'DELETE' }));
    expect(deleted).not.toHaveProperty('source');
    expect(deleted).toHaveProperty('lines');
  });
});

describe('sepet yazımı', () => {
  it('satır eklenir ve parasını SUNUCU hesaplar', async () => {
    const body = await dataOf<{ lines: { qty: number; unitPriceCents: number | null }[] }>(
      await req('/items', { method: 'POST', body: JSON.stringify(satir(2)) }),
    );

    expect(body.lines).toHaveLength(1);
    expect(body.lines[0]?.qty).toBe(2);
    expect(body.lines[0]?.unitPriceCents).toBe(BIRIM_FIYAT);
  });

  it('AYNI ADRES birleşir — ikinci satır açılmaz', async () => {
    await req('/items', { method: 'POST', body: JSON.stringify(satir(2)) });
    const body = await dataOf<{ lines: { qty: number }[] }>(
      await req('/items', { method: 'POST', body: JSON.stringify(satir(3)) }),
    );

    expect(body.lines).toHaveLength(1);
    expect(body.lines[0]?.qty).toBe(5);
  });

  it('GÖVDE LİSTE olmak zorunda — tek ürünlük tekil nesne reddedilir', async () => {
    // Eşzamanlı ekleme birbirini eziyordu; bir kullanıcı eylemi tek yazma turuna indirildi (09.08).
    const res = await req('/items', {
      method: 'POST',
      body: JSON.stringify({ kind: 'variant', variantId, qty: 1 }),
    });

    expect(res.status).toBe(400);
  });

  it('adet DEĞİŞTİRİLİR', async () => {
    await req('/items', { method: 'POST', body: JSON.stringify(satir(2)) });

    const body = await dataOf<{ lines: { qty: number }[] }>(
      await req(`/items/${variantId}`, { method: 'PATCH', body: JSON.stringify({ qty: 7 }) }),
    );
    expect(body.lines[0]?.qty).toBe(7);
  });

  it('satır SİLİNİR', async () => {
    await req('/items', { method: 'POST', body: JSON.stringify(satir(2)) });

    const body = await dataOf<{ lines: unknown[] }>(await req(`/items/${variantId}`, { method: 'DELETE' }));
    expect(body.lines).toEqual([]);
  });

  it('BAŞKASININ satırı silinemez — kimlik jetondan, gövdeden değil', async () => {
    // Öteki müşterinin sepetine satır konur; bizim jetonumuzla o satırın kimliği silinmeye
    // çalışılır. Sepet müşteri başına tek satırda yaşadığı için istek bizim sepetimizde çalışır
    // ve ötekinin sepetine DOKUNMAZ.
    await new CartService(db).addItems(otekiId, [{ variantId, qty: 4, stockId: null, unitPrice: BIRIM_FIYAT }]);

    // Aynı varyant adresiyle silme denemesi: istek BİZİM sepetimizde çalışır (kimlik jetondan),
    // ötekinin sepetine hiç dokunmaz.
    await req(`/items/${variantId}`, { method: 'DELETE' });

    const oteki = await new CartService(db).get(otekiId);
    expect(oteki.items).toHaveLength(1);
  });
});

describe('misafir sepetinin devri', () => {
  it('sunucudaki sepet KORUNUR, gelen kalemler ÜSTÜNE eklenir', async () => {
    // Ezseydi, telefonunda boş sepetle giriş yapan müşteri masaüstünde biriktirdiğini kaybederdi.
    await new CartService(db).addItems(musteriId, [{ variantId, qty: 2, stockId: null, unitPrice: BIRIM_FIYAT }]);

    const body = await dataOf<{ lines: { qty: number }[] }>(
      await req('/takeover', { method: 'POST', body: JSON.stringify(satir(3)) }),
    );

    expect(body.lines).toHaveLength(1);
    expect(body.lines[0]?.qty).toBe(5);
  });

  it('BOŞ liste geçerli bir gövdedir — sepeti aynen döndürür', async () => {
    await new CartService(db).addItems(musteriId, [{ variantId, qty: 2, stockId: null, unitPrice: BIRIM_FIYAT }]);

    const body = await dataOf<{ lines: { qty: number }[] }>(
      await req('/takeover', { method: 'POST', body: JSON.stringify({ items: [] }) }),
    );

    expect(body.lines[0]?.qty).toBe(2);
  });
});

describe('kapı', () => {
  it('Bearer olmadan 401', async () => {
    expect((await app.request('/api/v1/me/cart?locale=tr')).status).toBe(401);
  });
});
