/*
  BAN kapı numarasını yalnız sokak adından önce yazılınca tanıyor: "rue du Maréchal Foch 192c" sıfır sonuç, "192c rue du
  Maréchal Foch" gerçek kapıyı döndürüyor. Müşteri numarayı sonda da yazdığı için ikinci soru numara başa alınarak sorulur.
*/

/** Numaranın ayrı yazılmış eki: "12 bis", "12 B". */
const SUFFIX = /^(?:bis|ter|quater|[a-z])$/i;
/** Kapı numarası, eki bitişik ya da eksiz: "12", "192c", "12bis"; beş hane posta kodudur. */
const NUMBER = /^\d{1,4}(?:bis|ter|quater|[a-z])?$/i;
const POSTAL = /^\d{5}$/;

/**
 * Sondaki numarası başa alınmış sorgu; sonda numara yoksa ya da metin zaten numarayla başlıyorsa `null`.
 * Sondaki posta kodu yerinde kalır, numaradan önceki virgül düşer.
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
