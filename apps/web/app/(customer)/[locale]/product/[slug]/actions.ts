'use server';

import { hasLocale } from 'next-intl';
import type { PreferredLanguage } from '@lezzet/types';
import { currentCustomerId } from '@/lib/guard';
import { CustomerError, customerErrorKey, type CustomerResult } from '@/lib/customer-error';
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
 *
 * **Hata kapısı müşteriye ait** (`customerErrorKey`, denetim H1/H2 · 03.08). Ret sebebi zaten
 * anahtar olarak dönüyordu ama funnel'ı ATLIYORDU: `error_log`'a hiç iz düşmüyor, buna karşılık
 * `catch` dalı iç mesajı ekrana geçiriyordu. Şimdi ikisi de aynı kapıdan geçiyor — iz her hâlde
 * düşer, müşteri yalnız bizim seçtiğimiz anahtarı görür.
 */
export async function submitReviewAction(input: {
  locale: string;
  productId: string;
  rating: number | null;
  comment: string;
}): Promise<CustomerResult<{ status: 'saved' }>> {
  try {
    if (!hasLocale(routing.locales, input.locale)) throw new Error('Geçersiz dil');
    const customerId = await currentCustomerId();
    if (!customerId) throw new CustomerError('session_expired');

    const result = await submitReview({
      customerId,
      productId: input.productId,
      language: input.locale as PreferredLanguage,
      rating: input.rating,
      comment: input.comment,
    });
    // Kapının reddi bir HATA değil bir CEVAPTIR; ama müşteriye giden yol tek olsun diye o da
    // buradan geçer. Sebep adları motorun iç sözcükleri — ekranın anahtarına çevrilir.
    if (!result.ok) throw new CustomerError(reviewErrorKey(result.reason));
    return { data: { status: 'saved' }, errorKey: null };
  } catch (err) {
    return { data: null, errorKey: customerErrorKey(err) };
  }
}

/**
 * Motorun ret sebebi → ekranın anahtarı. Tanımadığımız sebep `unexpected`e düşer: motora yeni bir
 * ret eklendiğinde ekran iç sözcüğü göstermek yerine jenerik cümleyi kurar.
 */
function reviewErrorKey(reason: string): string {
  const map: Record<string, string> = { empty_review: 'review_empty', not_purchased: 'purchase_required' };
  return map[reason] ?? 'unexpected';
}
