import { describe, expect, it } from 'vitest';
import {
  FeedbackAckSchema,
  FeedbackCompletionSchema,
  FeedbackInviteSchema,
  FeedbackReviewBodySchema,
  FeedbackVoteBodySchema,
} from './feedback-api.schema';

/**
 * Geri bildirim SÖZLEŞMESİNİN kendi kuralları — DB'siz, saf `parse` davranışı.
 *
 * Sınanan şey akış değil (o `@lezzet/application`ın entegrasyon testinde), sözleşmenin verdiği
 * sözler: **kimlik zarfa sızmaz** (uç `parse` ile süzer — buradaki iddia o süzgecin kendisi),
 * kartsız davet şemadan geçmez (`min(1)`), gövde şemaları geçersiz değeri reddeder.
 *
 * Import GÖRELİ: bu şemalar `contracts/index.ts`ten henüz ihraç edilmiyor (satırları ana şerit
 * ekleyecek); test barrel'a değil dosyanın kendisine bakar.
 */

/** Uygulama görünümünün taşıdığı FAZLA alanlarla birlikte geçerli bir davet gövdesi. */
function inviteBody() {
  return {
    // Uygulama görünümünde var, sözleşmede BİLEREK yok — parse süzmeli.
    requestId: 'c0ffee00-0000-4000-8000-000000000001',
    customerId: 'c0ffee00-0000-4000-8000-000000000002',
    customerName: 'Ayşe Kaya',
    orderReferenceNo: 'LZA-2417',
    orderedOn: '2026-07-08T10:00:00.000Z',
    cards: [
      {
        productId: 'c0ffee00-0000-4000-8000-000000000003',
        name: 'Su Böreği',
        image: { url: null, crop: { x: 50, y: 50, zoom: 100 } },
        existing: null,
      },
    ],
    progress: { rated: 0, total: 1 },
    completionPoints: 5,
    completedAt: null,
    pointsAwarded: null,
  };
}

describe('FeedbackInviteSchema', () => {
  it('kimlik alanları zarfa SIZMAZ — parse süzer', () => {
    const parsed = FeedbackInviteSchema.parse(inviteBody());
    expect(parsed).not.toHaveProperty('requestId');
    expect(parsed).not.toHaveProperty('customerId');
    expect(parsed.cards[0]?.name).toBe('Su Böreği');
  });

  it('kartsız davet şemadan geçmez — uç onu zaten 404 eder, şema sözü kilitler', () => {
    expect(FeedbackInviteSchema.safeParse({ ...inviteBody(), cards: [] }).success).toBe(false);
  });

  it('yarıda bırakılmış akışın kartı mevcut cevabıyla gelir — oy null olabilir (yalnız yorumlu kart)', () => {
    const body = inviteBody();
    body.cards[0]!.existing = { vote: null, rating: null, comment: 'Tam annemin yaptığı gibiydi' } as never;
    const parsed = FeedbackInviteSchema.parse(body);
    expect(parsed.cards[0]?.existing).toEqual({ vote: null, rating: null, comment: 'Tam annemin yaptığı gibiydi' });
  });
});

describe('yazım gövdeleri', () => {
  it('oy gövdesi yalnız like/dislike tanır', () => {
    const productId = 'c0ffee00-0000-4000-8000-000000000003';
    expect(FeedbackVoteBodySchema.safeParse({ productId, vote: 'like' }).success).toBe(true);
    expect(FeedbackVoteBodySchema.safeParse({ productId, vote: 'love' }).success).toBe(false);
    expect(FeedbackVoteBodySchema.safeParse({ productId }).success).toBe(false);
  });

  it('yorum gövdesinde yıldız/metin isteğe bağlı; yıldız aralığı 1–5', () => {
    const productId = 'c0ffee00-0000-4000-8000-000000000003';
    // Boş gövdeyi ŞEMA reddetmez — "ikisi de boş" kararı kapıda, TEK yerde (`review_empty`).
    expect(FeedbackReviewBodySchema.safeParse({ productId }).success).toBe(true);
    expect(FeedbackReviewBodySchema.safeParse({ productId, comment: 'Çok iyiydi' }).success).toBe(true);
    expect(FeedbackReviewBodySchema.safeParse({ productId, rating: 5 }).success).toBe(true);
    expect(FeedbackReviewBodySchema.safeParse({ productId, rating: 0 }).success).toBe(false);
    expect(FeedbackReviewBodySchema.safeParse({ productId, rating: 6 }).success).toBe(false);
  });
});

describe('akış sonu', () => {
  it('üç sonuç da tanınır; tanınmayan sonuç reddedilir', () => {
    const base = { pointsAwarded: 5, invitePointsTotal: 30, balance: 45, reviewUrl: null, reviewPlatform: null };
    for (const outcome of ['review_invite', 'report_issue', 'thanks']) {
      expect(FeedbackCompletionSchema.safeParse({ ...base, outcome }).success).toBe(true);
    }
    expect(FeedbackCompletionSchema.safeParse({ ...base, outcome: 'celebrate' }).success).toBe(false);
  });

  it('ikinci tamamlama sıfır puanla geçerlidir; eksi puan geçemez', () => {
    const base = { outcome: 'thanks', invitePointsTotal: 30, balance: 45, reviewUrl: null, reviewPlatform: null };
    expect(FeedbackCompletionSchema.safeParse({ ...base, pointsAwarded: 0 }).success).toBe(true);
    expect(FeedbackCompletionSchema.safeParse({ ...base, pointsAwarded: -5 }).success).toBe(false);
  });

  /**
   * Turun toplamı ile çağrının primi AYRI alanlar (MB-17) — ölçülen arıza tam olarak buydu: ekran
   * "+5 puan" derken deftere 5 + 20 + 5 = 30 yazılmıştı. Şema ikisinin bağımsızlığını kilitler ki
   * bir gün biri ötekinden türetilmeye kalkılmasın.
   */
  it('turun toplamı ZORUNLU ve `pointsAwarded`tan bağımsız — ikinci tamamlamada prim 0, toplam dolu', () => {
    const base = { outcome: 'thanks', balance: 45, reviewUrl: null, reviewPlatform: null };
    // Alan yoksa geçmez: eksik toplam, ekranın sessizce yalnız primi göstermesi demekti.
    expect(FeedbackCompletionSchema.safeParse({ ...base, pointsAwarded: 5 }).success).toBe(false);

    const reopened = FeedbackCompletionSchema.parse({ ...base, pointsAwarded: 0, invitePointsTotal: 30 });
    expect(reopened.pointsAwarded).toBe(0);
    expect(reopened.invitePointsTotal).toBe(30);

    // Hiç puan doğurmayan tur (B2B ya da tavan) sıfır toplamla geçerlidir; eksi toplam geçemez.
    expect(FeedbackCompletionSchema.safeParse({ ...base, pointsAwarded: 0, invitePointsTotal: 0 }).success).toBe(true);
    expect(FeedbackCompletionSchema.safeParse({ ...base, pointsAwarded: 0, invitePointsTotal: -1 }).success).toBe(false);
  });

  it('onay zarfı yalnız recorded:true taşır', () => {
    expect(FeedbackAckSchema.safeParse({ recorded: true }).success).toBe(true);
    expect(FeedbackAckSchema.safeParse({ recorded: false }).success).toBe(false);
  });
});
