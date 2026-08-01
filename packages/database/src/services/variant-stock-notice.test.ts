import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { serviceDb } from '../client';
import { CategoryService } from './category.service';
import { ProductService } from './product.service';
import { VariantStockNoticeService } from './variant-stock-notice.service';
import { purgeTestData } from '../testing/cleanup';

/**
 * Varyant + yer bazlı stok bildirimi (19.12).
 *
 * Sınanan şey iki kural: **aynı bekleyiş ikinci kez yazılmaz** (düğmeye tekrar basmak yeni bir
 * bekleyiş değil) ve **haber verilmiş kayıt yeni bekleyişi engellemez** (müşteri aynı ürünü aylar
 * sonra yeniden bekleyebilir; bu yeni bir sözdür).
 *
 * Anahtar YER'dir, depo değil — bölge ileride başka depoya bağlansa da söz ayakta kalır.
 */
const db = serviceDb();
const svc = new VariantStockNoticeService(db);
const stamp = Date.now();
const email = `bekleyen-${stamp}@ornek.fr`;

let categoryId: string;
let productId: string;
let variantId: string;

beforeAll(async () => {
  categoryId = (await new CategoryService(db).create({ name: { tr: `Bildirim ${stamp}` } })).id;
  const { product, variants } = await new ProductService(db).create({
    name: { tr: `Bildirim ürünü ${stamp}` },
    categoryId,
    variants: [{ label: { tr: '1 kg' } }],
  });
  productId = product.id;
  variantId = variants[0]!.id;
});

afterAll(async () => {
  await db.from('variant_stock_notice').delete().eq('variant_id', variantId);
  await purgeTestData(db, { productIds: [productId], categoryIds: [categoryId] });
});

describe('varyant + yer bildirimi', () => {
  it('kayıt yerin (ülke, kod) ikilisiyle tutulur — depo ile DEĞİL', async () => {
    const row = await svc.record({ variantId, country: 'FR', postalCode: '67000', email });
    expect(row).toMatchObject({ variantId, country: 'FR', postalCode: '67000', notifiedAt: null });
    // Şemada `warehouseId` diye bir alan YOK: söz müşterinin adresi hakkında, bizim iç
    // coğrafyamız hakkında değil.
    expect(row).not.toHaveProperty('warehouseId');
  });

  it('aynı bekleyiş ikinci kez YAZILMAZ — düğmeye tekrar basmak yeni bekleyiş değil', async () => {
    const first = await svc.record({ variantId, country: 'FR', postalCode: '67000', email });
    const second = await svc.record({ variantId, country: 'FR', postalCode: '67000', email });
    expect(second.id).toBe(first.id);
  });

  it('AYNI kod başka ülkede ayrı bir bekleyiştir', async () => {
    const fr = await svc.record({ variantId, country: 'FR', postalCode: '67000', email });
    const de = await svc.record({ variantId, country: 'DE', postalCode: '67000', email });
    expect(de.id).not.toBe(fr.id);
  });

  it('haber verilmiş kayıt yeni bekleyişi ENGELLEMEZ — bu yeni bir söz', async () => {
    const kod = '75011';
    const first = await svc.record({ variantId, country: 'FR', postalCode: kod, email });
    await svc.update({ id: first.id, notifiedAt: new Date().toISOString() });

    const again = await svc.record({ variantId, country: 'FR', postalCode: kod, email });
    expect(again.id).not.toBe(first.id);
    expect(again.notifiedAt).toBeNull();
  });

  it('bekleyenler yalnız HABER VERİLMEMİŞ olanlardır', async () => {
    const kod = '69007';
    const row = await svc.record({ variantId, country: 'FR', postalCode: kod, email });
    expect((await svc.listPending(variantId, 'FR', kod)).map((r) => r.id)).toContain(row.id);

    await svc.update({ id: row.id, notifiedAt: new Date().toISOString() });
    expect((await svc.listPending(variantId, 'FR', kod)).map((r) => r.id)).not.toContain(row.id);
  });
});
