/**
 * Metin içi VURGU — yasal beyan metinlerinde (içindekiler, saklama) tek biçimlendirme ihtiyacı.
 *
 * Neden bir işaret, neden zengin metin editörü değil: veritabanında HTML tutmak her okumada temizleme
 * (sanitize) yükü doğurur, bir gün atlanırsa XSS açığı olur, AI çeviri etiketleri bozar ve
 * "veri düz metin" kuralımızı kırar. Burada metin DÜZ kalır, yalnız `**…**` işaretini taşır; render
 * eden taraf HTML üretmez, bu fonksiyonun döndürdüğü parçalardan bileşen çizer.
 *
 * Neden otomatik değil: INCO alerjenin **içindekiler listesinde yazıldığı hâlinin** vurgulanmasını
 * ister — "Gluten" değil, "buğday unu". Alerjen etiketiyle eşleştirme bunu üretemez (üstelik saklama
 * metnindeki "tekrar dondurmayın" hiçbir alerjene bağlı değil). Vurgu operatörün bilinçli kararıdır.
 */

/** Vurgu işareti — Markdown'ın kalın gösterimi. Tek `*` seçilmedi: metinlerde dipnot olarak geçebilir. */
const MARK = '**';

/** Metnin bir parçası; `strong` ise vurgulu gösterilir. */
export interface TextSegment {
  text: string;
  strong: boolean;
}

/**
 * Metni vurgulu/vurgusuz parçalara ayırır. Kapanmayan işaret düz metin sayılır (yarım yazılmış bir
 * yıldız çifti beyanı kaybetmemeli — gösterilecek metin her koşulda tam kalır).
 */
export function parseEmphasis(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  let rest = text;

  while (rest.length > 0) {
    const open = rest.indexOf(MARK);
    if (open === -1) break;
    const close = rest.indexOf(MARK, open + MARK.length);
    if (close === -1) break; // kapanmadı → kalanı düz metin

    if (open > 0) segments.push({ text: rest.slice(0, open), strong: false });
    const inner = rest.slice(open + MARK.length, close);
    // Boş işaret çifti (`****`) hiçbir şey vurgulamaz; parça üretmeyip atlıyoruz.
    if (inner.length > 0) segments.push({ text: inner, strong: true });
    rest = rest.slice(close + MARK.length);
  }

  if (rest.length > 0) segments.push({ text: rest, strong: false });
  return segments;
}

/**
 * **Çok satırlı metni maddelere böler: satır = madde** (05.16 · `KARARLAR §3z`).
 *
 * Tarif adımları ve "Evinizden" listesi tek bir metin alanında duruyor — madde başına ayrı satır
 * bileşeni YAZILMADI, çünkü üç dilin madde sayısı eşit olmak zorunda kalırdı (Fransızca iki adımı
 * birleştirmek isteyebilir). Metni maddeye çeviren kural bu yüzden GÖSTERİM tarafındadır.
 *
 * Boş satır ATILIR: operatör iki madde arasına nefes bırakabilir ve o boşluk numaralı bir adım
 * olarak görünmemeli. `\r\n` de bölünür — Windows'tan yapıştırılan metin tek satır sayılmasın.
 *
 * **Burada, çünkü İKİ yüzey birden okuyor** (`CLAUDE §1`): operasyonun tarif önizlemesi ve müşteri
 * yüzeyinin tarif detayı. İki kopya bir gün ayrışırsa operatörün önizlemede saydığı adım sayısı ile
 * müşterinin gördüğü tutmazdı — üstelik kimse fark etmezdi.
 */
export function splitLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/** Vurgu işaretlerini söker — arama, özet ve paylaşım (OG) açıklaması ham metni ister. */
export function stripEmphasis(text: string): string {
  return parseEmphasis(text)
    .map((s) => s.text)
    .join('');
}

/** Metinde en az bir vurgu var mı (form "beyan tam mı" göstergesi için). */
export function hasEmphasis(text: string): boolean {
  return parseEmphasis(text).some((s) => s.strong);
}

/**
 * Seçili aralığı vurgulu yapar / vurgusu varsa kaldırır — formdaki "B" düğmesinin tek mantığı.
 * Yeni imleç konumunu da döner ki düğmeye basınca seçim kaymasın.
 *
 * Seçim boşsa metin değişmez: neyin vurgulanacağı belirsizken kullanıcıya boş işaret bırakmayız.
 */
export function toggleEmphasis(text: string, start: number, end: number): { text: string; start: number; end: number } {
  if (start >= end) return { text, start, end };

  const before = text.slice(0, start);
  const selected = text.slice(start, end);
  const after = text.slice(end);

  // Zaten sarılıysa (seçim işaretlerin İÇİ) kaldır — aynı düğme iki yönlü çalışsın.
  if (before.endsWith(MARK) && after.startsWith(MARK)) {
    const trimmed = before.slice(0, -MARK.length);
    return { text: trimmed + selected + after.slice(MARK.length), start: trimmed.length, end: trimmed.length + selected.length };
  }

  const wrapped = `${MARK}${selected}${MARK}`;
  return { text: before + wrapped + after, start: start + MARK.length, end: end + MARK.length };
}
