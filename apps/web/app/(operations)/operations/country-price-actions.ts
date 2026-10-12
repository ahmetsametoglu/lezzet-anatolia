'use server';

import { revalidatePath } from 'next/cache';
import { PriceService, serviceDb } from '@lezzet/database';
import { SELLER_COUNTRY, type Channel, type Country } from '@lezzet/types';
import { requireAdmin } from '@/lib/guard';
import { getErrorMessage, type ActionResult } from '@/lib/error';
import { PRICES_PATH } from './prices/prices-url';
import { PRODUCTS_PATH } from './products/products-paths';

// Ülke fiyatı genel fiyatın o ülkedeki yerine geçen satırdır; kaldırılınca o ülkede yeniden genel fiyat geçer. Eylemler Fiyatlar ile
// Ürünler'in ortak klasöründe, çünkü iki sayfa da yazar ve kardeş sayfadan eylem alınmaz.

/** Yeni satır yazar, eskisini değiştirmez: fiyat geçmişi korunur ve verilmiş siparişler etkilenmez; `validFrom` boşsa hemen geçerli. */
export async function setCountryPriceAction(
  variantId: string,
  channel: Channel,
  country: Country,
  amountCents: number,
  validFrom?: string | null,
): Promise<ActionResult> {
  try {
    await requireAdmin();
    if (country === SELLER_COUNTRY) throw new Error('Satıcının ülkesinde genel fiyat geçer.');
    if (!Number.isFinite(amountCents) || amountCents <= 0) throw new Error('Fiyat sıfırdan büyük olmalı.');
    await new PriceService(serviceDb()).setPrice({
      variantId,
      channel,
      amountCents: Math.round(amountCents),
      customerId: null,
      country,
      validFrom: validFrom ?? undefined,
    });
    revalidatePath(PRICES_PATH);
    revalidatePath(PRODUCTS_PATH);
    return { data: null, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

export async function removeCountryPriceAction(variantId: string, channel: Channel, country: Country): Promise<ActionResult> {
  try {
    await requireAdmin();
    await new PriceService(serviceDb()).removeCountryPrice(variantId, channel, country);
    revalidatePath(PRICES_PATH);
    revalidatePath(PRODUCTS_PATH);
    return { data: null, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}
