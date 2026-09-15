import type { LocalizedCopy } from '@lezzet/i18n';
import type placeMessages from '@lezzet/i18n/customer/place';

/**
 * `elsewhere` hâlinin alt sebebi: `stock` rota içinde ama kalem bölgenin deposunda yok (geçici, beklenecek şey kalemdir),
 * `out_of_route` rota dışında (kalıcı, soğuk zincir kargoya verilemediği için beklenecek şey bölgenin açılmasıdır). İkisi tek cümleye
 * inerse rota dışındaki müşteri gelmeyecek bir malı bekler; kural web ile native uygulamanın ortak cümlesi olduğu için helper'da durur.
 */
export type ElsewhereReason = 'stock' | 'out_of_route';

/**
 * **Yer bilinmiyorsa `stock`** ve bu bilinçli: "gönderemiyoruz" demek için rota dışında olduğunu
 * BİLMEK gerekir. Bilinmeyeni kalıcı bir olumsuzluğa çevirmek uydurma olurdu (`CLAUDE §1`) — ve
 * pratikte bu hâl zaten oluşmaz, `elsewhere` ancak yer biliniyorken doğar.
 */
export function elsewhereReasonOf(place: { inRoute: boolean } | null): ElsewhereReason {
  return place && !place.inRoute ? 'out_of_route' : 'stock';
}

/** Yer işaretinin cümleleri — ortak sözlükten türer (`@lezzet/i18n/customer/place`), elle yazılmaz. */
export type PlaceMarkCopy = Pick<LocalizedCopy<typeof placeMessages>, 'shipMark' | 'awayMark' | 'lineBlocked'>;

/** İşaretin tonu — native kitin `StockMark` sözlüğü: kargo (bilgi) · bekleyen bölge · kapalı kapı. */
export type PlaceMarkTone = 'info' | 'pending' | 'blocked';

export interface PlaceMark {
  label: string;
  tone: PlaceMarkTone;
}

/**
 * Kalemin yer işareti: `shipping` "Kargoyla gelir" (bilgi); `elsewhere` rota dışında kapalı kapı, rota içinde ya da yer
 * bilinmiyorken bekleyen bölge; `available` ve `out_of_stock` sessizdir, çünkü iyi haber sessizdir ve "Tükendi" kartın kendi
 * rozetidir. `status` bir `StockStatus`tur ama bu paket types'a bağlı olmadığı için iki değer adıyla yazılı; `null` işaret yok.
 */
export function placeMarkOf(status: string | null, place: { inRoute: boolean } | null, t: PlaceMarkCopy): PlaceMark | null {
  if (status === 'shipping') return { label: t.shipMark, tone: 'info' };
  if (status !== 'elsewhere') return null;
  return elsewhereReasonOf(place) === 'out_of_route' ? { label: t.lineBlocked, tone: 'blocked' } : { label: t.awayMark, tone: 'pending' };
}

/**
 * Kartın yer notu: "Kargoyla gelir" kartta yazılmaz, çünkü rota dışı müşterinin neredeyse bütün kartlarında yazan bilgi bilgi
 * olmaktan çıkar ve cümle listenin başındaki bantta tek yerde durur. Kapalı kapı kartı soldurur, bekleyen bölge soldurmaz, çünkü
 * ürün gelebilir.
 */
export function cardPlaceNoteOf(mark: PlaceMark | null): { note: string | undefined; dimmed: boolean } {
  if (mark === null || mark.tone === 'info') return { note: undefined, dimmed: false };
  return { note: mark.label, dimmed: mark.tone === 'blocked' };
}
