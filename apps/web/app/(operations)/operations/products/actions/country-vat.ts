'use server';

import { revalidatePath } from 'next/cache';
import { ProductVatRateService, serviceDb } from '@lezzet/database';
import { ProductVatRateSchema, type ProductVatRate } from '@lezzet/types';
import { requireStaff } from '@/lib/guard';
import { getErrorMessage, type ActionResult } from '@/lib/error';
import { repriceProduct } from '@/lib/pricing/auto-price';
import { PRICES_PATH } from '../../prices/prices-url';
import { PRODUCTS_PATH } from '../products-paths';

/**
 * Ürünün bir ülkedeki KDV oranını yazar; `null` oranı kaldırır ve ürün o ülkenin tüketicisine satılmaz olur (`sellableIn`). Ürün formunun
 * kapısı bu oranı taşımadığı için ayrı kapıdır; yetki ürün formununkiyle aynıdır, çünkü Fransız oranı da orada yazılır.
 */
export async function setProductCountryVatAction(
  productId: string,
  country: ProductVatRate['country'],
  vatRate: number | null,
): Promise<ActionResult> {
  try {
    await requireStaff();
    const target = ProductVatRateSchema.pick({ productId: true, country: true }).parse({ productId, country });
    const db = serviceDb();
    const svc = new ProductVatRateService(db);
    if (vatRate === null) await svc.remove(target.productId, target.country);
    else await svc.set({ ...target, vatRate });
    // Otomatik fiyatlı üründe o ülkenin tüketici fiyatı orandan türer; hizalama elle fiyatlı üründe bir şey yazmaz.
    await repriceProduct(db, target.productId);
    revalidatePath(PRODUCTS_PATH);
    revalidatePath(PRICES_PATH);
    return { data: null, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}
