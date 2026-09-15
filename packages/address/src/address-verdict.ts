import type { AddressGeoPrecision } from '@lezzet/types';
import { normalizePostalCode } from './postal-code';

/**
 * "Bu kapı var mı" sorusunun saf cevabı: `geo_precision` kapının doğrulanamadığını söyler ama nedenini söylemez, oysa hiçbir
 * yerde olmayan kapı (yeni yapı olabilir) ile başka kodda bulunan kapı (neredeyse kesin yazım hatası) ayrı cevap ister. Karar bu
 * yüzden kısıtlı ve kısıtsız iki sorgudan çıkar, çünkü kodu pinleyen sorgu başka koddaki kapıyı hiç duymaz.
 */

/** Kısıtsız aramadan dönen bir aday — hangi kodda, hangi incelikte, ne güvenle. */
export interface AddressCandidate {
  /** Servisin verdiği tam etiket — düzeltme teklifinin metni bu olur. */
  label: string;
  postalCode: string;
  /** Teklifi uygulamak için şart: `label` ayrıştırılamayan gösterim metnidir, düzeltme ise satıra yapılandırılmış alan yazar. */
  city: string;
  precision: AddressGeoPrecision;
  /** Servisin eşleşme güveni (0..1). */
  score: number;
}

export type AddressVerdict =
  /** Kapı istenen kodda bulundu — söylenecek bir şey yok. */
  | { kind: 'confirmed' }
  /** Kapı BAŞKA bir posta kodunda var: müşteriye düzeltme TEKLİF edilir. */
  | { kind: 'wrong_postal_code'; suggestion: AddressCandidate }
  /** Sokak var ama kapı hiçbir yerde bulunamadı — yeni yapı olabilir; yalnız yumuşak uyarı. */
  | { kind: 'street_only' }
  /** Hiçbir eşleşme yok. */
  | { kind: 'not_found' };

/**
 * Teklif eşiği `geocode-provider`ın `MIN_SCORE`undan yüksek: o "bu bir cevap mı", bu "müşterinin ağzına söz koyacak kadar emin
 * miyim" sorusunun eşiği.
 */
const OFFER_MIN_SCORE = 0.8;

/**
 * Bu farktan yakın iki aday ayırt edilemez sayılır ve teklif yapılmaz: denk iki seçenekten birini önermek müşteriyi bizim
 * tahminimizle adresini değiştirmeye davet ederdi.
 */
const AMBIGUOUS_MARGIN = 0.05;

export function addressVerdict(input: {
  /**
   * Posta kodu PİNLENEREK yapılan aramanın inceliği; `null` = o kodda hiç eşleşme yok.
   * `housenumber` ise kapı doğrulanmıştır ve ikinci sorguya hiç çıkılmaz (çağıranın işi).
   */
  matchedPrecision: AddressGeoPrecision | null;
  /** KISITSIZ aramanın adayları. Boş dizi = sorulmuş ve bir şey bulunamamış. */
  elsewhere: readonly AddressCandidate[];
  /** Müşterinin yazdığı posta kodu — adayın "başka kodda" olup olmadığı buna göre söylenir. */
  postalCode: string;
}): AddressVerdict {
  if (input.matchedPrecision === 'housenumber') return { kind: 'confirmed' };

  /* Yalnız KAPI düzeyindeki adaylar teklif edilebilir. Sokak düzeyinde bir aday "adresiniz aslında
     şurada" demeye yetmez — o da bizim elimizdekiyle aynı belirsizliği taşır. */
  const doors = input.elsewhere
    .filter((candidate) => candidate.precision === 'housenumber' && candidate.score >= OFFER_MIN_SCORE)
    .slice()
    .sort((a, b) => b.score - a.score || a.postalCode.localeCompare(b.postalCode));

  const best = doors[0];
  if (best) {
    /* Kapı İSTENEN kodda bulunduysa adres doğrudur: kısıtlı sorgu bulamamış olabilir (sorgu metni,
       yazım), ama servis kapının orada olduğunu söylüyor. Bunu "yanlış kod" diye göstermek
       müşteriye doğru adresini değiştirtmek olurdu. */
    if (normalizePostalCode(best.postalCode) === normalizePostalCode(input.postalCode)) return { kind: 'confirmed' };

    /* AYIRT EDİLEMEZ İKİLİ: aynı kapı iki ayrı kodda neredeyse aynı güvenle. Birini seçmek kura
       atmaktır — teklif yapılmaz, müşteriye yalnız kapının doğrulanamadığı söylenir. */
    const rival = doors.find((candidate) => normalizePostalCode(candidate.postalCode) !== normalizePostalCode(best.postalCode));
    if (rival && best.score - rival.score < AMBIGUOUS_MARGIN) return { kind: 'street_only' };

    return { kind: 'wrong_postal_code', suggestion: best };
  }

  // Kapı hiçbir yerde bulunamadı. Sokak eşleşmesi varsa adres muhtemelen doğru ama kapı bilinmiyor
  // (yeni yapı, `bis/ter` ekleri); hiç eşleşme yoksa söylenecek şey de farklı.
  return input.matchedPrecision === null ? { kind: 'not_found' } : { kind: 'street_only' };
}
