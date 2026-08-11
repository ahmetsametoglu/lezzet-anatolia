import { OrderService, PointsBalanceService, PointsEntryService, SettingsService, UserProfileService } from '@lezzet/database';
import { POINTS_SETTING_KEYS, canEarnPoints, feedbackPointsReason, type EarnablePointsReason } from '@lezzet/domain-core';
import { logger } from '@lezzet/observability';
import type { KeysetCursor, PointsBalance, PointsEntry, ProductFeedback } from '@lezzet/types';
import type { SupabaseClient } from '@supabase/supabase-js';

/*
  PUAN YAZIM ÇEKİRDEĞİ — web `lib/feedback/points.ts`in geri bildirim akışının ihtiyaç duyduğu
  DİLİMİ, paket hâli (terfi; kopya değil). Ölçüt karşılandı: davet akışını artık İKİ yüzey çağırıyor
  (web davet sayfası + mobil vFb ekranı) ve puan etkisi akışın parçası. Web dosyası kendi yüzeyinde
  KÖPRÜ olarak duruyor; benimsemesi web şeridinin işi (profile.ts terfisinin aynı sözleşmesi).

  SİPARİŞ + GETİREN ÖDÜLÜ 21.21'de bu sözün gereğiyle taşındı: ikinci yüzey doğdu. Mobil arka uç
  siparişi `placeOrder` üstünden açıyor ve durum geçişinin `rewardDelivered` portunu dolduracak bir
  uygulamaya ihtiyacı var; web köprüsü onu `apps/web/lib/feedback/points.ts`ten veriyordu ve
  `apps/mobile-api` o dosyayı import EDEMEZ. Yeni bağımlılık gerekmedi — `awardPoints` zaten burada.

  BİLEREK TERFİ ETMEYENLER: kupon çevrimi (`redeemPoints`), elle düzeltme, ziyaret ödülü ve puan
  geçmişi okumaları. Bugün tek yüzeyleri var (web hesap sayfası · operasyon · backend işleri);
  ikinci yüzeyleri doğduğu gün AYNI yoldan buraya taşınırlar — erken taşımak, köprü/paket ikiliğini
  çağıransız kapılar için de açmak olurdu.

  **Puan verme SESSİZ başarısız olur ve bu bilinçlidir** (DOMAIN §14): müşteri yorumunu yazdı,
  beğenisini verdi; tavana takıldıysa ya da B2B olduğu için kazanamıyorsa asıl işlem yine de
  tamamlanmalı. Ödül aksiyonu teşvik eder, ona şart koşmaz.
*/

/**
 * Aksiyon başına VARSAYILAN puanlar — ayar satırı hiç yazılmamışken geçerli sayılar.
 *
 * Tek yerde durur, çünkü web'de iki yerde duruyordu (davet açılışı `getNumber(…, 5)` + ayar
 * okuması) ve iki literal bir gün ayrışırdı: ekran müşteriye sistemin vermeyeceği bir sayı
 * söylerdi (hesap kartındaki 300/500 eşik ayrışmasının aynısı — 29.07 denetimi).
 */
const POINTS_DEFAULTS: Record<EarnablePointsReason, number> = {
  review: 20,
  feedback_purchase: 5,
  feedback_candidate: 2,
  order: 10,
  referral: 50,
  visit: 10,
};

/**
 * Akışı tamamlamanın kazandıracağı puan — davetin karşılama SÖZÜ ve tamamlama YAZIMI aynı kaynağı
 * okusun diye tek kapı. Anahtar motorda (`POINTS_SETTING_KEYS`), varsayılan yukarıdaki tabloda.
 */
export function feedbackCompletionPoints(db: SupabaseClient): Promise<number> {
  return new SettingsService(db).getNumber(POINTS_SETTING_KEYS.feedback_purchase, POINTS_DEFAULTS.feedback_purchase);
}

/** Puan ayarları tek turda — her aksiyonda ayar başına ayrı sorgu atmamak için. */
async function pointsSettings(db: SupabaseClient): Promise<{ values: Record<string, number>; dailyCap: number }> {
  const settings = new SettingsService(db);
  const [review, purchase, candidate, order, referral, visit, dailyCap] = await Promise.all([
    settings.getNumber(POINTS_SETTING_KEYS.review, POINTS_DEFAULTS.review),
    settings.getNumber(POINTS_SETTING_KEYS.feedback_purchase, POINTS_DEFAULTS.feedback_purchase),
    settings.getNumber(POINTS_SETTING_KEYS.feedback_candidate, POINTS_DEFAULTS.feedback_candidate),
    settings.getNumber(POINTS_SETTING_KEYS.order, POINTS_DEFAULTS.order),
    settings.getNumber(POINTS_SETTING_KEYS.referral, POINTS_DEFAULTS.referral),
    settings.getNumber(POINTS_SETTING_KEYS.visit, POINTS_DEFAULTS.visit),
    settings.getNumber('points_daily_cap', 100),
  ]);
  return {
    values: { review, feedback_purchase: purchase, feedback_candidate: candidate, order, referral, visit },
    dailyCap,
  };
}

/**
 * Bir aksiyona puan yazar — **kazanamıyorsa sessizce geçer** (`null` döner).
 *
 * Aynı kaynaktan ikinci kez puan verilmez: defterdeki tekillik `(müşteri, sebep, kaynak)`
 * üzerinde ve veritabanı seviyesinde. Buradaki kontrol bir NEZAKET — asıl güvence indekste,
 * çünkü ikinci bir yazma yolu açıldığı gün buradaki kontrol atlanabilir.
 */
export async function awardPoints(
  db: SupabaseClient,
  input: {
    customerId: string;
    reason: EarnablePointsReason;
    /**
     * Kaynak satır. Kaynaksız sebeplerde verilmez (`SOURCELESS_POINTS_REASONS`) — `ref_id`ye
     * sentetik bir uuid yazmak, o kolonun sözleşmesini okuyan herkesi yanıltırdı.
     */
    refId?: string;
  },
): Promise<PointsEntry | null> {
  const entries = new PointsEntryService(db);

  // Tekillik iki AYRI indekste: kaynaklı sebepte "bu satırdan zaten verildi mi"
  // (`points_entry_source_key`), kaynaksızda "bugün zaten verildi mi" (`points_entry_visit_day`).
  const zatenVar = input.refId
    ? await entries.hasEntryFor(input.customerId, input.reason, input.refId)
    : await entries.hasEntryOnBusinessDay(input.customerId, input.reason);
  if (zatenVar) return null;

  const [profile, settings] = await Promise.all([new UserProfileService(db).getById(input.customerId), pointsSettings(db)]);
  if (!profile) return null;

  const check = canEarnPoints({
    customerType: profile.type,
    actionPoints: settings.values[input.reason] ?? 0,
    earnedToday: await entries.earnedToday(input.customerId),
    dailyCap: settings.dailyCap,
  });
  // B2B, tavan ya da değersiz aksiyon — hiçbiri asıl işlemi durdurmaz.
  if (!check.allowed) return null;

  try {
    return await entries.insert({ customerId: input.customerId, points: check.points, reason: input.reason, refId: input.refId });
  } catch (error) {
    // **Yarışta da sessiz.** Yukarıdaki kontrol ile bu yazım arasında kilit yok: "Gönder"e iki kez
    // basılırsa biri yazar, öteki tekillik ihlaliyle (`23505`) düşer. Bu istisna yukarı çıksaydı
    // yorum KAYDEDİLMİŞKEN ekrana hata giderdi — dosyanın baştaki sözünün tam tersi.
    if ((error as { code?: string })?.code === '23505') return null;
    throw error;
  }
}

/**
 * Geri bildirim kaydına puan yazar — sebebi **içerikten** çözerek (metin varsa yorum puanı).
 *
 * Kimliksiz kayıt (ziyaretçi kaydırması) puan doğurmaz: ödülün sahibi yok.
 */
export function awardFeedbackPoints(db: SupabaseClient, feedback: ProductFeedback): Promise<PointsEntry | null> {
  if (!feedback.customerId) return Promise.resolve(null);
  const reason = feedbackPointsReason({
    context: feedback.context,
    hasText: (feedback.comment?.trim().length ?? 0) > 0,
  });
  return awardPoints(db, { customerId: feedback.customerId, reason, refId: feedback.id });
}

/**
 * **Getiren müşteriye puan** (17.7). Yeni müşteri `referredBy` doluysa getirene bir kez yazılır.
 *
 * `refId` YENİ müşterinin kimliğidir, getirenin değil: tekillik "aynı kişiyi iki kez getiremezsin"
 * demeli. Getirenin kimliğini kaynak yapsaydık, ikinci bir davet hiç puan doğurmazdı.
 */
export async function awardReferralPoints(db: SupabaseClient, newCustomerId: string): Promise<PointsEntry | null> {
  const profile = await new UserProfileService(db).getById(newCustomerId);
  if (!profile?.referredBy) return null;
  return awardPoints(db, { customerId: profile.referredBy, reason: 'referral', refId: newCustomerId });
}

/**
 * **Kapanan siparişin İKİ ödülü** — sipariş puanı (17.4) + getiren puanı (17.7).
 *
 * Tek kapı, çünkü tetikleri aynı: sipariş müşterinin eline geçtiği an. Ayrı ayrı çağrılsalardı üç
 * yazma yolunun (teslimat · genel geçiş · kapıda satış) her birinde ikisini de hatırlamak
 * gerekirdi ve biri mutlaka bir yerde unutulurdu.
 *
 * **Sipariş VERİLİNCE değil, eline GEÇİNCE:** iptal edilen ya da hiç ödenmeyen bir sipariş de puan
 * öderdi. `delivered` ve `completed` aynı gerçeğin iki yüzü (kapıda satış doğrudan `completed`'a
 * gider); hangisi önce gelirse o yazar, ikincisi `points_entry`in `(customer_id, reason, ref_id)`
 * kısmi unique indeksinde sessizce düşer. Bu yüzden çağıran "acaba yazıldı mı" diye sormaz.
 *
 * **Getiren ödülü KAYITTA değil BURADA** ve bu bilinçli: kayıt anında ödemek, sahte kayıtla puan
 * basmaya kapı açardı. Getiren, getirdiği kişi gerçekten müşteri olunca kazanır. "İlk sipariş"
 * kontrolü koda yazılmıyor — defterin tekillik indeksi ikinci siparişte yazımı zaten düşürür.
 *
 * **Hiçbiri asıl işlemi durdurmaz** (DOMAIN §14): ödül yazılamazsa sipariş yine kapanmıştır.
 *
 * **Bilinen sınır (yazılı olsun):** yeni bir "sipariş kapandı" yolu açılırsa buradan çağırmayı
 * unutmak sessiz bir ödül kaybıdır — hata vermez, yalnız müşteri puanını almaz.
 */
export async function rewardCompletedOrder(db: SupabaseClient, orderId: string): Promise<void> {
  const order = await new OrderService(db).getById(orderId);
  if (!order) return;
  await Promise.all([
    awardPoints(db, { customerId: order.customerId, reason: 'order', refId: orderId }),
    awardReferralPoints(db, order.customerId),
  ]);
}

/**
 * Defter sayfası boyu ve kaçak tavanı — `sumInvitePoints`in tek ayarı.
 *
 * 100 seçildi çünkü aranan pencere DAR: davetin doğduğu andan bugüne kadarki hareketler. Gerçek
 * hayatta bu 3–5 satır (oy · yorum · prim); günlük ziyaret puanı biriktiren bir müşteride bile 90
 * günlük token ömrü boyunca yüzü zor bulur — yani tek tur genellikle yeter.
 *
 * Sayfa tavanı bir KAÇAK FRENİDİR, beklenen bir yol değil: imleç bir gün `null`a dönmezse döngü
 * sonsuza gitmesin diye var. Tetiklenirse sessiz kalmaz (`logger.warn`).
 */
const INVITE_LEDGER_PAGE = 100;
const INVITE_LEDGER_MAX_PAGES = 20;

/**
 * **Bir davete yazılmış TOPLAM puan** — defterden OKUNUR, hesaplanmaz (MB-17).
 *
 * Neden okumak zorunda: turun üç kaydı üç AYRI istekte doğuyor (oy · yorum · tamamlama primi) ve
 * yazım uçları puanı geri söylemiyor. Toplamı "kart sayısı × ayar" diye kurmak motoru taklit etmek
 * olurdu — günlük tavana takılan, B2B olduğu için hiç yazılmayan ya da tekillikte düşen kayıt o
 * çarpımda görünmez. Defter tek gerçektir.
 *
 * **Kimlik `refId`dir:** tamamlama primi davetin kendisine (`request.id`), kart puanları o davetin
 * `product_feedback` satırlarına yazılır. Sebep kolonuna bakılmaz — aynı satır hem `feedback_purchase`
 * hem `review` doğurabiliyor (tekillik `(müşteri, sebep, kaynak)` üçlüsünde), ikisi de bu turundur.
 *
 * **`since` bir DOĞRULUK süzgecidir, hız numarası değil:** yazım kapısı var olan bir geri bildirim
 * satırını günceller ve `feedback_request_id`sini YENİ davete çevirir (`write.ts` künyesi). O satır
 * için ÖNCEKİ davette yazılmış puan bu turun kazancı değildir; davetin doğum anından eskisi sayılmaz.
 * Defter yeniden eskiye sıralı olduğu için aynı süzgeç okumayı da kendiliğinden bitirir.
 *
 * **Servis ham sorgu yazmaz** (STACK §6): defterin genel sayfalı okuması kullanılıyor. `PointsEntry`
 * servisine `refId` KÜMESİYLE süzen bir okuma eklenseydi bu döngü tek sorguya inerdi; o kapı bugün
 * yok ve `packages/database` bu değişikliğin yazı alanı dışında (terfi ihtiyacı olarak bildirildi).
 * Pencere dar olduğu için ölçülebilir bir bedeli de yok — okuma davetin doğumunda duruyor.
 */
export async function sumInvitePoints(
  db: SupabaseClient,
  input: { customerId: string; refIds: readonly string[]; since: string },
): Promise<number> {
  const wanted = new Set(input.refIds);
  if (wanted.size === 0) return 0;

  const entries = new PointsEntryService(db);
  const sinceMs = Date.parse(input.since);
  let cursor: KeysetCursor | undefined;
  let total = 0;

  for (let page = 0; page < INVITE_LEDGER_MAX_PAGES; page += 1) {
    const { rows, nextCursor } = await entries.listByCustomer(input.customerId, cursor, INVITE_LEDGER_PAGE);
    for (const row of rows) {
      // Sıralama yeniden eskiye: davetten eski İLK satıra varıldıysa sonrası da eskidir.
      if (Date.parse(row.createdAt) < sinceMs) return total;
      if (row.refId !== null && wanted.has(row.refId)) total += row.points;
    }
    if (!nextCursor) return total;
    cursor = nextCursor;
  }

  // Buraya düşmek bir arıza belirtisidir (imleç bitmiyor ya da defter beklenmedik büyüklükte):
  // dönen sayı EKSİK olabilir, o yüzden gürültü bırakılır. Kimlik yazılır, içerik yazılmaz.
  logger.warn(
    { customerId: input.customerId, pages: INVITE_LEDGER_MAX_PAGES, pageSize: INVITE_LEDGER_PAGE },
    'feedback: davet puan toplamı sayfa tavanında kesildi — toplam eksik olabilir',
  );
  return total;
}

/** Müşterinin bakiyesi; hiç hareketi yoksa sıfır (null dolaştırılmaz). */
export async function getPointsBalance(db: SupabaseClient, customerId: string): Promise<PointsBalance> {
  const row = await new PointsBalanceService(db).getByCustomer(customerId);
  return row ?? { customerId, balance: 0, earned: 0, spent: 0, redemptionCount: 0, lastActivityAt: new Date(0).toISOString() };
}
