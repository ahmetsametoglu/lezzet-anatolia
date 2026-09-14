/*
  TARİH TUŞ TAKIMININ DEĞERİ — altı rakam, `gg.aa.yy` (kullanıcı kararı 03.09).

  Depocu rampada koliye bakıp tarihi OKUYOR; yazması gereken şey altı rakamdır, üç sütunda
  kaydırılacak bir seçim değil. Değer bir rakam dizisi (`"120927"`), görünüşü maske
  (`12.09.27`), çıkışı ISO (`2027-09-12`). Yıl iki hane: SKT geleceğe bakar, `27` = 2027.
  Bu dosya SAF: React yok, ekran yok — testi de öyle.
*/

/** Bir tarihin rakam sayısı: gün(2) · ay(2) · yıl(2). */
export const DATE_DIGITS = 6;

/** ISO (`2027-09-12`) → rakam dizisi (`120927`); tanınmazsa boş. Açılış değeri için. */
export function dateDigitsFrom(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return '';
  return `${match[3]}${match[2]}${match[1]!.slice(2)}`;
}

/** Rakam ekler; altı rakam dolunca fazlası İŞLEMEZ (tavan tuşta durur — tuş takımının kuralı). */
export function dateDigitsPress(digits: string, key: string): string {
  if (!/^\d$/.test(key) || digits.length >= DATE_DIGITS) return digits;
  return digits + key;
}

export function dateDigitsDelete(digits: string): string {
  return digits.slice(0, -1);
}

/** Görünüş — yazılmamış haneler alt çizgi: `12.0_.__`. Depocu neyin eksik olduğunu görür. */
export function dateMask(digits: string): string {
  const padded = digits.padEnd(DATE_DIGITS, '_');
  return `${padded.slice(0, 2)}.${padded.slice(2, 4)}.${padded.slice(4, 6)}`;
}

/**
 * GEÇMİŞTE Mİ — bugünden önceki gün (kullanıcı kararı 03.09: *"geçmiş tarih girmesi de mantıklı
 * değil"*). Bugün serbest: bugün son günü olan mal bugün satılır. Sınır YEREL takvim günüdür,
 * UTC değil — depocu gece yarısından sonra da kendi gününe göre okur. `now` dışarıdan (test).
 */
export function isPastDate(iso: string, now: Date = new Date()): boolean {
  const pad = (n: number) => String(n).padStart(2, '0');
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  return iso < today;
}

/**
 * Rakamlar → ISO; altı rakam dolmadıysa ya da takvimde yoksa `null` (`31.02.27` gibi). Tarihin
 * gerçekliği `Date`in sessiz normalleştirmesini geri-çevrimle yakalayarak sınanır.
 */
export function dateFromDigits(digits: string): string | null {
  if (digits.length !== DATE_DIGITS) return null;
  const candidate = `20${digits.slice(4, 6)}-${digits.slice(2, 4)}-${digits.slice(0, 2)}`;
  const parsed = new Date(`${candidate}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === candidate ? candidate : null;
}
