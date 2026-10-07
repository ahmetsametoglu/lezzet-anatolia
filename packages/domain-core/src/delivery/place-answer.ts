import type { PlaceResolution } from '@lezzet/types';

/** Posta kodu cevabının cümlesi; ortak sözlükte `zip.<not>Note` anahtarıyla durur. */
export type PlaceAnswerNote = 'inside' | 'shipping' | 'ambiguous' | 'unknown' | 'outside' | 'unresolved';

/** Web'in yer cevabı da mobil sözleşmesi de bu alanları taşır; çözülmüş yerden yalnız rota bilgisi okunur. */
type PlaceAnswer =
  | { kind: 'resolved'; place: { inRoute: boolean } }
  | { kind: 'ambiguous' }
  | { kind: 'unknown' }
  | Extract<PlaceResolution, { kind: 'unresolved' }>;

/**
 * Rota dışında çözülen yer uyarı değil teslim şeklidir ve kargo cümlesini alır. Çözülemeyen hâllerden yalnız bölge dışı ayrı söylenir,
 * çünkü depo eksiği ve bölge çakışması bizim sorunumuzdur.
 */
export function placeAnswerNote(answer: PlaceAnswer): PlaceAnswerNote {
  switch (answer.kind) {
    case 'resolved':
      return answer.place.inRoute ? 'inside' : 'shipping';
    case 'ambiguous':
    case 'unknown':
      return answer.kind;
    default:
      return answer.reason === 'outside_zones' ? 'outside' : 'unresolved';
  }
}
