/*
  TUŞ TAKIMININ SAF KURALI (Operasyon Mobil v3 · `00-ortak`) — React'siz, testli.

  Ekrandan AYRI durur çünkü hiçbiri bir görünüm kararı değil: "ilk rakam mevcut tutarın yerine
  yazılır", "virgülden sonra en fazla iki hane", "silme neyi siler" — üçü de para yazma kuralıdır
  ve tuşların nasıl çizildiğinden bağımsızdır.

  ── DEĞER METİNDİR, SAYI DEĞİL ──────────────────────────────────────────────
  Kullanıcı "42," yazdığı anda henüz geçerli bir sayı yoktur ama ekranda görünmesi gerekir; sayıya
  çevirmek girişin yarısını yutardı ("42,0" ile "42," aynı sayıdır, aynı EKRAN değil). Çevrim tek
  yerde ve en sonda yapılır (`parseAmountToCents`).
*/

/** Tuş takımının o anki hâli. */
export interface KeypadValue {
  /** Ekranda yazan metin — `"42,50"`. Boşsa `"0"` gösterilir, ama metin boş kalır. */
  text: string;
  /**
   * **İlk dokunuş mevcut tutarı EZER** (v3'ün kendi cümlesi: *"ilk rakam mevcut tutarın yerine
   * yazılır"*). Sebebi kapıda: alan motorun önerdiği tutarla dolu gelir ve kurye çoğu zaman onu
   * DEĞİŞTİRMEK ister, uzatmak değil — "60,00" üstüne 5 basınca "60,005" olsaydı her düzeltme
   * önce dört silme tuşu isterdi.
   */
  fresh: boolean;
}

/** Alanın açılış hâli: dolu gelir ama ilk rakam onu ezer. */
export function keypadFrom(text: string): KeypadValue {
  return { text, fresh: true };
}

const MAX_DECIMALS = 2;

/**
 * Bir tuşa basıldı. `key`: `"0".."9"` · `"00"` · `","`.
 *
 * Kurallar tek yerde: ilk dokunuş ezer · ikinci virgül yok · virgülden sonra iki hane · baştaki
 * sıfır ikinci rakamla düşer ("05" değil "5"). Tanınmayan tuş hâli DEĞİŞTİRMEZ — sessizce bir
 * şey uydurmaktansa hiçbir şey yapmamak doğrudur.
 */
export function keypadPress(value: KeypadValue, key: string): KeypadValue {
  if (key !== ',' && !/^\d{1,2}$/.test(key)) return value;

  if (value.fresh) {
    // Virgülle başlamak "0," demektir: kullanıcı kuruş yazmaya başlıyor.
    return { text: key === ',' ? '0,' : stripLeadingZero(key), fresh: false };
  }

  if (key === ',') return value.text.includes(',') ? value : { ...value, text: `${value.text},` };

  const [whole, decimals] = value.text.split(',');
  if (decimals === undefined) {
    return { ...value, text: stripLeadingZero(`${whole ?? ''}${key}`) };
  }
  const room = MAX_DECIMALS - decimals.length;
  if (room <= 0) return value;
  return { ...value, text: `${whole ?? ''},${decimals}${key.slice(0, room)}` };
}

/** Silme: son karakteri atar. Metin bitince hâl "taze"ye DÖNMEZ — kullanıcı bilerek boşalttı. */
export function keypadDelete(value: KeypadValue): KeypadValue {
  return { text: value.text.slice(0, -1), fresh: false };
}

/** "Beklenen" çipine basıldı: alan o tutarla dolar ve ARTIK taze değildir (kullanıcı seçti). */
export function keypadFill(text: string): KeypadValue {
  return { text, fresh: false };
}

/** Ekranda yazan metin — boş hâlde "0" görünür ki alan ölü bir kutu gibi durmasın. */
export function keypadDisplay(value: KeypadValue): string {
  return value.text.length === 0 ? '0' : value.text;
}

/* "05" → "5", ama "0," dokunulmaz ve tek başına "0" da meşrudur (bedelsiz teslim). */
function stripLeadingZero(text: string): string {
  return /^0\d/.test(text) ? text.slice(1) : text;
}
