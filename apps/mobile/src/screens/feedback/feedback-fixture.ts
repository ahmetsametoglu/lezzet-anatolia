import { CROP_CENTER } from '@lezzet/types';
import type { FeedbackCard, FeedbackCompletion, FeedbackInvite } from '@lezzet/types';

/*
  GERİ BİLDİRİM TEST VERİSİ — ekran testinin TEL CEVABI (fetch mock'u bu gövdeyi döner). Şekil
  SÖZLEŞMEDEN TÜRER (`FeedbackInvite` · `FeedbackCard` · `FeedbackCompletion`): sözleşme bir alan
  kazandığında bu dosya derlemede kırılır ve test güncellenmeden yeşile dönemez (ürün ve tarif
  fixture'larının kuralı, birebir).

  ── ÖNCEKİ HÂLİ EKRANIN VERİ KAYNAĞIYDI ─────────────────────────────────────
  Ekran uçlara bağlanmadan önce davet buradan okunuyordu ve dosya sözleşmenin ALAN ALAN ELLE
  YAZILMIŞ AYNASINI taşıyordu (`FeedbackInviteView` · `FeedbackCardView` · `FeedbackCompletionView`
  · `FeedbackOutcome`). Kendi künyesi de sebebini ve son kullanma tarihini yazmıştı: "şema
  `@lezzet/types` barrel'ına bağlanmadığı için `z.infer` ile türetilemedi; ihraç açıldığı gün bu
  tipler silinir". Barrel açık (`contracts/index.ts`) — beş tip ve demo tamamlayıcı silindi, ikinci
  sözleşme bitti (CLAUDE §1).

  KİMLİKLER UUID: `productId` şemada `z.string().uuid()` ve istemci gövdeyi gerçekten parse ediyor —
  okunur olsunlar diye sonları sayaçlı.
*/

const uuid = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

/** Akıştaki tek kart — varsayılanı CEVAPSIZ (akış onunla başlar). */
export function feedbackCard(index: number, overrides: Partial<FeedbackCard> = {}): FeedbackCard {
  const names = ['Fıstıklı Baklava', 'El Açması Kol Böreği', 'Antep Fıstığı (250 g)'];
  return {
    productId: uuid(2100 + index),
    name: names[index] ?? `Ürün ${index + 1}`,
    image: { url: `https://cdn.test/feedback-${index}.jpg`, crop: CROP_CENTER },
    existing: null,
    ...overrides,
  };
}

/** Üç kartlı, henüz tamamlanmamış davet — akışın her aşamasını açan hâl. */
export function feedbackInvite(overrides: Partial<FeedbackInvite> = {}): FeedbackInvite {
  const cards = overrides.cards ?? [feedbackCard(0), feedbackCard(1), feedbackCard(2)];
  return {
    customerName: 'Elif Kaya',
    orderReferenceNo: 'LA-2411',
    orderedOn: '2026-07-28T10:05:00Z',
    progress: { rated: 0, total: cards.length },
    /** Ayardan gelen değer; ekrana gömülü değil (sözleşme künyesi) — v3'ün maket sayısı 15'ti. */
    completionPoints: 15,
    completedAt: null,
    pointsAwarded: null,
    ...overrides,
    cards,
  };
}

/** Tamamlama cevabı — varsayılanı "memnun" dalı (dış değerlendirme daveti + puan). */
export function feedbackCompletion(overrides: Partial<FeedbackCompletion> = {}): FeedbackCompletion {
  return {
    outcome: 'review_invite',
    pointsAwarded: 15,
    /* TOPLAM PRİMDEN BÜYÜK olmalı (MB-17): tur puanı üç kayıttan doğuyor — kart oyu, yorum ve
       tamamlama primi — ve ekran artık primi değil TOPLAMI yazıyor. İkisini eşit yazsaydık
       fixture, aradaki farkı hiç ölçmeyen bir dünya kurardı ve kapının prime mi toplama mı bağlı
       olduğunu hiçbir test yakalayamazdı. Prim v3 maketinden (15), üstü kart+yorum payı. */
    invitePointsTotal: 40,
    balance: 255,
    reviewUrl: 'https://g.page/lezzet-anatolia/review',
    reviewPlatform: 'Google',
    ...overrides,
  };
}
