import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  CategoryService,
  DeliveryZoneService,
  OrderService,
  ProductService,
  StockService,
  UserProfileService,
  anonDb,
  serviceDb,
} from '@lezzet/database';
import { createTestWarehouse, purgeTestData } from '@lezzet/database/testing';
import { openNeighborInvite } from '@lezzet/application';
import { app } from '../../app';

/**
 * DAVET UÇLARI — açık karşılama + Bearer'ın ardındaki kabul (21.43 · 21.44 · 21.45).
 *
 * ── KARAR KATMANI ZATEN ÇİVİLİ, BURASI TAŞIMA ───────────────────────────────
 * Kimin kazandığı, sıranın ne olduğu, kullanım hakkının nasıl sayıldığı
 * `packages/application/src/customer/neighbor.test.ts`te (21 iddia). Burada ölçülen üç şey:
 * **kapı açık mı**, **jeton VARSA okunuyor mu**, **zarfa sızmaması gereken alan sızıyor mu**.
 *
 * ── EN KIRILGAN KARAR: AÇIK AMA KİMLİĞE DUYARLI ─────────────────────────────
 * Karşılama uçları Bearer İSTEMEZ — bağlantıyı açan kişi henüz müşterimiz değil, davetin bütün
 * amacı o. Ama jeton VARSA okunur ve cevap zenginleşir: kendi bağlantısını açan müşteri `self`
 * cevabını alır. Bu ikisi kolayca birbirine karışır — `bearerAuth`ın arkasına taşımak daveti
 * kapıda hesap istemeye çevirir, `optionalCustomerId`i düşürmek ise `self` hâlini öldürür.
 * İkisi de hata vermez.
 *
 * ── VE BİR SIZINTI SINIRI ───────────────────────────────────────────────────
 * Komşu karşılaması motorda `deliveryZoneId` de taşıyor; şemada YOK ve `parse` süzüyor. Bölge
 * kimliği operasyonun iç künyesidir — komşuya söylenecek şey GÜNDÜR.
 */
const db = serviceDb();
const stamp = Date.now();

const authUserIds: string[] = [];
const profileIds: string[] = [];
let warehouseId: string;
let categoryId: string;
let productId: string;
let variantId: string;
let zoneId: string;

let davetEdenId: string;
let davetEdenToken: string;
let davetEdenKodu: string;
let komsuToken: string;
let neighborToken: string;

const ileriGun = (offset: number): string => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

async function signedInUser(label: string) {
  const email = `invite-api-${label}-${stamp}@example.test`;
  const password = `Davet!${stamp}`;
  const { data: created, error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !created.user) throw new Error(`test kullanıcısı açılamadı: ${error?.message ?? 'kullanıcı yok'}`);
  authUserIds.push(created.user.id);

  const profiles = new UserProfileService(db);
  const profile = await profiles.findByAuthUserId(created.user.id);
  if (!profile) throw new Error('auth trigger profil satırı açmadı');
  profileIds.push(profile.id);
  await profiles.update({ id: profile.id, roles: ['customer'], name: `Davet ${label}` });

  const { data: session, error: signInError } = await anonDb().auth.signInWithPassword({ email, password });
  if (signInError || !session.session) throw new Error(`oturum açılamadı: ${signInError?.message ?? 'oturum yok'}`);
  return { profileId: profile.id, token: session.session.access_token };
}

const auth = (token: string) => ({ authorization: `Bearer ${token}` });

async function dataOf<T>(res: Response): Promise<T> {
  const envelope = (await res.json()) as { data: T; error: string | null };
  expect(envelope.error).toBeNull();
  return envelope.data;
}

beforeAll(async () => {
  warehouseId = (await createTestWarehouse(db, { label: 'DVT' })).id;
  categoryId = (await new CategoryService(db).create({ name: { tr: `Davet ucu ${stamp}` } })).id;
  const { product, variants } = await new ProductService(db).create({
    name: { tr: `Davet böreği ${stamp}` },
    categoryId,
    shelfLifeDays: 200,
    variants: [{ label: { tr: '500 g' } }],
  });
  productId = product.id;
  variantId = variants[0]!.id;
  zoneId = (await new DeliveryZoneService(db).insert({
    name: `Davet ucu rotası ${stamp}`,
    warehouseId,
    weekdays: [1, 2, 3, 4, 5, 6, 7],
  })).id;
  await new StockService(db).insert({ warehouseId, variantId, physicalQty: 50, expiryDate: ileriGun(60), purchasePriceCents: 300 });

  const davetEden = await signedInUser('eden');
  davetEdenId = davetEden.profileId;
  davetEdenToken = davetEden.token;
  komsuToken = (await signedInUser('komsu')).token;

  // Getiren kodu kartın GET'i sırasında üretiliyor (tembel üretim); uç üzerinden aldırıyoruz ki
  // test, kodun gerçekten müşteriye verilen kod olduğunu ölçsün.
  const card = await dataOf<{ points: { referralCode: string } | null }>(
    await app.request('/api/v1/me/points', { headers: auth(davetEdenToken) }),
  );
  davetEdenKodu = card.points?.referralCode ?? '';

  // Komşu daveti bir rota siparişinden doğar.
  const { order } = await new OrderService(db).create(
    {
      warehouseId,
      customerId: davetEdenId,
      channel: 'b2c',
      deliveryType: 'route',
      deliveryZoneId: zoneId,
      deliveryDate: ileriGun(3),
      totalCents: 2000,
    },
    [{ variantId, qty: 1, unitPriceCents: 2000, vatRate: 5.5 }],
  );
  const outcome = await openNeighborInvite(db, { orderId: order.id, customerId: davetEdenId });
  if (outcome.status !== 'ok') throw new Error(`komşu daveti açılamadı: ${outcome.status}`);
  neighborToken = outcome.invite.token;
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

describe('GET /api/v1/invite/:code — getiren daveti', () => {
  it('KİMLİKSİZ okunur ve davet edenin adını verir', async () => {
    const res = await app.request(`/api/v1/invite/${davetEdenKodu}`);

    expect(res.status).toBe(200);
    const welcome = await dataOf<{ status: string; referrerName?: string }>(res);
    expect(welcome.status).toBe('ok');
    expect(welcome.referrerName).toBeTruthy();
  });

  it('tanınmayan kod `unknown` — 404 DEĞİL', async () => {
    // Karşılama ekranı beş hâli de kendisi çiziyor; HTTP hatası dönmek onu hata sayfasına
    // düşürür ve davetliye "bağlantın bozuk" yerine "bir şeyler ters gitti" dedirtirdi.
    const res = await app.request(`/api/v1/invite/yok-${stamp}`);

    expect(res.status).toBe(200);
    expect((await dataOf<{ status: string }>(res)).status).toBe('unknown');
  });

  it('JETON VARSA okunur — kendi bağlantısını açan `self` görür', async () => {
    // Kırılgan dal: `optionalCustomerId` düşerse bu hâl sessizce ölür ve davet eden, kendi
    // bağlantısını "geçerli davet" diye görür.
    const res = await app.request(`/api/v1/invite/${davetEdenKodu}`, { headers: auth(davetEdenToken) });

    expect((await dataOf<{ status: string }>(res)).status).toBe('self');
  });

  it('BOZUK jetonla da açılır — kapı kapanmaz', async () => {
    // Açık uçta geçersiz bir jeton, kimliksizlikten farksızdır: bağlantıyı 401'e düşürmek,
    // eski oturumu bozulmuş bir davetliyi kapıda bırakırdı.
    const res = await app.request(`/api/v1/invite/${davetEdenKodu}`, { headers: { authorization: 'Bearer uydurma' } });

    expect(res.status).toBe(200);
    expect((await dataOf<{ status: string }>(res)).status).toBe('ok');
  });
});

describe('GET /api/v1/neighbor/:token — komşu daveti', () => {
  it('KİMLİKSİZ okunur; davet edenin adı ve GÜN gelir', async () => {
    const res = await app.request(`/api/v1/neighbor/${neighborToken}`);

    expect(res.status).toBe(200);
    const welcome = await dataOf<{ status: string; inviterName?: string; deliveryDate?: string }>(res);
    expect(welcome.status).toBe('ok');
    expect(welcome.inviterName).toBeTruthy();
    expect(welcome.deliveryDate).toBeTruthy();
  });

  it('BÖLGE KİMLİĞİ zarfa SIZMAZ — komşuya söylenecek şey gündür', async () => {
    // Motor `deliveryZoneId` de taşıyor; şema onu süzüyor. Sızsaydı operasyonun iç künyesi
    // tanımadığımız kanallarda dolaşan bir bağlantının cevabında görünürdü.
    const welcome = await dataOf<Record<string, unknown>>(await app.request(`/api/v1/neighbor/${neighborToken}`));

    expect(welcome).not.toHaveProperty('deliveryZoneId');
    expect(welcome).not.toHaveProperty('inviteId');
  });

  it('kendi bağlantısını açan `self` görür', async () => {
    const res = await app.request(`/api/v1/neighbor/${neighborToken}`, { headers: auth(davetEdenToken) });

    expect((await dataOf<{ status: string }>(res)).status).toBe('self');
  });

  it('tanınmayan belirteç `unknown`', async () => {
    const res = await app.request(`/api/v1/neighbor/yok-${stamp}`);

    expect((await dataOf<{ status: string }>(res)).status).toBe('unknown');
  });
});

describe('POST /api/v1/me/invite/claim — kabul', () => {
  it('Bearer olmadan 401 — kabul kimliğe yazılır', async () => {
    const res = await app.request('/api/v1/me/invite/claim', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ referralCode: davetEdenKodu }),
    });

    expect(res.status).toBe(401);
  });

  it('komşu belirteci kabul edilir ve cevap HEP `true`', async () => {
    const res = await app.request('/api/v1/me/invite/claim', {
      method: 'POST',
      headers: { ...auth(komsuToken), 'content-type': 'application/json' },
      body: JSON.stringify({ neighborToken }),
    });

    expect(res.status).toBe(200);
    expect(await dataOf<boolean>(res)).toBe(true);
  });

  it('GEÇERSİZ davet de `true` döner — kaydolmayı bitirmiş kişiye "davetin geçersiz" denmez', async () => {
    // Kararın kendisi: bağın kurulup kurulmadığı istemciyi ilgilendirmiyor, reddin gerekçesi
    // log'a düşer. `false` dönmek ekranı bir hata cümlesi kurmaya davet ederdi.
    const res = await app.request('/api/v1/me/invite/claim', {
      method: 'POST',
      headers: { ...auth(komsuToken), 'content-type': 'application/json' },
      body: JSON.stringify({ referralCode: `yok-${stamp}` }),
    });

    expect(res.status).toBe(200);
    expect(await dataOf<boolean>(res)).toBe(true);
  });

  it('İKİSİ DE eksikse 400 — boş gövde bir davet değildir', async () => {
    const res = await app.request('/api/v1/me/invite/claim', {
      method: 'POST',
      headers: { ...auth(komsuToken), 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
  });
});
