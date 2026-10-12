'use server';

import { revalidatePath } from 'next/cache';
import { PriceService, serviceDb } from '@lezzet/database';
import { SELLER_COUNTRY, type Channel, type Country } from '@lezzet/types';
import { requireAdmin } from '@/lib/guard';
import { getErrorMessage, type ActionResult } from '@/lib/error';
import { PRICES_PATH } from '../../prices/prices-url';

// Ülke fiyatı genel fiyatın o ülkedeki yerine geçen satırdır; kaldırılınca o ülkede yeniden genel fiyat geçer. Fiyatlar ekranı aynı
// satırları okuduğu için yazımdan sonra o sayfa da tazelenir.

/** Yeni satır yazar, eskisini değiştirmez: fiyat geçmişi korunur ve verilmiş siparişler etkilenmez. */
export async function setCountryPriceAction(
  variantId: string,
  channel: Channel,
  country: Country,
  amountCents: number,
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
    });
    revalidatePath(PRICES_PATH);
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
    return { data: null, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}
