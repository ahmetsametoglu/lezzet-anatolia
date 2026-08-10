import type { z } from 'zod';
import {
  FeedbackAckSchema,
  FeedbackCompletionSchema,
  FeedbackInviteSchema,
  type FeedbackCompletion,
  type FeedbackInvite,
  type FeedbackReviewBodySchema,
  type FeedbackVoteBodySchema,
} from '@lezzet/types';
import type { Locale } from '@lezzet/i18n';

import { apiFetch, type ApiResult } from './client';

/*
  GERİ BİLDİRİM DAVETİ — `/api/v1/feedback/:token` (17.2 · v3 tasarım 17, vFb).

  ŞEMA BURADA YAZILMAZ (`recipe.ts` · `tickets.ts` ile aynı gerekçe): sözleşme `@lezzet/types`ta
  (`contracts/feedback-api.schema.ts`) ve UÇ DA aynı şemayla üretiyor (02-mimari §3.2) — alan adı
  değişirse üreten ve tüketen aynı anda DERLEMEDE kırılır. Bu dosyanın işi yalnız yolu kurmak ve
  şemayı istemciye vermek.

  KORUMASIZ ÇAĞRI (`apiFetch`) ve gerekçesi katalogunkinden FARKLI: **token kimliğin KENDİSİDİR.**
  Davet bağlantısı e-postadan tıklanır ve müşteriden giriş istenmez; `authorizedFetch` kullanılsaydı
  oturumsuz cihazda istek ağa hiç çıkmaz, davet linki sessizce ölürdü. Kimlik her istekte SUNUCUDA
  token'dan çözülür — bu dosya hiçbir yerde `customerId` taşımaz (ucun kendi künyesi).

  TOKEN YOLDA, GÖVDEDE DEĞİL: dört ucun dördü de onu adresten alıyor (`ucun kapısı`), gövdeye
  konsaydı aynı kimlik iki ayrı yerde yaşardı.
*/

/** Yazım cevabı — "kayıt düştü"; ilerlemeyi ekran zaten iyimser tutuyor (sözleşme künyesi). */
type FeedbackAck = z.infer<typeof FeedbackAckSchema>;

/**
 * Yazım gövdeleri — `z.input`: derleme kilidi şemanın GİRDİ şeklinden gelir (`discover.ts` deseni),
 * böylece sözleşmede alan adı değişirse çağıran da derlemede kırılır.
 *
 * İHRAÇ EDİLMİYOR: tek tüketen bu dosyanın kendi imzaları ve çağıran hook nesne değişmeziyle
 * geçiyor — dışa açmak, silinmeye aday bir adı ekranlara davet etmek olurdu (`me-api.schema`
 * künyesindeki ihraç minimumu).
 */
type FeedbackVoteInput = z.input<typeof FeedbackVoteBodySchema>;
/** Yorum gövdesi — yıldız ve metin ayrı ayrı isteğe bağlı; ikisi de boşsa uç `review_empty` der. */
type FeedbackReviewInput = z.input<typeof FeedbackReviewBodySchema>;

/**
 * Davetin açılması — ekranın üç aşamasının tüm malzemesi TEK turda (sözleşmenin sözü).
 *
 * `locale` ZORUNLU: uç dilsiz çağrıyı `400 invalid_locale` ile reddediyor (kart adları sunucuda
 * çözülür, sessizce Türkçeye düşmek gizli bir arızadır) — katalog ve tarif istemcilerinin kuralı.
 *
 * GEÇERSİZ/ESKİMİŞ BAĞLANTI 404 `invalid_link`: ekran bunu "bulunamadı" olarak okur, ağ arızasıyla
 * karıştırmaz — davetin varlığı doğrulanmaz (ucun künyesi).
 */
export function fetchFeedbackInvite(token: string, locale: Locale): Promise<ApiResult<FeedbackInvite>> {
  return apiFetch(
    `/api/v1/feedback/${encodeURIComponent(token)}?locale=${encodeURIComponent(locale)}`,
    FeedbackInviteSchema,
  );
}

/**
 * Kart oyu — ÜRÜN BAŞINA ve dokunuşun kendisiyle yazılır, tur sonunda toplu değil: yarıda
 * bırakılan akış kaldığı yerden sürsün (uç ve web akışının aynı kararı).
 */
export function submitFeedbackVote(token: string, input: FeedbackVoteInput): Promise<ApiResult<FeedbackAck>> {
  return apiFetch(`/api/v1/feedback/${encodeURIComponent(token)}/vote`, FeedbackAckSchema, {
    method: 'POST',
    body: input,
  });
}

/** Akış sonunun isteğe bağlı yorumu — sözleşme yorumu ÜRÜNE bağlar (`productId` zorunlu). */
export function submitFeedbackReview(token: string, input: FeedbackReviewInput): Promise<ApiResult<FeedbackAck>> {
  return apiFetch(`/api/v1/feedback/${encodeURIComponent(token)}/review`, FeedbackAckSchema, {
    method: 'POST',
    body: input,
  });
}

/**
 * Akışın tamamlanması — puan burada verilir ve akış sonu (dış değerlendirme daveti / sorun
 * köprüsü) CEVAPTAN gelir: "memnun mu" kararı MOTORUN (`feedbackOutcomeOf`), istemci saymaz.
 *
 * Gövdesi YOK: tamamlanacak davet zaten adresteki token. İkinci çağrı puan vermez
 * (`pointsAwarded: 0`) — davetin `completedAt` damgası uçta tutuyor.
 */
export function completeFeedback(token: string): Promise<ApiResult<FeedbackCompletion>> {
  return apiFetch(`/api/v1/feedback/${encodeURIComponent(token)}/complete`, FeedbackCompletionSchema, {
    method: 'POST',
  });
}
