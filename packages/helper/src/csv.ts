/**
 * CSV yazımı — saf, alansız, domain'siz. Muhasebe export'u (12.7) ve ileride segment/analitik
 * export'ları aynı yazıcıyı kullanır.
 *
 * **Ayraç varsayılanı `;`** — dosyayı Fransa'da açan Excel virgülü ondalık ayırıcı sayar ve `,`
 * ayraçlı dosyayı tek sütuna yığar. Sayılar noktalı yazılır (makine okuyacak), ayraç noktalı
 * virgüldür (insan Excel'de açacak); ikisi çakışmaz.
 */

export interface CsvOptions {
  separator?: string;
  /** Başlık satırı yazılsın mı — bazı muhasebe yazılımları başlıksız dosya bekler. */
  header?: boolean;
}

/**
 * Bir hücreyi CSV'ye güvenli çevirir. Tırnak/ayraç/satır sonu içeren değer tırnaklanır, içindeki
 * tırnak ikilenir (RFC 4180). Kaçırılan tek bir `;` dosyanın o satırdan sonrasını kaydırır.
 *
 * `null`/`undefined` BOŞ hücredir, "null" metni değil: muhasebe yazılımı onu değer sanırdı.
 */
function escapeCell(value: unknown, separator: string): string {
  if (value === null || value === undefined) return '';
  const text = typeof value === 'boolean' ? (value ? 'true' : 'false') : String(value);
  return /["\r\n]/.test(text) || text.includes(separator) ? `"${text.replaceAll('"', '""')}"` : text;
}

/**
 * Satırları CSV'ye çevirir. Sütunlar AÇIKÇA verilir: nesne anahtarlarından türetseydik sütun sırası
 * satırdan satıra değişebilir, alan eklenince dosyanın biçimi habersiz kayardı.
 */
export function toCsv<T extends Record<string, unknown>>(
  rows: readonly T[],
  columns: ReadonlyArray<{ key: keyof T & string; label?: string }>,
  options: CsvOptions = {},
): string {
  const separator = options.separator ?? ';';
  const lines: string[] = [];

  if (options.header !== false) {
    lines.push(columns.map((c) => escapeCell(c.label ?? c.key, separator)).join(separator));
  }
  for (const row of rows) {
    lines.push(columns.map((c) => escapeCell(row[c.key], separator)).join(separator));
  }
  // Sondaki satır sonu kasıtlı: satır-tabanlı okuyucular son satırı yarım görmesin.
  return `${lines.join('\n')}\n`;
}
