import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  AddressService,
  CartService,
  CategoryService,
  DeliveryZoneService,
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
 * ÖDEME ADIMI — `/api/v1/me/checkout`, iki uç (21.22).
 *
 * ── ÇİVİLENEN ASIL KARAR: NİYET SUNUCUDAN, GÖVDEDEN ASLA ────────────────────
 * Siparişin KALEMLERİ istemciden gelmiyor; sunucudaki sepetten okunuyor (`cart.customer_id`).
 * Gövde yalnız "nasıl" sorusunu cevaplıyor: adres, gün, kupon, hesaba yazım.
 *
 * **Bu kural gevşerse istemci ne isterse sipariş eder** — kendi seçtiği ürünü, kendi yazdığı
 * adetle. Ve gevşemesi kolay: gövdeye bir `items` alanı eklemek "esneklik" gibi görünür.
 * Aşağıdaki iddia, gövdeye kalem listesi konduğunda siparişin SEPETTEN kurulduğunu ölçüyor.
 *
 * ── İKİNCİ KARAR: SEPET PARMAK İZİ ──────────────────────────────────────────
 * `expectedCartFingerprint` "ekranın gördüğü sepet hâlâ bu mu" sorusunu soruyor ve BOŞ
 * BIRAKILABİLİR — o hâlde kontrol atlanır, eski istemciler kırılmaz. Zorunlu yapmak, güncellemeyen
 * her cihazı ödeme yapamaz hâle getirirdi.
 *
 * ── NE SINANMIYOR VE NEDEN ──────────────────────────────────────────────────
 * Siparişin GERÇEKTEN doğması ödeme sağlayıcısına, stok rezervasyonuna ve teslimat penceresine
 * bağlı; o zincir `packages/application`ın kendi testlerinde. Burada sınanan TAŞIMA: niyetin
 * kaynağı, gövde denetimi, kapı ve retlerin adlandırılması.
 */
const db = serviceDb();
const stamp = Date.now();

const authUserIds: string[] = [];
const profileIds: string[] = [];
let warehouseId: string;
let categoryId: string;
let productId: string;
let variantId: string;
let ikinciProductId: string;
let ikinciVariantId: string;
let musteriId: string;
let musteriToken: string;
let addressId: string;

const BIRIM_FIYAT = 1250;
const ileriGun = (offset: number): string => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

async function signedInUser(label: string) {
  const email = `checkout-api-${label}-${stamp}@example.test`;
  const password = randomUUID();
  const { data: created, error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !created.user) throw new Error(`test kullanıcısı açılamadı: ${error?.message ?? 'kullanıcı yok'}`);
  authUserIds.push(created.user.id);

  const profiles = new UserProfileService(db);
  const profile = await profiles.findByAuthUserId(created.user.id);
  if (!profile) throw new Error('auth trigger profil satırı açmadı');
  profileIds.push(profile.id);
  await profiles.update({ id: profile.id, roles: ['customer'], name: `Ödeme ${label}` });

  const { data: session, error: signInError } = await anonDb().auth.signInWithPassword({ email, password });
  if (signInError || !session.session) throw new Error(`oturum açılamadı: ${signInError?.message ?? 'oturum yok'}`);
  return { profileId: profile.id, token: session.session.access_token };
}

/** Ödeme uçları da dili SORGU DİZESİNDEN okur (`localeOf`, sepet ailesinin ortak kapısı). */
function req(path: string, init: RequestInit = {}) {
  const sep = path.includes('?') ? '&' : '?';
  return app.request(`/api/v1/me/checkout${path}${sep}locale=tr`, {
    ...init,
    headers: { authorization: `Bearer ${musteriToken}`, 'content-type': 'application/json', ...(init.headers ?? {}) },
  });
}

async function dataOf<T>(res: Response): Promise<T> {
  const envelope = (await res.json()) as { data: T; error: string | null };
  expect(envelope.error).toBeNull();
  return envelope.data;
}

beforeAll(async () => {
  warehouseId = (await createTestWarehouse(db, { label: 'ODM' })).id;
  categoryId = (await new CategoryService(db).create({ name: { tr: `Ödeme ucu ${stamp}` } })).id;
  const { product, variants } = await new ProductService(db).create({
    name: { tr: `Ödeme böreği ${stamp}` },
    categoryId,
    shelfLifeDays: 200,
    variants: [{ label: { tr: '500 g' } }],
  });
  productId = product.id;
  variantId = variants[0]!.id;

  /* İKİNCİ ürün AYRI, ikinci varyant değil — ve bu testin ayırt ediciliği için ŞART: ret cevabı
     engellenen kalemi ÜRÜN ADIYLA söylüyor, aynı ürünün iki boyu aynı adı taşırdı ve "gövde mi
     sepet mi okundu" sorusu cevapsız kalırdı. */
  const ikinci = await new ProductService(db).create({
    name: { tr: `Gövdeden gelen ${stamp}` },
    categoryId,
    shelfLifeDays: 200,
    variants: [{ label: { tr: '1 kg' } }],
  });
  ikinciProductId = ikinci.product.id;
  ikinciVariantId = ikinci.variants[0]!.id;

  const prices = new PriceService(db);
  await prices.setPrice({ variantId, channel: 'b2c', amountCents: BIRIM_FIYAT });
  await prices.setPrice({ variantId: ikinciVariantId, channel: 'b2c', amountCents: BIRIM_FIYAT * 2 });

  const stocks = new StockService(db);
  for (const v of [variantId, ikinciVariantId]) {
    await stocks.insert({ warehouseId, variantId: v, physicalQty: 100, expiryDate: ileriGun(60), purchasePriceCents: 400 });
  }
  await new DeliveryZoneService(db).insert({
    name: `Ödeme ucu rotası ${stamp}`,
    warehouseId,
    weekdays: [1, 2, 3, 4, 5, 6, 7],
  });

  const musteri = await signedInUser('musteri');
  musteriId = musteri.profileId;
  musteriToken = musteri.token;
  addressId = (await new AddressService(db).insert({
    customerId: musteriId,
    recipient: 'Ödeme Müşterisi',
    phone: '+33600000000',
    line1: '1 rue du Test',
    postalCode: '67000',
    city: 'Strasbourg',
  })).id;
});

beforeEach(async () => {
  await new CartService(db).replace(musteriId, []);
});

afterAll(async () => {
  await purgeTestData(db, {
    productIds: [productId, ikinciProductId],
    categoryIds: [categoryId],
    profileIds,
    authUserIds,
    warehouseIds: [warehouseId],
  });
});

/** Sepete bir satır koyar — niyetin SUNUCUDAKİ kaynağı. */
async function sepeteKoy(v = variantId, qty = 2) {
  await new CartService(db).addItems(musteriId, [{ variantId: v, qty, stockId: null, unitPrice: BIRIM_FIYAT }]);
}

describe('GET /api/v1/me/checkout — taslak', () => {
  it('Bearer olmadan 401', async () => {
    expect((await app.request('/api/v1/me/checkout?locale=tr')).status).toBe(401);
  });

  it('taslak SEPETTEN kurulur', async () => {
    // Satırlar `summary` altında yaşıyor (`CheckoutSnapshotSchema`: addresses · delivery ·
    // payment · summary) — ilk taslak onları kökte aramıştı.
    await sepeteKoy();
    const draft = await dataOf<{ summary: { lines: { qty: number }[] } | null }>(await req(''));

    expect(draft.summary?.lines).toHaveLength(1);
    expect(draft.summary?.lines[0]?.qty).toBe(2);
  });

  it('BOŞ sepette de taslak döner — ekran "sepetin boş" diyebilmeli', async () => {
    // 404/400 dönmek, ekranı hata sayfasına düşürür ve müşteriye ne yapması gerektiğini
    // söylemeyen bir cümle kurdurur. `summary` bu hâlde `null` olabilir ve o da bir CEVAPTIR:
    // "özetlenecek bir şey yok" — sıfırlarla dolu sahte bir özet üretmekten dürüst.
    const res = await req('');

    expect(res.status).toBe(200);
    const draft = await dataOf<{ addresses: unknown[]; summary: { lines: unknown[] } | null }>(res);
    expect(Array.isArray(draft.addresses)).toBe(true);
    expect(draft.summary?.lines ?? []).toEqual([]);
  });
});

describe('POST /api/v1/me/checkout/order — niyetin kaynağı', () => {
  it('Bearer olmadan 401', async () => {
    const res = await app.request('/api/v1/me/checkout/order?locale=tr', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ addressId }),
    });

    expect(res.status).toBe(401);
  });

  it('GÖVDEDEKİ kalem listesi YOK SAYILIR — sipariş SEPETTEN kurulur', async () => {
    /* Bu dosyanın asıl iddiası. Sepette BİRİNCİ ürün var; gövdeye İKİNCİ ürün konuyor.
       Gövde dinlenseydi müşteri, sepetine hiç koymadığı bir ürünü sipariş edebilirdi — ve kural
       gevşediğinde hiçbir yer hata vermez, yalnız sipariş "istemcinin dediği" olur.

       ── İDDİA SEPETE DEĞİL, CEVABA BAKIYOR ─────────────────────────────────
       İlk taslak "sepet değişmedi mi" diye soruyordu ve SAHTE YEŞİLDİ: sabotajla kaynağı gövdeye
       çevirdik, sepet yine değişmedi ve test geçti (ölçüldü 25.08). Sepet zaten değişmiyor —
       sınanması gereken, siparişin NEREDEN okunduğu.
       Cevap bunu söylüyor: bu fikstürde rota posta kodunu kapsamadığı için sipariş açılmıyor ve
       ret, engellenen kalemi ÜRÜN ADIYLA döndürüyor (`blocked_lines`). Sepetteki ürünün adı
       geliyorsa niyet sunucudan okunmuştur; gövdedekinin adı gelseydi kural çökmüş demektir. */
    await sepeteKoy(variantId, 2);

    const res = await req('/order', {
      method: 'POST',
      body: JSON.stringify({
        addressId,
        paymentMethod: 'cash',
        items: [{ kind: 'variant', variantId: ikinciVariantId, qty: 99, stockId: null }],
      }),
    });

    expect(res.status).toBe(200);
    const outcome = await dataOf<{ status: string; lines?: string[] }>(res);
    expect(outcome.status).toBe('blocked_lines');
    expect(outcome.lines?.join(' ')).toContain('Ödeme böreği');
    expect(outcome.lines?.join(' ')).not.toContain('Gövdeden gelen');

    // Sepet de kirlenmemiş olmalı — gövde bir YAZMA kapısı değil.
    const stored = await new CartService(db).get(musteriId);
    expect(stored.items).toHaveLength(1);
    expect(stored.items[0]?.variantId).toBe(variantId);
  });

  it('ADRESSİZ gövde 400 — sipariş nereye gideceğini bilmeden açılmaz', async () => {
    await sepeteKoy();
    const res = await req('/order', { method: 'POST', body: JSON.stringify({}) });

    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe('invalid_body');
  });

  it('BOZUK adres kimliği 400 — uuid olmayan değer şemadan geçmez', async () => {
    await sepeteKoy();
    const res = await req('/order', {
      method: 'POST',
      body: JSON.stringify({ addressId: 'adres-yok', paymentMethod: 'cash' }),
    });

    expect(res.status).toBe(400);
  });

  it('gövdesiz istek 400 — boş POST bir sipariş niyeti değildir', async () => {
    await sepeteKoy();
    const res = await req('/order', { method: 'POST' });

    expect(res.status).toBe(400);
  });

  it('PARMAK İZİ boş bırakılabilir — eski istemciler kırılmaz', async () => {
    // Zorunlu yapmak, güncellemeyen her cihazı ödeme yapamaz hâle getirirdi. Alan verilmediğinde
    // istek ŞEMADAN geçmeli; iş kuralı sonucu ne olursa olsun 400 `invalid_body` DÖNMEMELİ.
    // (`paymentMethod` ZORUNLU ve varsayılansız — o yüzden gövdede duruyor.)
    await sepeteKoy();
    const res = await req('/order', {
      method: 'POST',
      body: JSON.stringify({ addressId, paymentMethod: 'cash' }),
    });

    if (res.status === 400) {
      expect(((await res.json()) as { error: string }).error).not.toBe('invalid_body');
    }
  });
});
