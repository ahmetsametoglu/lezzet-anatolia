/*
  DEPO EKRANLARININ BİÇİMLEME KURALLARI — saf, React'siz, testli.

  Ekranlardan AYRI durur çünkü hiçbiri bir görünüm kararı değil: adedin metinden okunması, SKT'nin
  iki yönlü çevrimi ve parti künyesinin yazımı üç ayrı kuraldır ve bir bileşen değişse bile aynı
  kalır. Kurye tarafındaki `courier-format.ts` ile aynı rol; PARA fonksiyonları burada YOKTUR ve
  olmayacak — depo ekranları tutar görmez (v2'nin altın kuralı, sözleşmede de aynen duruyor).
*/

/**
 * GİRDİ METNİ → ADET. `null` = "hiç yazmadım"; `0` = "sıfır yazdım" ve İKİSİ AYRI ŞEYDİR.
 *
 * Ayrım D5'in kuralının kendisi (v2:474): *"0 = geldi ama kayıp; boş = sayılmadı — boş satır kabulü
 * bloklar."* Boşu sıfıra düşürmek, sayılmamış bir satırı "geldi ama kayıp" diye BEYAN etmek olurdu;
 * kaybolan malın kaydı da kimsenin fark etmediği bir yerde doğardı (CLAUDE §1).
 *
 * İşaret kabul edilir çünkü D4'ün adedi işaretlidir; ondalık kabul EDİLMEZ (adet tamdır).
 */
export function parseQty(text: string): number | null {
  const clean = text.replace(/\s/g, '');
  if (clean.length === 0) return null;
  if (!/^-?\d+$/.test(clean)) return null;
  const value = Number(clean);
  return Number.isSafeInteger(value) ? value : null;
}

/** ADET → GİRDİ METNİ. `null` boş dizedir: alan yer tutucusunu (`—`) göstersin. */
export function qtyToText(qty: number | null): string {
  return qty === null ? '' : String(qty);
}

/**
 * `"2026-08-12"` → `"12.08.26"` (v2'nin `fmtD`si birebir). Biçim tanınmazsa **`null`** döner ve
 * çağıran ham dizeyi yazar — uydurma bir tarih, SKT'nin okunduğu ekranda en pahalı yalandır.
 */
export function shortDate(isoDate: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) return null;
  return `${match[3]}.${match[2]}.${match[1]!.slice(2)}`;
}

/**
 * GİRDİ (`"12.08.2026"` · `"12.08.26"` · `"2026-08-12"`) → ISO. Tanınmazsa `null`.
 *
 * Neden elle: cihazda tarih seçici modülü YOK (`@react-native-community/datetimepicker`
 * bağımlılıklarda değil ve eklenmesi dev-client'ın yeniden derlenmesini ister — 21.13 hattının
 * sınırı). Tasarımın `<input type="date">`i bu yüzden metin alanına indi; kural aynı kaldı, SKT
 * zorunlu ve BİÇİMİ doğrulanıyor — geçmeyen tarih kabulü açmaz.
 *
 * Takvim doğrulaması da yapılır (`31.02` kabul edilmez): `Date` normalleştirme yaptığı için
 * geri-çevrim karşılaştırması şart — yoksa 31 Şubat sessizce 3 Mart'a döner ve raftaki etiketle
 * sistemdeki tarih ayrışır.
 */
export function parseDate(text: string): string | null {
  const clean = text.trim();

  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(clean);
  if (iso) return isRealDate(clean) ? clean : null;

  const dotted = /^(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})$/.exec(clean);
  if (!dotted) return null;

  const day = dotted[1]!.padStart(2, '0');
  const month = dotted[2]!.padStart(2, '0');
  const rawYear = dotted[3]!;
  // İki haneli yıl 2000'lerdir: SKT geçmişe değil geleceğe bakar, 26 → 2026.
  const year = rawYear.length === 2 ? `20${rawYear}` : rawYear;

  const candidate = `${year}-${month}-${day}`;
  return isRealDate(candidate) ? candidate : null;
}

/** Takvimde GERÇEKTEN var mı — `Date`in sessiz normalleştirmesini geri-çevrimle yakalar. */
function isRealDate(isoDate: string): boolean {
  const parsed = new Date(`${isoDate}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === isoDate;
}

/**
 * Parti künyesi — "P-0712 · SKT 12.08" (v2:320). Kod yoksa yalnız tarih yazılır; tarih tanınmazsa
 * ham değer geçer (gizlemek, okunamayan bir tarihi yok saymak olurdu).
 */
export function batchLabel(code: string | null, expiryDate: string): string {
  const date = shortDate(expiryDate) ?? expiryDate;
  return code === null || code.length === 0 ? `SKT ${date}` : `${code} · SKT ${date}`;
}

/**
 * Ürün + boy tek satırda — "Fıstıklı Baklava · 1 kg". Boy etiketi TEK BOYLU üründe boş dizedir
 * (sözleşmenin kendi kuralı) ve o zaman ayraç da yazılmaz.
 */
export function productLabel(productName: string, variantLabel: string): string {
  return variantLabel.length === 0 ? productName : `${productName} · ${variantLabel}`;
}
