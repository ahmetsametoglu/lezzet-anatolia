import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getProductDetail } from './product';
import { VISITOR } from './pricing-viewer';

/*
  Ürün okuması yeri ve görüşü beklemeden başlar. Sıra geri gelirse (önce yer, sonra ürün) ya da ürün bulunamazken yer hatası
  sahipsiz kalırsa bu testler kırmızıya döner.
*/

/** Ürün sözü dışarıdan verildiği için hiçbir okuma yapılmaz. */
const NO_DB = {} as SupabaseClient;

describe('ürün detayı yer ve görüşü beklemeden ürüne bakar', () => {
  it('ürün bulunamazsa hiç çözülmeyen yer ve görüş beklenmez', async () => {
    const never = new Promise<never>(() => undefined);
    const detail = getProductDetail(NO_DB, { locale: 'fr', slug: 'yok', place: never, viewer: never, product: Promise.resolve(null) });
    await expect(detail).resolves.toBeNull();
  });

  it('ürün bulunamazken yer hatası sahipsiz kalmaz', async () => {
    const failed = Promise.reject(new Error('yer okunamadı'));
    const detail = getProductDetail(NO_DB, { locale: 'fr', slug: 'yok', place: failed, viewer: VISITOR, product: Promise.resolve(null) });
    await expect(detail).resolves.toBeNull();
  });
});
