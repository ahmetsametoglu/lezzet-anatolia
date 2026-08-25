import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CategoryService, PriceService, ProductService, StockService, serviceDb } from '@lezzet/database';
import { createTestWarehouse, purgeTestData } from '@lezzet/database/testing';
import { app } from '../../app';

/**
 * MİSAFİRİN SEPET GÖRÜNÜMÜ — `POST /api/v1/cart/view`, Bearer'SIZ (21.21).
 *
 * ── UCUN VAR OLMA SEBEBİ ────────────────────────────────────────────────────
 * Sepet oturumsuz doldurulur (satırları cihaz taşır) ama o sepetin **PARASI sunucunun kararıdır**.
 * Fiyatı/tükendiyi/asgari sepeti istemciye hesaplatmak, aynı sepetin misafirken bir, giriş yapınca
 * başka bir tutar göstermesi demekti.
 *
 * ── ÇİVİLENEN ÜÇ KARAR ──────────────────────────────────────────────────────
 * 1. **NİYET gövdeden, FİYAT asla.** Gövde satırın yalnız ADRESİNİ ve adedini taşır. İstemcinin
 *    gönderdiği bir tutar kabul edilseydi sepet, müşterinin kendi belirlediği fiyattan kurulurdu.
 * 2. **HİÇBİR ŞEY YAZMAZ.** Uç bir görünüm üretir; sunucuda satır açsaydı girişli kullanıcının
 *    sepeti buradan gölgelenebilirdi.
 * 3. **`source` ve `place` SUNUCUDA KALIR.** Okuma kapısı üçünü birden döndürüyor
 *    (`CartRead = {body, source, place}`) ve `ok()` GEVŞEK TİPLİ — tamamını göndermek derlemede
 *    HATA VERMEZDİ. Bu sızıntı 24.08'de gerçekten oldu ve **gözle** yakalandı; testi olsaydı
 *    kendiliğinden yakalanırdı. Bu dosyanın yazılma sebeplerinden biri o.
 */
const db = serviceDb();
const stamp = Date.now();

let warehouseId: string;
let categoryId: string;
let productId: string;
let variantId: string;

const BIRIM_FIYAT = 1250;
const ileriGun = (offset: number): string => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

async function dataOf<T>(res: Response): Promise<T> {
  const envelope = (await res.json()) as { data: T; error: string | null };
  expect(envelope.error).toBeNull();
  return envelope.data;
}

async function errorOf(res: Response): Promise<string> {
  return ((await res.json()) as { error: string }).error;
}

/**
 * Misafir sepeti isteği — gövde niyeti taşır, dil SORGU DİZESİNDEN gelir.
 *
 * `?locale=` zorunlu ve varsayılansız (`localeOf` künyesi): `resolveLocalizedText` dil verilmezse
 * kanonik sıraya düşer ve Fransız müşteriye sessizce Türkçe ürün adı gönderilirdi. İlk taslak
 * `accept-language` BAŞLIĞINI kullanıyordu ve altı iddia birden 400 aldı — testin kendi hatası,
 * ölçüldü 25.08.
 */
function view(body: unknown, locale = 'tr') {
  return app.request(`/api/v1/cart/view?locale=${locale}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const satir = (over: Record<string, unknown> = {}) => ({ kind: 'variant', variantId, qty: 2, stockId: null, ...over });

beforeAll(async () => {
  warehouseId = (await createTestWarehouse(db, { label: 'MSF' })).id;
  categoryId = (await new CategoryService(db).create({ name: { tr: `Misafir sepeti ${stamp}` } })).id;
  const { product, variants } = await new ProductService(db).create({
    name: { tr: `Misafir böreği ${stamp}` },
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
    physicalQty: 50,
    expiryDate: ileriGun(60),
    purchasePriceCents: 400,
  });
});

afterAll(async () => {
  await purgeTestData(db, { productIds: [productId], categoryIds: [categoryId], warehouseIds: [warehouseId] });
});

describe('POST /api/v1/cart/view', () => {
  it('misafir sepetinin parasını SUNUCU hesaplar', async () => {
    const res = await view({ items: [satir()] });

    expect(res.status).toBe(200);
    const body = await dataOf<{ lines: { unitPriceCents: number | null }[] }>(res);
    expect(body.lines).toHaveLength(1);
    expect(body.lines[0]?.unitPriceCents).toBe(BIRIM_FIYAT);
  });

  it('İSTEMCİNİN GÖNDERDİĞİ FİYAT yok sayılır — sepet müşterinin belirlediği tutardan kurulmaz', async () => {
    // Uydurulmuş bir tutar ne kabul edilir ne isteği düşürür: gövde şeması yalnız adres + adet
    // tanıyor, fazlası süzülüyor.
    const res = await view({ items: [satir({ unitPriceCents: 1, lineTotalCents: 1 })] });

    expect(res.status).toBe(200);
    const body = await dataOf<{ lines: { unitPriceCents: number | null }[] }>(res);
    expect(body.lines[0]?.unitPriceCents).toBe(BIRIM_FIYAT);
  });

  it('`source` ve `place` ZARFA SIZMAZ — okuma kapısı üçünü birden döndürüyor', async () => {
    // 24.08'de gerçekten sızdı ve gözle yakalandı: `ok()` gevşek tipli, tamamını göndermek
    // derlemede hata vermiyor. Bu iddia o sızıntının geri gelmesini yakalar.
    const body = await dataOf<Record<string, unknown>>(await view({ items: [satir()] }));

    expect(body).not.toHaveProperty('source');
    expect(body).not.toHaveProperty('place');
    expect(body).not.toHaveProperty('warehouseId');
  });

  it('HİÇBİR ŞEY YAZMAZ — sunucuda sepet satırı doğmaz', async () => {
    const oncesi = await db.from('cart').select('id', { count: 'exact', head: true });
    await view({ items: [satir()] });
    const sonrasi = await db.from('cart').select('id', { count: 'exact', head: true });

    expect(sonrasi.count).toBe(oncesi.count);
  });

  it('BOŞ sepet geçerli bir istektir — hata değil', async () => {
    const res = await view({ items: [] });

    expect(res.status).toBe(200);
    expect((await dataOf<{ lines: unknown[] }>(res)).lines).toEqual([]);
  });

  it('BOZUK gövde 400 `invalid_body`', async () => {
    const res = await view({ items: [{ kind: 'variant', qty: 'iki' }] });

    expect(res.status).toBe(400);
    expect(await errorOf(res)).toBe('invalid_body');
  });

  it('TANINMAYAN dil 400 `invalid_locale` — cevap dile bağlı, tahmin edilmez', async () => {
    const res = await view({ items: [satir()] }, 'zz');

    expect(res.status).toBe(400);
    expect(await errorOf(res)).toBe('invalid_locale');
  });

  it('olmayan varyant sepeti DÜŞÜRMEZ — kalan satırlar yine hesaplanır', async () => {
    // Cihazdaki sepet bayat olabilir (ürün silinmiş, varyant kapanmış). İsteği tümden reddetmek,
    // müşteriye sepetini hiç göstermemek olurdu.
    const res = await view({
      items: [satir(), satir({ variantId: '00000000-0000-4000-9000-000000000000' })],
    });

    expect(res.status).toBe(200);
    const body = await dataOf<{ lines: unknown[] }>(res);
    expect(body.lines.length).toBeGreaterThan(0);
  });
});
