'use server';

import { hasLocale } from 'next-intl';
import type { PreferredLanguage } from '@lezzet/types';
import { currentCustomerId } from '@/lib/guard';
import { getErrorMessage, type ActionResult } from '@/lib/error';
import { submitReview } from '@/lib/feedback/product-feedback';
import { routing } from '@/i18n/routing';

/**
 * Ürün sayfasının server action'ları (17.1 müşteri yüzü).
 *
 * **Kimlik oturumdan çözülür, istemciden alınmaz** — "kim yazdı" sorusunun cevabı tarayıcıdan
 * gelemez. Satın alma şartını da bu action DEĞİL, kapının kendisi denetler (`submitReview`
 * siparişleri okur); buradaki iş yalnız oturumu çözüp kapıya vermek.
 *
 * **Dil yorumun kendi alanıdır** ve o anki arayüz dilinden gelir: yorumlar çevrilmiyor (17.1
 * kararı), bu yüzden hangi dilde yazıldığı kayda geçmeli — yoksa Fransızca bir yorum Türkçe
 * sayfada çevrilmiş sanılırdı.
 */
export async function submitReviewAction(input: {
  locale: string;
  productId: string;
  rating: number | null;
  comment: string;
}): Promise<ActionResult<{ status: 'saved' }>> {
  try {
    if (!hasLocale(routing.locales, input.locale)) throw new Error('Geçersiz dil');
    const customerId = await currentCustomerId();
    if (!customerId) throw new Error('Oturum gerekli');

    const result = await submitReview({
      customerId,
      productId: input.productId,
      language: input.locale as PreferredLanguage,
      rating: input.rating,
      comment: input.comment,
    });
    // Kapının reddi bir HATA değil bir CEVAPTIR; sebebi ekranın sözlüğüne çevrilir.
    if (!result.ok) return { data: null, error: result.reason };
    return { data: { status: 'saved' }, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}
