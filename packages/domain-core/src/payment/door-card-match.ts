/**
 * Kapıda kart Revolut Business uygulamasındaki Tap to Pay ile çekilir; ödeme bizim siparişi tanımaz. Bu kural Revolut'un yüz yüze
 * ödemesini bizde "kart" diye yazılmış tahsilatla tutar ve zaman üzerinden eşler (`docs/feature/kasa-muhasebe.md` §9).
 */

/** Revolut'un yüz yüze ödemesi: sipariş kimliği, alınan tutar (**cent**) ve anı. */
export interface InPersonPayment {
  ref: string;
  amountCents: number;
  at: string;
}

/** Bizde kapıda kart diye yazılmış, henüz Revolut ödemesine bağlanmamış tahsilat. */
export interface DoorCardCollection {
  movementId: string;
  amountCents: number;
  at: string;
}

export interface DoorCardMatch {
  ref: string;
  movementId: string;
}

/** Varsayılan pencere: personel kartı Revolut uygulamasında çekip birkaç dakika içinde bizde onaylar. */
export const DOOR_CARD_MATCH_WINDOW_MS = 30 * 60_000;

/**
 * Tutarı birebir tutan ve anları pencere içinde kalan ödeme ile tahsilat birbirinin adayıdır; yalnız birbirinin TEK adayı olanlar
 * bağlanır. Birden çok adayda tahmin yapılmaz, çünkü yanlış bağ komisyonu ve iadeyi başka siparişe taşırdı; o ödemeler elle eşlenir.
 */
export function matchDoorCardPayments(
  payments: readonly InPersonPayment[],
  collections: readonly DoorCardCollection[],
  windowMs: number = DOOR_CARD_MATCH_WINDOW_MS,
): DoorCardMatch[] {
  const fits = (payment: InPersonPayment, collection: DoorCardCollection) =>
    payment.amountCents === collection.amountCents && Math.abs(Date.parse(payment.at) - Date.parse(collection.at)) <= windowMs;

  return payments.flatMap((payment) => {
    const candidates = collections.filter((collection) => fits(payment, collection));
    if (candidates.length !== 1) return [];
    const [collection] = candidates as [DoorCardCollection];
    if (payments.filter((other) => fits(other, collection)).length !== 1) return [];
    return [{ ref: payment.ref, movementId: collection.movementId }];
  });
}

export interface DoorCardCandidates {
  /** Ödemelerin sırasıyla: tutarı birebir tutan tahsilatlar, anı ödemeye en yakın olan önce. */
  byPayment: Array<{ ref: string; movementIds: string[] }>;
  /** Hiçbir ödemenin tutarını tutmayan tahsilatlar. */
  orphans: string[];
}

/**
 * Elle eşlemenin adayları: zaman penceresi aranmaz, çünkü tahsilat ödemeden saatler sonra da yazılabilir; tutar ise birebir tutmalı,
 * yoksa komisyon ve iade yanlış siparişe giderdi.
 */
export function doorCardCandidates(payments: readonly InPersonPayment[], collections: readonly DoorCardCollection[]): DoorCardCandidates {
  const distance = (payment: InPersonPayment, collection: DoorCardCollection) =>
    Math.abs(Date.parse(payment.at) - Date.parse(collection.at));
  const byPayment = payments.map((payment) => ({
    ref: payment.ref,
    movementIds: collections
      .filter((collection) => collection.amountCents === payment.amountCents)
      .sort((a, b) => distance(payment, a) - distance(payment, b))
      .map((collection) => collection.movementId),
  }));
  const offered = new Set(byPayment.flatMap((entry) => entry.movementIds));
  return {
    byPayment,
    orphans: collections.filter((collection) => !offered.has(collection.movementId)).map((collection) => collection.movementId),
  };
}
