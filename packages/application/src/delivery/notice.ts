import { DeliveryZoneService, VariantStockNoticeService, ZoneNoticeService, type Db } from '@lezzet/database';
import { notificationToken, type PostalCodeResolution } from '@lezzet/domain-core';
import { isValidPostalCode, normalizePostalCode } from '@lezzet/address';
import { logger } from '@lezzet/observability';
import type { Country, PreferredLanguage } from '@lezzet/types';
import { resolvePlaceForPostalCode } from './place';
import { placesForPostalCode } from './places';

/*
  Bölge dışı müşterinin "buraya da gelin" kaydı iki yüzeyin ortak kapısıdır; kimlik ve yer çağırandan parametre gelir. Kayıt bir
  söz değildir: bölge kararı verilmediği için ekran "not aldık" der, "haber vereceğiz" demez.
*/

/** Kaba ve bilinçli: adresin çalıştığı ancak gönderince anlaşılır, burada yalnız boş ya da anlamsız girdi elenir. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface ZoneNoticeInput {
  /** Ham kod; normalleştirme çağıranın hatırlamasına bırakılmaz, kapıda yapılır. */
  postalCode: string;
  /** Aynı kod iki ülkede geçerli olabilir; ülkesiz kayıt yanlış kişiye haber demek. */
  country: Country;
  /** Girişli müşteride çağıran profilden çözer, misafirde formdan gelir; `null` hata değil sorulacak bir sorudur. */
  email: string | null;
  /** Oturumdan çözülür, istemcinin iddiasından asla. */
  customerId: string | null;
  /** `null` bilinmiyor demektir; varsayılan uydurulmaz. */
  locale: PreferredLanguage | null;
  /** Denetim izi, karar girdisi değil. */
  source: string;
  /**
   * Web talebi yer çözülürken zaten sayıyor, mobilin tek sayım noktası ise bu kayıt. Alan varsayılansız ki her çağıran bunu
   * seçmek zorunda kalsın.
   */
  countDemand: boolean;
}

/** İlk dördü müşteriye anlatılacak cevaplar, son ikisi geçersiz istektir (taşıma katmanı 400'e çevirir). */
export type ZoneNoticeOutcome =
  | 'ok'
  | 'already'
  | 'place_unknown'
  | 'email_required'
  | 'postal_code_invalid'
  | 'email_invalid';

/** Tekillik veritabanında (`zone_notice_unique_idx`): önce sorgulayıp yazmak, eşzamanlı iki dokunuşta ikisini de yazdırırdı. */
export async function recordZoneNotice(db: Db, input: ZoneNoticeInput): Promise<ZoneNoticeOutcome> {
  const postalCode = normalizePostalCode(input.postalCode);
  if (!isValidPostalCode(postalCode)) return 'postal_code_invalid';

  const email = (input.email ?? '').trim().toLowerCase();
  // Adressiz kayıt alınmaz ama bu giriş duvarı değil: hesap zorunlu değil, yalnız haberin gideceği yer boş kalamaz.
  if (email.length === 0) return 'email_required';
  if (!EMAIL_PATTERN.test(email)) return 'email_invalid';

  // Yer motora sorulur, çünkü referansın boş cevabı "yok" değil "bilinmiyor" demektir. Kargo ve çözülemeyen hâller de kayıt alır;
  // yalnız hiçbir yeri işaret etmeyen kod reddedilir.
  const resolution = await resolvePlaceForPostalCode(db, postalCode);
  if (!resolvesToCountry(resolution, input.country)) return 'place_unknown';

  // Yer adı kayıt anında dondurulur ki operatör kod değil yer okusun; çok yerleşimli kodda ilki yeter, çünkü karar adres değil
  // bölge kararı.
  const placeName = (await placesForPostalCode(db, input.country, postalCode))[0] ?? null;

  const row = await new ZoneNoticeService(db).record({
    postalCode,
    country: input.country,
    placeName,
    source: input.source,
    email,
    customerId: input.customerId,
    locale: input.locale,
    /* Jeton burada üretilir, çünkü üreteç domain-core'da ve database onu bilmez. Çakışan kayıtta var olan satır ve jetonu
       korunur. */
    token: notificationToken(),
  });

  // `already` hâlinde de artar: sayaç kişiyi değil ilgi yoğunluğunu ölçer.
  if (input.countDemand) await countPostalCodeDemand(db, postalCode);

  return row ? 'ok' : 'already';
}

interface StockNoticeInput {
  variantId: string;
  /** Ham kod; kapıda normalleşir. */
  postalCode: string;
  country: Country;
  /** Çağıran profilden çözer; `null` hesapta adres yok demektir. */
  email: string | null;
  /** Misafirde `null`. */
  customerId: string | null;
}

/** Kayıt bir söz değildir; ekran "not aldık" der. Yer cihazdan geldiği için sunucu onu motora yeniden sorar. */
export async function recordStockNotice(db: Db, input: StockNoticeInput): Promise<ZoneNoticeOutcome> {
  const postalCode = normalizePostalCode(input.postalCode);
  if (!isValidPostalCode(postalCode)) return 'postal_code_invalid';

  const email = (input.email ?? '').trim().toLowerCase();
  if (email.length === 0) return 'email_required';
  if (!EMAIL_PATTERN.test(email)) return 'email_invalid';

  const resolution = await resolvePlaceForPostalCode(db, postalCode);
  if (!resolvesToCountry(resolution, input.country)) return 'place_unknown';

  const notices = new VariantStockNoticeService(db);
  // Servis bekleyen kaydı sessizce döndürdüğü için "zaten var" burada ayrılır; haber verilmiş eski kayıt bekleyiş sayılmaz.
  const pending = await notices.listPending(input.variantId, input.country, postalCode);
  if (pending.some((row) => row.email.toLowerCase() === email)) return 'already';

  await notices.record({ variantId: input.variantId, country: input.country, postalCode, email, customerId: input.customerId });
  return 'ok';
}

/** Belirsiz kodda adaylardan biri yeter: müşteri ülkeyi seçerek belirsizliği zaten çözmüş. */
function resolvesToCountry(resolution: PostalCodeResolution, country: Country): boolean {
  if (resolution.kind === 'unknown') return false;
  if (resolution.kind === 'ambiguous') return resolution.candidates.some((candidate) => candidate.country === country);
  return resolution.country === country;
}

/**
 * Sayamamak kaydı düşürmez; iz `logger.warn` ile kalır, çünkü bu akışın kendi `SOURCES` etiketi yok ve ödünç etiket arızayı
 * yanlış kovaya yazardı. Log'daki posta kodu kimliktir, içerik değil.
 */
async function countPostalCodeDemand(db: Db, postalCode: string): Promise<void> {
  try {
    await new DeliveryZoneService(db).recordDemand(postalCode);
  } catch (error) {
    logger.warn({ context: 'delivery/notice', postalCode, err: error }, 'posta kodu talep sayacı artırılamadı');
  }
}
