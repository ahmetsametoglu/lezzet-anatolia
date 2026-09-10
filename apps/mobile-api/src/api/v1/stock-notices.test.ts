import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CategoryService, ProductService, serviceDb, VariantStockNoticeService } from '@lezzet/database';
import { purgeTestData } from '@lezzet/database/testing';
import { app } from '../../app';
import { bearer, createSignedInUser, envelopeData, envelopeError } from '../../lib/testing';

/**
 * "GELİNCE HABER VER" — `POST /api/v1/me/stock-notices` (21.306).
 *
 * ── ÇİVİLENEN KARARLAR ──────────────────────────────────────────────────────
 * · E-posta GÖVDEDEN DEĞİL PROFİLDEN: gövdede yalnız boy + yer var; kayıt oturumun sahibine bağlanır.
 * · Yer MOTORA yeniden sorulur: cihazın yazdığı ama hiçbir yere düşmeyen kod kayda geçmez
 *   (`place_unknown`) — nereye haber vereceğimizi bilmeden söz verilmez.
 * · Tekrar yeni bir bekleyiş değildir: aynı boy + yer + kişi ikinci kez `already` döner ve satır
 *   açılmaz.
 *
 * Bearer'sız erişimin 401'i `router.test.ts`in korumalı uç listesinde.
 *
 * ── KODLAR NEDEN BUNLAR (ölçüldü 10.09, yerel veritabanı) ────────────────────
 * · `96000` → `place_unknown`: Fransa'da 96 numaralı bölge yok — FR referansında `96` önekli kod 0,
 *   hiçbir teslimat bölgesinde de yok. `00000` SEÇİLMEDİ: `testPostalCode` tam o bandı üretiyor ve
 *   tam pakette başka bir dosyanın kurduğu bölge aynı koda denk gelebilir.
 * · `67000` → kayıt: referansta yalnız FR satırı var (DE'de yok), çözüm FR'ye düşer.
 */
const db = serviceDb();
const stamp = Date.now();

const authUserIds: string[] = [];
const profileIds: string[] = [];
let token: string;
let profileId: string;
let categoryId: string;
let productId: string;
let variantId: string;

function post(body: unknown) {
  return app.request('/api/v1/me/stock-notices', {
    method: 'POST',
    headers: { ...bearer(token), 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeAll(async () => {
  categoryId = (await new CategoryService(db).create({ name: { tr: `Haber ucu ${stamp}` } })).id;
  const { product, variants } = await new ProductService(db).create({
    name: { tr: `Haber böreği ${stamp}` },
    categoryId,
    shelfLifeDays: 200,
    variants: [{ label: { tr: '500 g' } }],
  });
  productId = product.id;
  variantId = variants[0]!.id;

  const musteri = await createSignedInUser({ prefix: 'stock-notice-api', label: 'musteri' });
  authUserIds.push(musteri.authUserId);
  profileIds.push(musteri.profileId);
  profileId = musteri.profileId;
  token = musteri.token;
});

afterAll(async () => {
  await purgeTestData(db, { productIds: [productId], categoryIds: [categoryId], profileIds, authUserIds });
});

describe('POST /me/stock-notices', () => {
  it('boysuz gövde geçersiz istektir (400) — kayıt denenmez', async () => {
    const res = await post({ country: 'FR', postalCode: '67000' });

    expect(res.status).toBe(400);
    expect(await envelopeError(res)).toBe('invalid_body');
  });

  it('biçimsiz kod geçersiz istektir (400 `invalid_code`), müşteriye anlatılacak bir hâl değil', async () => {
    const res = await post({ variantId, country: 'FR', postalCode: '670' });

    expect(res.status).toBe(400);
    expect(await envelopeError(res)).toBe('invalid_code');
  });

  it('hiçbir yere düşmeyen kod `place_unknown` döner ve SATIR AÇILMAZ', async () => {
    const res = await post({ variantId, country: 'FR', postalCode: '96000' });

    expect(res.status).toBe(200);
    expect(await envelopeData(res)).toEqual({ status: 'place_unknown' });
    expect(await new VariantStockNoticeService(db).listPending(variantId, 'FR', '96000')).toHaveLength(0);
  });

  it('kayıt bırakılır — e-posta PROFİLDEN, sahip oturumun kişisi; ikinci basış `already` ve yeni satır yok', async () => {
    const first = await post({ variantId, country: 'FR', postalCode: '67000' });
    expect(first.status).toBe(200);
    expect(await envelopeData(first)).toEqual({ status: 'ok' });

    const second = await post({ variantId, country: 'FR', postalCode: '67000' });
    expect(await envelopeData(second)).toEqual({ status: 'already' });

    const rows = await new VariantStockNoticeService(db).listPending(variantId, 'FR', '67000');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ customerId: profileId, notifiedAt: null });
    expect(rows[0]!.email).toMatch(/^stock-notice-api-musteri-.*@example\.test$/);
  });
});
