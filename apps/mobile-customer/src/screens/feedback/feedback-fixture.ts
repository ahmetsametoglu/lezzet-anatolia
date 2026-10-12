import { CROP_CENTER } from '@lezzet/types';
import type { FeedbackCard, FeedbackCompletion, FeedbackInvite } from '@lezzet/types';

/*
  Ekran testinin tel cevabı; şekil sözleşmeden türer ki sözleşme alan kazandığında bu dosya derlemede kırılsın. Kimlikler UUID,
  çünkü istemci gövdeyi gerçekten parse ediyor.
*/

const uuid = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

/** Akıştaki tek kart; varsayılanı cevapsız. */
export function feedbackCard(index: number, overrides: Partial<FeedbackCard> = {}): FeedbackCard {
  const names = ['Fıstıklı Baklava', 'El Açması Kol Böreği', 'Antep Fıstığı (250 g)'];
  return {
    productId: uuid(2100 + index),
    name: names[index] ?? `Ürün ${index + 1}`,
    image: { url: `https://cdn.test/feedback-${index}.jpg`, crop: CROP_CENTER, frames: null },
    detail: '500 g · ×1',
    existing: null,
    ...overrides,
  };
}

/** Üç kartlı, tamamlanmamış davet. Puanlar ayardan gelen değerlerdir ve birbirinden ayrı tutulur ki ekran hangisini yazdığını gizleyemesin. */
export function feedbackInvite(overrides: Partial<FeedbackInvite> = {}): FeedbackInvite {
  const cards = overrides.cards ?? [feedbackCard(0), feedbackCard(1), feedbackCard(2)];
  return {
    customerName: 'Elif Kaya',
    orderReferenceNo: 'LA-2411',
    orderedOn: '2026-07-28T10:05:00Z',
    progress: { rated: 0, total: cards.length },
    completionPoints: 7,
    votePoints: 5,
    reviewPoints: 20,
    reviewMinWords: 2,
    completedAt: null,
    pointsAwarded: null,
    ...overrides,
    cards,
  };
}

/** Tamamlama cevabı; varsayılanı "memnun" dalı. Toplam primden büyüktür, çünkü eşit olsalardı ekranın hangisini yazdığı ölçülemezdi. */
export function feedbackCompletion(overrides: Partial<FeedbackCompletion> = {}): FeedbackCompletion {
  return {
    outcome: 'review_invite',
    pointsAwarded: 15,
    invitePointsTotal: 40,
    balance: 255,
    reviewUrl: 'https://g.page/lezzet-anatolie/review',
    reviewPlatform: 'Google',
    ...overrides,
  };
}
