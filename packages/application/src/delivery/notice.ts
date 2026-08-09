import { DeliveryZoneService, ZoneNoticeService, type Db } from '@lezzet/database';
import type { PostalCodeResolution } from '@lezzet/domain-core';
import { isValidPostalCode, normalizePostalCode } from '@lezzet/helper';
import { logger } from '@lezzet/observability';
import type { Country, PreferredLanguage } from '@lezzet/types';
import { resolvePlaceForPostalCode } from './place';
import { placesForPostalCode } from './places';

/**
 * "BURAYA DA GELİN" KAYDI — bölge dışı müşterinin talebi, **taşımasız kapı** (21.20).
 *
 * Kaynağı `apps/web/lib/delivery/notice-actions.ts` → `recordZoneNoticeAction`tı; web köprü olarak
 * duruyor, benimsemesi web şeridinin takvimi. Terfi gerekçesi 02-mimari §3.1: mobil onboarding'in
 * bölge dışı ekranı AYNI kaydı bırakıyor ve kuralı ikinci kez yazmak, iki yüzeyin aynı talebi
 * farklı biçimde kaydetmesi demekti (biri ülkeyi, öteki yer adını unuturdu).
 *
 * ── SÖZ DEĞİL, KAYIT ─────────────────────────────────────────────────────────
 * `ok` "haber göndereceğiz" demek DEĞİL (`0023_notices.sql` künyesi): bölge genişletme kararı
 * verilmemiş, tetikleyici yazılmamıştır. Ekran "not aldık" der.
 *
 * ── YÜZEYE ÖZGÜ OLAN DIŞARIDA KALDI ─────────────────────────────────────────
 * Web'in çerezten okuduğu yer cevabı (`readPlaceAnswer`) ve oturumdan çözdüğü kimlik
 * (`currentCustomerId`) burada PARAMETREDİR; mobil uç aynı ikiliyi cihazın gövdesinden ve
 * Bearer'dan çözer. Kapı ne çerez bilir ne Bearer — paketin ortak deseni (`cart/read.ts`).
 */

/**
 * E-posta biçim kontrolü — **kaba ve bilinçli** (web eyleminin birebir kuralı): adresin gerçekten
 * çalıştığını ancak göndererek anlarız; buradaki amaç yazım hatasını değil boş/anlamsız girdiyi
 * elemek. Kural burada yaşıyor çünkü depoda paylaşılan bir e-posta doğrulayıcısı YOK (arandı) —
 * ikinci bir çağıran çıktığında `@lezzet/helper`'a terfi adayıdır (rapora yazıldı).
 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface ZoneNoticeInput {
  /** Ham kod; normalize kapıda yapılır (`normalizePostalCode`) — çağıranın hatırlamasına bırakılmaz. */
  postalCode: string;
  /** Yerin öteki yarısı. 610 kod iki ülkeye birden çözülüyor; ülkesiz kayıt yanlış kişiye haber demek. */
  country: Country;
  /**
   * İletişim adresi. Girişli müşteride ÇAĞIRAN sunucuda çözer (profil satırı), misafirde formdan
   * gelir. `null` = misafir adres vermedi → `email_required`; kapı bunu bir hata değil, sorulacak
   * bir soru olarak döner.
   */
  email: string | null;
  /** Girişli müşteride `user_profiles.id`, misafirde `null`. İstemcinin iddiasından ASLA. */
  customerId: string | null;
  /** Kaydın bırakıldığı yüzeyin dili; `null` = bilinmiyor (varsayılan UYDURULMAZ — şema künyesi). */
  locale: PreferredLanguage | null;
  /** Kaydın geldiği ekran (`web` · `app-onboarding` · `app-catalog`) — denetim izi, karar girdisi değil. */
  source: string;
  /**
   * **ANONİM SAYAÇ BU ÇAĞRIDA ARTIRILSIN MI** (`record_postal_code_demand`).
   *
   * Alan ZORUNLU ve varsayılansız: iki kayıt tek niyetten doğuyor (`0023_notices.sql`), ikisini iki
   * ayrı çağırana bırakmak birinin unutulması demekti — bu yüzden sayaç kapının İÇİNDE. Ama
   * "her zaman artır" da yanlış olurdu, çünkü iki yüzey sayacı FARKLI anda çağırıyor (ölçüldü):
   *   · **web** `apps/web/lib/delivery/actions.ts:128` — yer ÇÖZÜLÜRKEN sayıyor (`finishResolved`).
   *     Kayıt anında bir daha sayarsa aynı ziyaretçi tek niyet için iki kez sayılır ve operasyonun
   *     "en çok sorulan kod" listesi bugünkünden farklı okunur. Web köprüsü bu yüzden `false` geçer.
   *   · **mobil** `/places/by-postal-code` sayaca HİÇ dokunmuyor (`apps/mobile-api/.../places.ts`),
   *     yani bu uç mobilin TEK sayım noktasıdır → `true`.
   *
   * Bayrağın 19.7'de reddedilen bayraktan farkı yönüdür: orada bayrağı unutan çağrı sayacı
   * KİRLETİYORDU (öneri kutusundaki her tuş), burada unutan çağrı yalnız saymaz. Ve unutulamaz:
   * alan opsiyonel değil, derleyici her çağırana soruyor.
   */
  countDemand: boolean;
}

/**
 * Kapının cevabı. İlk dördü sözleşmenin (`PlaceNoticeResultSchema`) hâlleri — müşteriye
 * ANLATILACAK cevaplar; son ikisi geçersiz İSTEK (taşıma katmanı 400'e çevirir, web `CustomerError`
 * anahtarına). Tek bir "hata" dizesine indirilselerdi ekran hangi cümleyi kuracağını bilemezdi.
 */
export type ZoneNoticeOutcome =
  | 'ok'
  | 'already'
  | 'place_unknown'
  | 'email_required'
  | 'postal_code_invalid'
  | 'email_invalid';

/**
 * Kaydı bırakır: **yer doğrulaması → yer adını dondurma → kuvvetli sinyal → anonim sayaç.**
 *
 * ── TEKİLLİK VERİTABANINDA ───────────────────────────────────────────────────
 * Aynı (ülke, kod, e-posta) üçlüsü ikinci kez gelirse yeni satır AÇILMAZ (`zone_notice_unique_idx`)
 * ve cevap `already` olur. "Önce sorgula, yoksa yaz" DEĞİL: iki eşzamanlı dokunuş aynı anda
 * sorgularsa ikisi de "yok" görür ve ikisi de yazardı — karar veritabanında kalır
 * (`ZoneNoticeService.record` künyesi).
 */
export async function recordZoneNotice(db: Db, input: ZoneNoticeInput): Promise<ZoneNoticeOutcome> {
  const postalCode = normalizePostalCode(input.postalCode);
  if (!isValidPostalCode(postalCode)) return 'postal_code_invalid';

  const email = (input.email ?? '').trim().toLowerCase();
  // Adressiz kayıt ALINMAZ ama bu bir giriş duvarı değil: hesap hâlâ zorunlu değil, yalnız
  // "nereye haber verelim" sorusu cevapsız kalamaz.
  if (email.length === 0) return 'email_required';
  if (!EMAIL_PATTERN.test(email)) return 'email_invalid';

  // ── YER GERÇEKTEN VAR MI ────────────────────────────────────────────────────
  // Soru `findPlaces` ile SORULAMAZ: onun boş dönüşü "yok" değil "bilinmiyor" demektir (servis
  // künyesi + CLAUDE §1) — kod referans tablosunda olmayıp kendi bölge tablomuzda olabilir (19.16a).
  // Bu yüzden aynı motora soruyoruz: yer çözümünün müşteriye verdiği cevap neyse kayıt da onu
  // temel alır. `unresolved` (kargo deposu yok) ve `shipping` PEKÂLÂ kayıt alınacak hâllerdir —
  // zaten "gelmiyoruz" denen müşteriyi kaydediyoruz. Reddedilen tek hâl kodun HİÇBİR yeri
  // işaret etmemesidir.
  const resolution = await resolvePlaceForPostalCode(db, postalCode);
  if (!resolvesToCountry(resolution, input.country)) return 'place_unknown';

  // Yer adı KAYIT ANINDA dondurulur: kod tablosu ileride değişse de operatör "69002" değil "Lyon"
  // okur. Çözülemezse `null` — uydurma yok (web eyleminin aynı hükmü). Çok yerleşimli kodda ilki
  // yeter: karar "burayı açalım mı"dır, adres değil.
  const placeName = (await placesForPostalCode(db, input.country, postalCode))[0] ?? null;

  const row = await new ZoneNoticeService(db).record({
    postalCode,
    country: input.country,
    placeName,
    source: input.source,
    email,
    customerId: input.customerId,
    locale: input.locale,
  });

  // Sayaç kuvvetli sinyalden SONRA ve `already` hâlinde de artar: tekrar sormak yeni bir bekleyiş
  // değil ama yeni bir ilgi işaretidir ve sayacın ölçtüğü şey tam olarak budur (ilgi yoğunluğu,
  // kişi sayısı değil — `postal_code_demand` künyesi).
  if (input.countDemand) await countPostalCodeDemand(db, postalCode);

  return row ? 'ok' : 'already';
}

/**
 * Çözüm bu ÜLKEYİ işaret ediyor mu. `ambiguous` hâlinde adaylardan biri yeterlidir: müşteri
 * belirsizliği kendi cevabıyla zaten çözmüş, biz de o cevabı doğruluyoruz.
 */
function resolvesToCountry(resolution: PostalCodeResolution, country: Country): boolean {
  if (resolution.kind === 'unknown') return false;
  if (resolution.kind === 'ambiguous') return resolution.candidates.some((candidate) => candidate.country === country);
  return resolution.country === country;
}

/**
 * Anonim sayaç — **kaydı düşürmez.** Sayamamak yüzünden müşterinin bıraktığı kaydı reddetmek,
 * yan ürünü asıl işin önüne koymak olurdu (web'in aynı kararı, `actions.ts` `recordDemand`).
 *
 * Yutulan hata SESSİZ DEĞİL: iz `logger.warn` ile kalır (CLAUDE §1). `captureError` seçilmedi
 * çünkü bu akışın kendi `SOURCES` künyesi yok ve var olan bir etiketi ödünç almak arızayı yanlış
 * kovaya yazardı (terfi ihtiyacı olarak raporlandı). Posta kodu kimliktir, içerik değil.
 */
async function countPostalCodeDemand(db: Db, postalCode: string): Promise<void> {
  try {
    await new DeliveryZoneService(db).recordDemand(postalCode);
  } catch (error) {
    logger.warn({ context: 'delivery/notice', postalCode, err: error }, 'posta kodu talep sayacı artırılamadı');
  }
}
