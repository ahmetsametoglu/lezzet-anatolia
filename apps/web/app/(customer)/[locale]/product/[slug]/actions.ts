'use server';

import { hasLocale } from 'next-intl';
import { KeysetCursorSchema } from '@lezzet/types';
import type { KeysetCursor, PreferredLanguage } from '@lezzet/types';
import { currentCustomerId } from '@/lib/guard';
import { CustomerError, customerErrorKey, type CustomerResult } from '@/lib/customer-error';
// `PublishedReview` bir GÖRÜNÜM modeli, domain tipi değil (yazarın adı çözülmüş, metni okuyucunun
// diline çevrilmiş hâli) — o yüzden `@lezzet/types`'ta değil kapının yanında yaşıyor.
import { listProductReviews, submitReview, type PublishedReview } from '@/lib/feedback/product-feedback';
import { routing } from '@/i18n/routing';
import { REVIEW_PANEL_PAGE_SIZE } from './product-types';

/**
 * Ürün sayfasının server action'ları (17.1 müşteri yüzü).
 *
 * **Kimlik oturumdan çözülür, istemciden alınmaz** — "kim yazdı" sorusunun cevabı tarayıcıdan
 * gelemez. Satın alma şartını da bu action DEĞİL, kapının kendisi denetler (`submitReview`
 * siparişleri okur); buradaki iş yalnız oturumu çözüp kapıya vermek.
 *
 * **Dil artık BURADAN yazılmıyor** (20.2 düzeltmesi). Eskiden arayüz dili yorumun dili sayılıyordu;
 * o bir kanıt değil tahmindi ve tam da bu işin sebebinde yanılıyordu — Fransızca sayfada Boşnakça
 * yazan müşterinin yorumu "Fransızca" diye damgalanır, bir daha hiç çevrilmezdi. Dili artık metne
 * BAKAN taraf yazıyor (çeviri işi).
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
 * **Yorum panelinin sonraki sayfası** (08.11 · `design/BACKLOG §1`) — "Daha fazla yükle".
 *
 * Panel sayfayı terk etmiyor (tasarımın kuralı: web modal · mobil tam ekran), yani liste büyürken
 * sunucudan yalnız SATIRLAR gelmeli — sayfanın yeniden çizilmesi paneli kapatır ve müşteri
 * okuduğu yeri kaybederdi.
 *
 * **İmleç istemciden gelir ve bu güvenli:** keyset imleci bir konum işaretidir, yetki taşımaz —
 * kurcalayan müşteri yalnız listenin başka bir yerine düşer. Şema `KeysetCursorSchema` ile
 * doğrulanıyor (katalogun `loadMore`'uyla aynı desen): biçimsiz imleç sorguya hiç girmez.
 *
 * **Yıldız süzgeci SUNUCUDA** (04.08, arka uç kapıyı açtı): istemcide süzmek sayfalamayı bozardı —
 * sayfa başına değişken sayıda satır düşer ve "daha fazla" bir noktadan sonra boş sayfa getirir
 * (katalogun `onlyShippable` çipiyle aynı gerekçe). Aralık olarak geçiyor çünkü tasarımın "3★ ve
 * altı" çipi tek değerle karşılanamaz.
 */
export async function loadMoreReviewsAction(input: {
  locale: string;
  productId: string;
  /** İlk açılışta VERİLMEZ — panel kendi ilk sayfasını da bu kapıdan çeker. */
  cursor?: unknown;
  /** Yıldız aralığı; verilmezse tümü. `{min:5,max:5}` = 5★, `{max:3}` = 3★ ve altı. */
  rating?: { min?: number; max?: number };
}): Promise<CustomerResult<{ reviews: PublishedReview[]; nextCursor: KeysetCursor | null }>> {
  try {
    if (!hasLocale(routing.locales, input.locale)) throw new Error('Geçersiz dil');
    // İmleç YOKSA ilk sayfa; VARSA doğrulanır. `undefined`'ı "biçimsiz" saymak, panelin ilk
    // açılışını hata dalına düşürürdü.
    let cursor: KeysetCursor | undefined;
    if (input.cursor !== undefined && input.cursor !== null) {
      const parsed = KeysetCursorSchema.safeParse(input.cursor);
      if (!parsed.success) throw new CustomerError('unexpected');
      cursor = parsed.data;
    }

    // Aralık İSTEMCİDEN geliyor ama serbest değil: çipler sabit bir kümeden seçiyor ve buradaki
    // kırpma onu veriye de dayatıyor — 1-5 dışına çıkan bir değer sorguya hiç girmez.
    const rating = input.rating
      ? { ...(input.rating.min !== undefined ? { min: clampStar(input.rating.min) } : {}), ...(input.rating.max !== undefined ? { max: clampStar(input.rating.max) } : {}) }
      : undefined;
    const page = await listProductReviews(input.productId, input.locale as PreferredLanguage, cursor, REVIEW_PANEL_PAGE_SIZE, rating);
    return { data: { reviews: page.rows, nextCursor: page.nextCursor }, errorKey: null };
  } catch (err) {
    return { data: null, errorKey: customerErrorKey(err) };
  }
}

/** Yıldız 1-5 aralığına kırpılır; dışarıdan gelen sayı sorgunun sınırını belirlemez. */
function clampStar(value: number): number {
  return Math.min(5, Math.max(1, Math.round(value)));
}

/**
 * Motorun ret sebebi → ekranın anahtarı. Tanımadığımız sebep `unexpected`e düşer: motora yeni bir
 * ret eklendiğinde ekran iç sözcüğü göstermek yerine jenerik cümleyi kurar.
 */
function reviewErrorKey(reason: string): string {
  const map: Record<string, string> = { empty_review: 'review_empty', not_purchased: 'purchase_required' };
  return map[reason] ?? 'unexpected';
}
