import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CategoryService, ProductService, SupplierProductService, SupplierService, serviceDb } from '@lezzet/database';
import { purgeTestData } from '@lezzet/database/testing';
import { learnCode, resolveScannedCode } from './scan';

/**
 * Tarama kapısı (Modül 23) — zincirin ÜÇ halkası ve öğrenen eşlemenin iki kuralı.
 *
 * Zincir tek kapıda (`findByCode`: barkod → sku → tedarikçi kodu) ve bu test onu UÇTAN sınıyor:
 * halkalardan biri sessizce düşerse (ör. SKU araması atlanırsa) aynı kod iki ekranda iki farklı
 * cevap verirdi. `variant_barcode` satırları AYRICA silinmez: varyant FK'sı cascade — purge ürünü
 * götürünce kodlar birlikte gider (`cleanup.ts` kuralı: elle silme yok).
 */
const db = serviceDb();
const stamp = Date.now();

let categoryId: string;
let productId: string;
/** SKU'lu varyant — zincirin ikinci halkasının hedefi. */
let variantId: string;
/** SKU'suz ikinci varyant — koli kodu ve `already_bound` senaryoları. */
let otherVariantId: string;
let supplierId: string;

beforeAll(async () => {
  const category = await new CategoryService(db).create({ name: { tr: `Tarama ${stamp}` } });
  const { product, variants } = await new ProductService(db).create({
    name: { tr: `Barkodlu Baklava ${stamp}` },
    categoryId: category.id,
    variants: [{ label: { tr: '500 g' }, sku: `SKU-${stamp}` }, { label: { tr: '1 kg' } }],
  });
  categoryId = category.id;
  productId = product.id;
  variantId = variants[0]!.id;
  otherVariantId = variants[1]!.id;

  supplierId = (await new SupplierService(db).insert({ name: `Tarama tedarikçisi ${stamp}` })).id;
  await new SupplierProductService(db).insert({ supplierId, variantId, supplierCode: `TED-${stamp}` });
});

afterAll(async () => {
  await purgeTestData(db, { productIds: [productId], categoryIds: [categoryId], supplierIds: [supplierId] });
});

describe('tarama zinciri (findByCode)', () => {
  it('tanınmayan kod `unknown` döner — hata değil, öğrenme daveti', async () => {
    expect(await resolveScannedCode(db, { code: `YOK-${stamp}` })).toEqual({ status: 'unknown' });
  });

  it('öğrenilen kod ikinci gelişte tanınır — kaynak `barcode`, ekran dili dolu', async () => {
    const learned = await learnCode(db, { code: `869${stamp}`, variantId });
    expect(learned.status).toBe('ok');

    const resolved = await resolveScannedCode(db, { code: `869${stamp}` });
    expect(resolved).toMatchObject({
      status: 'found',
      variantId,
      source: 'barcode',
      kind: 'unit',
      qtyPerCode: 1,
      variantLabel: '500 g',
    });
  });

  it('koli kodu çarpanını KENDİSİ taşır (karar §1.2)', async () => {
    await learnCode(db, { code: `1869${stamp}`, variantId: otherVariantId, kind: 'case', qtyPerCode: 12 });

    const resolved = await resolveScannedCode(db, { code: `1869${stamp}` });
    expect(resolved).toMatchObject({ status: 'found', variantId: otherVariantId, kind: 'case', qtyPerCode: 12 });
  });

  it('bağlı kod İKİNCİ varyanta öğretilemez — `already_bound` kime bağlı olduğunu söyler', async () => {
    const outcome = await learnCode(db, { code: `869${stamp}`, variantId: otherVariantId });
    expect(outcome).toMatchObject({ status: 'already_bound', variantId, variantLabel: '500 g' });
  });

  it('barkod yoksa SKU bulur — kaynak `sku`, çarpan daima 1', async () => {
    const resolved = await resolveScannedCode(db, { code: `SKU-${stamp}` });
    expect(resolved).toMatchObject({ status: 'found', variantId, source: 'sku', qtyPerCode: 1 });
  });

  it('son halka tedarikçi kodu — kaynak `supplier_code`, çarpan 1 (pack_qty OKUNMAZ)', async () => {
    const resolved = await resolveScannedCode(db, { code: `TED-${stamp}` });
    expect(resolved).toMatchObject({ status: 'found', variantId, source: 'supplier_code', qtyPerCode: 1 });
  });
});
