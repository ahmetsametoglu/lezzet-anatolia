import { Hono } from 'hono';
import type { z } from 'zod';
import { serviceDb } from '@lezzet/database';
import {
  completeFeedbackInvite,
  openFeedbackInvite,
  reviewFeedbackInvite,
  voteOnFeedbackInvite,
} from '@lezzet/application';
import {
  FeedbackAckSchema,
  FeedbackCompletionSchema,
  FeedbackInviteSchema,
  FeedbackReviewBodySchema,
  FeedbackVoteBodySchema,
  PreferredLanguageEnum,
} from '@lezzet/types';
import type { AppEnv } from '../../context';
import { fail, ok } from '../../lib/respond';

/**
 * Geri bildirim uçları — alım-sonrası davetin mobil kapısı (17.2 · v3 tasarım 17, vFb).
 *
 * **AÇIK KÜME ve gerekçesi katalogunkinden FARKLI: token kimliğin KENDİSİDİR.** Davet bağlantısı
 * e-postadan/bildirimden tıklanır ve müşteriden giriş istenmez (tasarım: "akıcılık bozulmamalı");
 * `bearerAuth` istemek, davetin tam da kaldırdığı kapıyı geri koymak olurdu. Kimlik her istekte
 * SUNUCUDA token'dan çözülür (`@lezzet/application`ın davet kapıları) — bu dosya hiçbir yerde
 * `customerId` almaz; alsaydı istemciden gönderilen bir kimlikle başkasının adına yazılabilirdi.
 * Geçersiz/süresi dolmuş token 404 `invalid_link`: "böyle bir davet var ama senin değil" demek,
 * olmayan bir kaydın varlığını doğrulamaktır. `router.ts`te `bearerAuth`tan ÖNCE bağlanır.
 *
 * ── BU DOSYA KURAL HESAPLAMAZ (katalog ucunun aynı sözü) ─────────────────────
 * Satın alma doğrulaması, kısmi güncelleme, puanın sessiz yazımı, akış sonu kararı — hepsi
 * `@lezzet/application/feedback`ta ve web davet sayfasının okuduğu kuralların TAM AYNISI. Burada
 * yalnız sorgu/gövde çözümü, sonucun sözleşme şekline indirgenmesi ve zarf var.
 */
export const feedback = new Hono<AppEnv>();

/**
 * Davetin açılması — ekranın üç aşamasının tüm malzemesi tek turda.
 *
 * `locale` zorunlu ve varsayılansız (katalog `LocaleSchema` künyesi): kart adları sunucuda
 * çözülür, sessizce Türkçeye düşmek gizli bir arızadır.
 *
 * Kartsız davet de 404 — sipariş kalemleri silinmişse gösterilecek bir akış yok; boş bir ekran
 * müşteriye "bozuk" der (web sayfasının aynı kuralı, sözleşmenin `min(1)` kilidi).
 */
feedback.get('/feedback/:token', async (c) => {
  const locale = PreferredLanguageEnum.safeParse(c.req.query('locale'));
  if (!locale.success) return fail(c, 'invalid_locale', 400);

  const invite = await openFeedbackInvite(serviceDb(), locale.data, c.req.param('token'));
  if (!invite || invite.cards.length === 0) return fail(c, 'invalid_link', 404);

  // ── SÖZLEŞMENİN KİLİDİ (`catalog.ts` emsali) ──────────────────────────────
  // Gövde `z.input<…>` ile TİPLENİR: uygulama görünümü sözleşmeye alan alan uymak zorunda ve
  // uymadığı gün burası DERLENMEZ. `parse` ayrıca SÜZGEÇTİR: görünümün taşıdığı ama sözleşmede
  // olmayan alanlar (`requestId`, `customerId`) zarfa SIZAMAZ — kimlik telefonda işe yaramaz,
  // taşınmaz (şema künyesi).
  const body: z.input<typeof FeedbackInviteSchema> = invite;
  return ok(c, FeedbackInviteSchema.parse(body));
});

/**
 * Kart oyu (👍/👎) — v3 stage0'ın yazımı. Oy anında yazılır; "sonra bitir" bir kayıt eylemi değil
 * bir çıkıştır (web akışının aynı kararı — yarıda bırakma kaybolmaz).
 *
 * Motorun iç retleri müşteriye ANLATILMAZ: `not_purchased` sistemin iç yapısını söyler ve zaten
 * müşterinin düzeltebileceği bir şey değil — kart listesi siparişten geliyor, bu hâl ancak veriyle
 * oynanırsa doğar. Tek anahtara iner: `vote_failed` (web `voteAction`ın ölçülmüş kararı).
 */
feedback.post('/feedback/:token/vote', async (c) => {
  const body = FeedbackVoteBodySchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return fail(c, 'invalid_body', 400);

  const outcome = await voteOnFeedbackInvite(serviceDb(), { token: c.req.param('token'), ...body.data });
  if (outcome.status === 'invalid_link') return fail(c, 'invalid_link', 404);
  if (outcome.status !== 'ok') return fail(c, 'vote_failed', 400);
  return ok(c, FeedbackAckSchema.parse({ recorded: true }));
});

/**
 * İsteğe bağlı yıldız + yazılı yorum — v3 stage1'in "bir şey eklemek ister misiniz" kutusu.
 *
 * `review_empty` GERÇEK bir kullanıcı hatası ve ayrı cümleyi hak ediyor: müşteri "kaydet"e bastı
 * ama ne yıldız ne metin var. Öbür retler `vote_failed`a iner (üstteki gerekçe). Anahtarlar web
 * davet sayfasının sözlüğüyle AYNI — iki yüzey aynı hâle iki ayrı ad vermesin.
 */
feedback.post('/feedback/:token/review', async (c) => {
  const body = FeedbackReviewBodySchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return fail(c, 'invalid_body', 400);

  const outcome = await reviewFeedbackInvite(serviceDb(), { token: c.req.param('token'), ...body.data });
  if (outcome.status === 'invalid_link') return fail(c, 'invalid_link', 404);
  if (outcome.status === 'empty_review') return fail(c, 'review_empty', 400);
  if (outcome.status !== 'ok') return fail(c, 'vote_failed', 400);
  return ok(c, FeedbackAckSchema.parse({ recorded: true }));
});

/**
 * Akışın tamamlanması — puan burada verilir, akış sonu (Google daveti / sorun köprüsü) belirlenir.
 *
 * Sonucu MOTOR söyler (`feedbackOutcomeOf`), ekran değil: "memnun mu" beğeni ORANINA bakan bir
 * eşiktir ve istemcide sayılsaydı iki yerde iki farklı memnuniyet tanımı olurdu. İkinci çağrı
 * puan vermez (`pointsAwarded: 0`) — davetin `completedAt` damgası + defter tekilliği.
 *
 * `z.input` kilidi burada İKİ birliği birbirine çiviler: motorun `FeedbackOutcome`u sözleşmenin
 * `FeedbackOutcomeEnum`undan saparsa bu atama DERLENMEZ (types motor paketine bağlanamadığı için
 * bağ ancak burada kurulabilir — sözleşme künyesi).
 */
feedback.post('/feedback/:token/complete', async (c) => {
  const completion = await completeFeedbackInvite(serviceDb(), c.req.param('token'));
  if (!completion) return fail(c, 'invalid_link', 404);

  const body: z.input<typeof FeedbackCompletionSchema> = completion;
  return ok(c, FeedbackCompletionSchema.parse(body));
});
