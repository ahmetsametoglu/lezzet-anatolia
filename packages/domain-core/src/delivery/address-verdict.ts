import type { AddressGeoPrecision } from '@lezzet/types';

/**
 * **"Bu kapı var mı" sorusunun SAF cevabı** (11.11) — servis ne dediyse ondan çıkan karar.
 *
 * ── NEDEN AYRI BİR KARAR, NEDEN `precision` YETMİYOR ────────────────────────
 * `geo_precision` tek başına *"kapıyı doğrulayamadım"* diyor ama **neden**ini söylemiyor, ve iki
 * bambaşka hâl aynı değere düşüyor:
 *   · kapı hiçbir yerde yok — muhtemelen YENİ YAPI, adres doğru olabilir
 *   · kapı VAR ama BAŞKA posta kodunda — neredeyse kesin YAZIM HATASI
 * Birincisinde müşteriye söylenecek tek şey bir belirsizliktir; ikincisinde elimizde **doğrusu**
 * vardır ve tek tıkla düzeltilebilir. Aynı değerle gösterilirlerse müşteri geçerli bir yeni bina
 * adresini hata sanar, ya da gerçek hatayı belirsizlik sanıp geçer.
 *
 * ── ÖLÇÜLMÜŞ VAKA (kullanıcı bulgusu 01.09) ────────────────────────────────
 * `192c Rue du Maréchal Foch` iki siparişte aynı yazılmıştı:
 *   · `67380 Lingolsheim` → kapı bulundu (BAN skoru **0,973**) — GERÇEK
 *   · `67000 Strasbourg`  → yalnız aynı adlı SOKAK (0,717) — kapı YOK, 7,2 km ötede
 * Kodu pinleyen tek bir sorgu bunu göremez: BAN'a *"67000 içinde bul"* dediğimiz sürece
 * Lingolsheim'ı hiç duymayız. Kararın girdisi bu yüzden İKİ sorgudur — kısıtlı ve kısıtsız.
 *
 * Karar burada saf ve DB'siz; hangi servise sorulduğu (BAN, Google) çağıranın bilgisi.
 */

/** Kısıtsız aramadan dönen bir aday — hangi kodda, hangi incelikte, ne güvenle. */
export interface AddressCandidate {
  /** Servisin verdiği tam etiket — düzeltme teklifinin metni bu olur. */
  label: string;
  postalCode: string;
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
 * Düzeltme TEKLİF etmek için gereken asgari güven.
 *
 * Eşik `geocode-provider`ın `MIN_SCORE`undan (0,4) YÜKSEK ve bilerek: o eşik *"bu bir cevap mı"*
 * sorusunun, bu ise *"müşterinin ağzına söz koyacak kadar emin miyim"* sorusunun eşiği. Zayıf bir
 * eşleşmeyle *"şunu mu demek istediniz"* demek, doğru yazılmış bir adresi yanlışmış gibi gösterir.
 * Ölçülen vakada doğru cevap 0,973 ile rahatça geçiyor.
 */
const OFFER_MIN_SCORE = 0.8;

/**
 * İki aday bu farktan yakınsa AYIRT EDİLEMEZ sayılır ve teklif YAPILMAZ.
 *
 * Motorun `indistinguishable` reddiyle aynı disiplin (`route-order.ts`): birbirine denk iki
 * seçenekten birini seçmek bir hesap değil, bir kura. Aynı kapı iki ayrı kodda benzer güvenle
 * bulunuyorsa doğru cevap "hangisi olduğunu bilmiyorum"dur — müşteriye rastgele birini önermek,
 * onu bizim tahminimize göre adresini değiştirmeye davet ederdi.
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
    if (norm(best.postalCode) === norm(input.postalCode)) return { kind: 'confirmed' };

    /* AYIRT EDİLEMEZ İKİLİ: aynı kapı iki ayrı kodda neredeyse aynı güvenle. Birini seçmek kura
       atmaktır — teklif yapılmaz, müşteriye yalnız kapının doğrulanamadığı söylenir. */
    const rival = doors.find((candidate) => norm(candidate.postalCode) !== norm(best.postalCode));
    if (rival && best.score - rival.score < AMBIGUOUS_MARGIN) return { kind: 'street_only' };

    return { kind: 'wrong_postal_code', suggestion: best };
  }

  // Kapı hiçbir yerde bulunamadı. Sokak eşleşmesi varsa adres muhtemelen doğru ama kapı bilinmiyor
  // (yeni yapı, `bis/ter` ekleri); hiç eşleşme yoksa söylenecek şey de farklı.
  return input.matchedPrecision === null ? { kind: 'not_found' } : { kind: 'street_only' };
}

/** Posta kodu karşılaştırması boşluk ve büyük harfe duyarsız — kaynaklar farklı yazabiliyor. */
const norm = (code: string) => code.replace(/\s+/g, '').toUpperCase();
