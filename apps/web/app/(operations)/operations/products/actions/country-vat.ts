'use server';

import { revalidatePath } from 'next/cache';
import { ProductVatRateService, serviceDb } from '@lezzet/database';
import { ProductVatRateSchema, type ProductVatRate } from '@lezzet/types';
import { requireStaff } from '@/lib/guard';
import { getErrorMessage, type ActionResult } from '@/lib/error';
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
    const svc = new ProductVatRateService(serviceDb());
    if (vatRate === null) await svc.remove(target.productId, target.country);
    else await svc.set({ ...target, vatRate });
    revalidatePath(PRODUCTS_PATH);
    revalidatePath(PRICES_PATH);
    return { data: null, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}
