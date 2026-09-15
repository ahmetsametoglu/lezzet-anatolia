'use server';

import { recordZoneNotice, type ZoneNoticeOutcome } from '@lezzet/application';
import { VariantStockNoticeService, serviceDb } from '@lezzet/database';
import type { PreferredLanguage } from '@lezzet/types';
import { currentCustomerId } from '@/lib/guard';
import { CustomerError, customerErrorKey, type CustomerResult } from '@/lib/customer-error';
import { isValidPostalCode, normalizePostalCode } from './place-types';
import { readPlaceAnswer } from './read-place';

/**
 * Kayıt bir söz değildir; ekran "not aldık" der. Ülke çerezdeki cevaptan okunur, parametre olarak alınmaz: kaydın hangi yere ait
 * olduğunu sistem zaten bilir.
 */
export async function recordZoneNoticeAction(
  rawPostalCode: string,
  rawEmail: string,
  /** Hesapsız kayıtta dili çözecek profil yoktur; verilmezse `null` yazılır, varsayılan uydurulmaz. */
  locale?: PreferredLanguage,
  /** Web dışı çağıran kendi etiketini geçer. */
  source = 'web',
): Promise<CustomerResult<true>> {
  try {
    const postalCode = normalizePostalCode(rawPostalCode);
    // Biçim denetimi çerez denetiminden önce, yoksa "670" yazan müşteri "kodu kontrol edin" yerine "yerinizi bilmiyoruz" okurdu.
    if (!isValidPostalCode(postalCode)) throw new CustomerError('postal_code_invalid');

    // Yer bilinmiyorsa kayıt alınmaz; çerez bir web kavramı olduğu için bu denetim kapıda değil burada.
    const answer = await readPlaceAnswer();
    if (!answer || answer.postalCode !== postalCode) throw new CustomerError('place_unknown');

    // `customer_id` profil kimliğine bağlı; auth kimliği yazılsaydı girişli müşterinin kaydı FK ihlaliyle düşerdi.
    const customerId = await currentCustomerId();

    const outcome = await recordZoneNotice(serviceDb(), {
      postalCode,
      country: answer.country,
      email: rawEmail,
      customerId,
      locale: locale ?? null,
      source,
      // Bu yüzeyde sayaç yer çözülürken zaten artıyor; burada artırmak aynı niyeti iki kez sayardı.
      countDemand: false,
    });
    if (outcome === 'ok' || outcome === 'already') return { data: true, errorKey: null };
    throw new CustomerError(errorKeyOf(outcome));
  } catch (err) {
    return { data: null, errorKey: customerErrorKey(err) };
  }
}

/** Form e-postayı zorunlu gönderdiği için boş adres de "adresi kontrol edin" cümlesine iner. */
function errorKeyOf(outcome: Exclude<ZoneNoticeOutcome, 'ok' | 'already'>): 'place_unknown' | 'postal_code_invalid' | 'email_invalid' {
  if (outcome === 'place_unknown') return 'place_unknown';
  if (outcome === 'postal_code_invalid') return 'postal_code_invalid';
  return 'email_invalid';
}

/**
 * Bölge kaydından ayrı: bu "bölgenize geliyoruz ama ürün burada şu an yok" hâlidir. Kayıt bir söz değildir ve yer çerezdeki
 * cevaptan okunur; yer bilinmiyorsa kayıt alınmaz.
 */
export async function recordVariantStockNoticeAction(variantId: string, rawEmail: string): Promise<CustomerResult<true>> {
  try {
    const email = rawEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new CustomerError('email_invalid');

    const answer = await readPlaceAnswer();
    if (!answer) throw new CustomerError('place_unknown');

    const customerId = await currentCustomerId();
    await new VariantStockNoticeService(serviceDb()).record({
      variantId,
      country: answer.country,
      postalCode: answer.postalCode,
      email,
      customerId,
    });

    return { data: true, errorKey: null };
  } catch (err) {
    return { data: null, errorKey: customerErrorKey(err) };
  }
}
