import {
  FeedbackProgressService,
  FeedbackRequestService,
  OrderItemService,
  OrderService,
  ProductFeedbackService,
  ProductService,
  ProductVariantService,
  SettingsService,
  UserProfileService,
} from '@lezzet/database';
import { feedbackOutcomeOf, type FeedbackOutcome } from '@lezzet/domain-core';
import { resolveLocalizedText, type PreferredLanguage, type ProductFeedback } from '@lezzet/types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { imageOf } from '../catalog/map';
import type { StorefrontImage } from '../catalog/storefront-types';
import { awardPoints, feedbackCompletionPoints, getPointsBalance, sumInvitePoints } from './points';

/*
  ALIM-SONRASI DAVET AKIŞI (17.2 · 17.6) — web `lib/feedback/invite.ts`in paket hâli (terfi;
  kopya değil). Ölçüt karşılandı: daveti artık İKİ yüzey açıyor — web davet sayfası
  (`/feedback/[token]`) ve mobil vFb ekranı (token'lı derin bağlantı). Web dosyası köprü olarak
  duruyor; benimsemesi web şeridinin işi (profile.ts terfisinin aynı sözleşmesi).

  Web'den İKİ bilinçli şekil farkı (kural farkı DEĞİL):
  · Kart görseli `StorefrontImage` (`imageOf`) — çıplak URL değil. Katalog/vitrin kartlarının
    indirgemesiyle AYNI kapı; mobil sözleşme (`CatalogImageSchema`) bu şekli okuyor. Web köprüsü
    benimseme günü `image.url` okur — ikinci bir görsel çözümü yaşamaz.
  · Dil `PreferredLanguage` (`@lezzet/types`) — paket `@lezzet/i18n`ın `Locale`ına bağlanmaz;
    katalog orkestrasyonunun aynı kararı.

  **Token oturum yerine geçer.** Geçersiz ya da süresi dolmuş token `null` döner — "böyle bir davet
  var ama senin değil" demek, olmayan bir kaydın varlığını doğrulamaktır. Süre süzgeci servisin
  içinde (`findByToken`), tek yerde.
*/

/** Değerlendirme akışındaki tek kart — müşterinin aldığı bir ürün. */
export interface FeedbackCard {
  productId: string;
  name: string;
  image: StorefrontImage;
  /** Müşteri bu ürünü zaten değerlendirdiyse mevcut kaydı — akış kaldığı yerden devam eder. */
  existing: { vote: ProductFeedback['vote']; rating: number | null; comment: string | null } | null;
}

/** Davet açıldığında ekranın gördüğü her şey — tek turda. */
export interface FeedbackInviteView {
  requestId: string;
  customerId: string;
  /** Karşılama ve teşekkür ekranı adla hitap ediyor ("Teşekkürler Ayşe Hanım!"). Yoksa genel cümle. */
  customerName: string | null;
  /** vFb başlık rozeti ("LZA-2417") ve web karşılaması bunu basıyor. */
  orderReferenceNo: string | null;
  /** Siparişin tarihi — ham ISO, biçimleme ekranın (dil orada belli). */
  orderedOn: string | null;
  cards: FeedbackCard[];
  /** "2 / 5" — türetilir, saklanmaz (`feedback_request_progress` görünümü). */
  progress: { rated: number; total: number };
  /**
   * Tamamlamanın kazandıracağı puan — **AYARDAN** (`points_feedback_purchase`), ekrana gömülmez.
   * Tasarımdaki `+15` bir maket sayısı; kodlanmış olsaydı ayar değiştiği gün ekran müşteriye
   * sistemin vermeyeceği bir sayı söylerdi (29.07 denetiminin 300/500 dersi).
   */
  completionPoints: number;
  /** Tamamlanmış davet tekrar açılırsa: teşekkür durumu, puan ikinci kez verilmez. */
  completedAt: string | null;
  pointsAwarded: number | null;
}

/**
 * **Davetin açılması** — bağlantıdaki token'la. Akışın tek giriş kapısı.
 *
 * **Yarıda bırakılan akış kaldığı yerden devam eder:** her kart mevcut değerlendirmesiyle gelir;
 * ekran ilk OYSUZ karttan sürer (ölçüt `existing` değil `existing.vote` — yalnız yorum taşıyan
 * kart hâlâ cevapsızdır).
 */
export async function openFeedbackInvite(
  db: SupabaseClient,
  locale: PreferredLanguage,
  token: string,
): Promise<FeedbackInviteView | null> {
  const request = await new FeedbackRequestService(db).findByToken(token);
  if (!request) return null;

  const [order, items, progress, given, customer, completionPoints] = await Promise.all([
    new OrderService(db).getById(request.orderId),
    new OrderItemService(db).listByOrder(request.orderId),
    new FeedbackProgressService(db).getByRequest(request.id),
    new ProductFeedbackService(db).listByRequest(request.id),
    new UserProfileService(db).getById(request.customerId),
    // Sözün sayısı ayardan; ekran kendi rakamını uydurmaz. Varsayılan `points.ts`te TEK yerde.
    feedbackCompletionPoints(db),
  ]);

  // Kalem varyanta bağlı, kart ürüne: aynı ürünün iki boyu TEK karttır.
  const variants = await new ProductVariantService(db).listByIds(items.map((i) => i.variantId));
  const productIds = [...new Set(variants.map((v) => v.productId))];
  const products = await new ProductService(db).listByIds(productIds);
  const givenByProduct = new Map(given.map((g) => [g.productId, g]));

  return {
    requestId: request.id,
    customerId: request.customerId,
    customerName: customer?.name ?? null,
    orderReferenceNo: order?.referenceNo ?? null,
    orderedOn: order?.createdAt ?? null,
    completionPoints,
    cards: products.map((product) => {
      const existing = givenByProduct.get(product.id);
      return {
        productId: product.id,
        name: resolveLocalizedText(product.name, locale),
        image: imageOf(product),
        existing: existing ? { vote: existing.vote, rating: existing.rating, comment: existing.comment } : null,
      };
    }),
    progress: { rated: progress?.ratedProducts ?? 0, total: progress?.totalProducts ?? 0 },
    completedAt: request.completedAt,
    pointsAwarded: request.pointsAwarded,
  };
}

export interface FeedbackCompletion {
  outcome: FeedbackOutcome;
  /** Bu ÇAĞRININ yazdığı puan (tamamlama primi); ikinci kez tamamlamada 0. Turun toplamı bu değil. */
  pointsAwarded: number;
  /**
   * Bu davete yazılmış TOPLAM puan — oylar + yorum + tamamlama primi (`sumInvitePoints`).
   *
   * Ölçüldü (11.08): yazım uçları puanı geri söylemediği için ekran "+5" derken deftere 5+20+5 = 30
   * yazılıyordu. İstemcide toplamak motoru taklit etmek olurdu; toplamı defter söyler.
   * İkinci tamamlamada `pointsAwarded` 0'a düşer, bu alan turun gerçeğini söylemeye devam eder.
   */
  invitePointsTotal: number;
  balance: number;
  /** Yalnız `review_invite` sonucunda dolu — dış değerlendirme adresi ve düğmede yazacak ad. */
  reviewUrl: string | null;
  reviewPlatform: string | null;
}

/**
 * **Akışın tamamlanması** — puan burada verilir ve akış sonu belirlenir.
 *
 * **Puan tamamlamaya bağlıdır, beğeniye değil** (DOMAIN §14): müşteri her ürüne "beğenmedim" dese
 * de ödülünü alır. Arayüz bunun tersini ima bile etmemeli.
 *
 * İkinci çağrı puan vermez: `completedAt` damgası bunu söyler, defterdeki tekillik de ikinci bir
 * emniyet olarak durur.
 */
export async function completeFeedbackInvite(db: SupabaseClient, token: string): Promise<FeedbackCompletion | null> {
  const requests = new FeedbackRequestService(db);
  const request = await requests.findByToken(token);
  if (!request) return null;

  const given = await new ProductFeedbackService(db).listByRequest(request.id);
  const likeCount = given.filter((g) => g.vote === 'like').length;
  const dislikeCount = given.filter((g) => g.vote === 'dislike').length;

  // Hangi platform olduğu buranın kararı DEĞİL, ayarın: Google İşletme Profili de Trustpilot da
  // aynı uca takılır (`review_platform_url`). Motor yalnız "bağlantı var mı"yı sorar.
  const settings = new SettingsService(db);
  const reviewUrl = (await settings.get<string>('review_platform_url', '')) || null;
  const outcome = feedbackOutcomeOf({ likeCount, dislikeCount, hasReviewLink: Boolean(reviewUrl) });
  const invite =
    outcome === 'review_invite'
      ? { reviewUrl, reviewPlatform: await settings.get<string>('review_platform_name', 'Google') }
      : { reviewUrl: null, reviewPlatform: null };

  // Turun puan kayıtlarının KAYNAKLARI: tamamlama primi davetin kendisine, kart puanları (oy ve
  // yorum) o davetin geri bildirim satırlarına yazılır — defterdeki `ref_id` bu kümeden çıkar.
  const roundRefIds = [request.id, ...given.map((g) => g.id)];

  // Zaten tamamlanmış: teşekkür durumu gösterilir, puan İKİNCİ KEZ verilmez. Turun TOPLAMI yine de
  // dolu döner — "bu çağrı ne verdi" ile "bu tur ne kazandırdı" ayrı sorular.
  if (request.completedAt) {
    const [balance, invitePointsTotal] = await Promise.all([
      getPointsBalance(db, request.customerId),
      sumInvitePoints(db, { customerId: request.customerId, refIds: roundRefIds, since: request.createdAt }),
    ]);
    return { outcome, pointsAwarded: 0, invitePointsTotal, balance: balance.balance, ...invite };
  }

  // Tamamlama puanı davetin KENDİSİNE yazılır: tek tek kartların puanı zaten kart başına verildi.
  const entry = await awardPoints(db, { customerId: request.customerId, reason: 'feedback_purchase', refId: request.id });
  const points = entry?.points ?? 0;
  await requests.markCompleted(request.id, points);

  // Toplam ve bakiye YAZIMDAN SONRA okunur: primin kaydı ikisine de girmeli.
  const [balance, invitePointsTotal] = await Promise.all([
    getPointsBalance(db, request.customerId),
    sumInvitePoints(db, { customerId: request.customerId, refIds: roundRefIds, since: request.createdAt }),
  ]);
  return { outcome, pointsAwarded: points, invitePointsTotal, balance: balance.balance, ...invite };
}

/** Siparişin AÇIK değerlendirme daveti — sipariş ekranının teşvik bloğunun tek kaynağı. */
export interface OrderFeedbackInvite {
  /** Akışın anahtarı; ekran `/feedback/[token]`e bununla gider (oturum yerine geçer). */
  token: string;
  /** Tamamlamanın kazandıracağı puan — AYARDAN, ekran sayı uydurmaz (`FeedbackInviteView` künyesi). */
  completionPoints: number;
}

/**
 * **Siparişten davete giden yol** (27.08 · kullanıcı kararı) — sipariş ekranındaki yorum teşviki.
 *
 * Bu yol BİLEREK yoktu ve yokluğu kayıtlıydı: sipariş detayı künyesi *"sipariş numarasından
 * token'a giden bir yol YOK"* diyerek tasarımın "★ Ürünleri değerlendir" düğmesini çizmemişti —
 * düğmeyi çizip hiçbir yere götürmemek verilmiş bir sözü tutmamaktır. Yol şimdi açılıyor çünkü
 * yorum daveti bildirimi artık SİPARİŞ sayfasına götürüyor (kullanıcı kararı): götürülen yerde
 * yorum yazacak bir kapı yoksa bildirim de boş bir vaat olurdu.
 *
 * **`null` ÜÇ HÂLİ birden kapsar ve ayrımı ekran BİLMEZ:** davet hiç yok (sipariş henüz teslim
 * edilmedi — davet 10. günde doğar) · zaten tamamlandı · token'ın 90 günlük ömrü doldu. Üçünde de
 * söylenecek bir şey yoktur ve blok çizilmez; "davetiniz sona erdi" demek, müşterinin hiç görmediği
 * bir şeyin kaybını duyurmak olurdu.
 *
 * **Token'ı sipariş cevabında taşımanın sakıncası yok:** uç zaten kimlik süzüyor (müşteri kendi
 * siparişini okuyor) ve aynı token davet e-postasında düz metin bağlantı olarak zaten gidiyor.
 */
export async function readOrderFeedbackInvite(db: SupabaseClient, orderId: string): Promise<OrderFeedbackInvite | null> {
  const request = await new FeedbackRequestService(db).findByOrder(orderId);
  if (!request || request.completedAt !== null) return null;
  // Süresi dolmuş token akışı açmaz (`openFeedbackInvite` da reddeder); teşvik onu vaat etmemeli.
  if (Date.parse(request.expiresAt) <= Date.now()) return null;
  return { token: request.token, completionPoints: await feedbackCompletionPoints(db) };
}
