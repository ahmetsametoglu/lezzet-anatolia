/*
  SONDA YAZILMIŞ KAPI NUMARASI BAŞA ALINIR (14.09) — BAN numarayı yalnız sokak adından ÖNCE tanıyor.

  Ölçüldü (14.09, servise `type=housenumber` ile): "rue du Maréchal Foch 192c" 0 sonuç, harfsiz
  "… 192" de 0, "rue des Orfèvres 12" 0; "192c rue du Maréchal Foch" yalnız gerçek kapıyı (67380
  Lingolsheim), "12 rue des Orfèvres" beş kapıyı döndürüyor. Süzgeçsiz sorguda da kapı gelmiyordu —
  yalnız aynı adlı sokaklar. Fransız yazımında numara başta gelir; Almanca ("Hauptstraße 12") ve
  Türkçe alışkanlıkta sonda, ve müşteri ikisini de yazar.
*/

/** Numaranın ayrı yazılmış eki: "12 bis", "12 B". */
const SUFFIX = /^(?:bis|ter|quater|[a-z])$/i;
/** Kapı numarası, eki bitişik ya da eksiz: "12", "192c", "12bis". Beş hane posta kodudur, numara değil. */
const NUMBER = /^\d{1,4}(?:bis|ter|quater|[a-z])?$/i;
const POSTAL = /^\d{5}$/;

/**
 * Sondaki numarayı başa alınmış sorgu; sonda numara yoksa ya da metin zaten numarayla başlıyorsa
 * `null` — ikinci soruya gerek yok. Sondaki posta kodu yerinde kalır ("rue X 12 67000" → "12 rue X
 * 67000"), numaradan önceki virgül düşer ("rue X, 12").
 */
export function houseNumberFirst(query: string): string | null {
  const words = query
    .trim()
    .split(/\s+/)
    .map((word) => word.replace(/,$/, ''))
    .filter(Boolean);
  const postal = words.length > 1 && POSTAL.test(words[words.length - 1] ?? '') ? words.pop() : undefined;

  const last = words[words.length - 1];
  const beforeLast = words[words.length - 2];
  let number: string | null = null;
  if (last !== undefined && NUMBER.test(last)) {
    number = last;
    words.pop();
  } else if (last !== undefined && beforeLast !== undefined && SUFFIX.test(last) && /^\d{1,4}$/.test(beforeLast)) {
    number = `${beforeLast} ${last}`;
    words.splice(-2, 2);
  }

  if (number === null || words.length === 0 || /^\d/.test(words[0] ?? '')) return null;
  return [number, ...words, ...(postal === undefined ? [] : [postal])].join(' ');
}
