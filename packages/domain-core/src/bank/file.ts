import type { RawBankRow } from '@lezzet/types';

/**
 * Banka DOSYASININ okunması (12.10) — hücre ızgarasından satır sözlüğüne, saf.
 *
 * Dosya iki biçimde gelir: CSV (metin; ayırıcı `;` — Fransız bankaları —, `,` ya da sekme) ve xlsx
 * (tarayıcıda `read-excel-file` hücre ızgarasını verir). İkisi de AYNI kapıdan geçer
 * (`sheetToRows`): başlık satırı bulunur, hücreler metne indirilir, satırlar `RawBankRow` olur.
 * Sütun tanıma (`column-mapping`) ve satır okuma (`parse`) buradan sonra başlar — onlar hücrenin
 * ne anlama geldiğini çözer, burası yalnız hücreyi bulur.
 *
 * Gerçek ekstreler tertemiz tablo DEĞİLDİR: başlıktan önce "Compte : FR76…" gibi künye satırları,
 * boş satırlar, sonda bir toplam satırı olur. Başlık satırı bu yüzden ARANIR, ilk satır sayılmaz.
 */

export type SheetCell = string | number | boolean | Date | null | undefined;

export interface SheetRows {
  headers: string[];
  rows: RawBankRow[];
  /** Başlık satırının ızgaradaki sırası (0 tabanlı); `-1` = başlık bulunamadı, dosya okunamaz. */
  headerRowIndex: number;
  /** Başlıktan sonra tamamen boş olduğu için atlanan satır sayısı. */
  blankRows: number;
}

/** Başlık satırı en az bu kadar dolu hücre taşır: "Tarih · Açıklama · Tutar" üçtür, künye satırı çoğu zaman ikidir. */
const MIN_HEADER_CELLS = 3;

const DATE_LIKE = /^\s*\d{1,4}[/.-]\d{1,2}[/.-]\d{1,4}\s*$/;
const MONEY_LIKE = /^\s*[(-]?\s*[\d\s. ]*\d(?:[.,]\d{1,2})?\s*\)?\s*(?:€|eur)?\s*$/i;

/**
 * Hücre → metin. Sayı ondalık NOKTALI yazılır (JS'nin kendi biçimi), tarih ISO gün olarak — okuyucu
 * (`parse`) ikisini de tanır ve sütun tanıyıcı ayırıcıyı örnekten çıkarır. Tarih YEREL takvim
 * günüyle yazılır: xlsx okuyucusu hücreyi gece yarısı Date'i olarak verir; UTC'ye çevirmek Paris'te
 * bir gün geriye kaydırabilirdi.
 */
export function cellText(cell: SheetCell): string {
  if (cell === null || cell === undefined) return '';
  if (cell instanceof Date) {
    if (Number.isNaN(cell.getTime())) return '';
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${cell.getFullYear()}-${pad(cell.getMonth() + 1)}-${pad(cell.getDate())}`;
  }
  if (typeof cell === 'number') return Number.isFinite(cell) ? String(cell) : '';
  if (typeof cell === 'boolean') return cell ? 'true' : 'false';
  return cell.trim();
}

function filledCount(row: readonly SheetCell[]): number {
  return row.filter((cell) => cellText(cell) !== '').length;
}

/** Başlık hücresi METİNDİR: tarih ya da para gibi görünen hücre başlık değil, künye ya da veridir. */
function looksLikeHeaderRow(row: readonly SheetCell[]): boolean {
  const filled = row.map(cellText).filter((text) => text !== '');
  return filled.length >= MIN_HEADER_CELLS && filled.every((text) => !DATE_LIKE.test(text) && !MONEY_LIKE.test(text));
}

/**
 * Başlık satırı: hücreleri metin olan, en az üç dolu hücreli ve ardından en az bir veri satırı
 * (iki dolu hücre) gelen İLK satır. "Compte;FR76…;Solde;1 234,56" gibi bir künye satırı para
 * taşıdığı için elenir; boş satırlar atlanır.
 */
export function findHeaderRow(matrix: readonly (readonly SheetCell[])[]): number {
  for (let i = 0; i < matrix.length; i += 1) {
    if (!looksLikeHeaderRow(matrix[i]!)) continue;
    if (matrix.slice(i + 1).some((row) => filledCount(row) >= 2)) return i;
  }
  return -1;
}

/** Başlıklar tekilleştirilir ve boş olan adlandırılır — eşleme BAŞLIKLA tutulduğu için ikisi de şart. */
function normalizeHeaders(cells: readonly SheetCell[]): string[] {
  const seen = new Map<string, number>();
  return cells.map((cell, index) => {
    const base = cellText(cell) || `Sütun ${index + 1}`;
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    return count === 1 ? base : `${base} (${count})`;
  });
}

/**
 * Hücre ızgarası → satır sözlükleri. Başlık bulunamazsa boş döner (`headerRowIndex: -1`); ekran
 * bunu "dosyada başlık satırı bulunamadı" diye söyler, sessizce sıfır satır yazmaz.
 */
export function sheetToRows(matrix: readonly (readonly SheetCell[])[]): SheetRows {
  const headerRowIndex = findHeaderRow(matrix);
  if (headerRowIndex < 0) return { headers: [], rows: [], headerRowIndex, blankRows: 0 };

  const headers = normalizeHeaders(matrix[headerRowIndex]!);
  const rows: RawBankRow[] = [];
  let blankRows = 0;
  for (const row of matrix.slice(headerRowIndex + 1)) {
    if (filledCount(row) === 0) {
      blankRows += 1;
      continue;
    }
    const record: RawBankRow = {};
    headers.forEach((header, index) => {
      record[header] = cellText(row[index]);
    });
    rows.push(record);
  }
  return { headers, rows, headerRowIndex, blankRows };
}

type Delimiter = ';' | ',' | '\t';

/** Alıntı dışında en çok geçen ayırıcı; beraberlikte `;` — dosyalar Fransa'dan geliyor. */
function detectDelimiter(text: string): Delimiter {
  const counts: Record<Delimiter, number> = { ';': 0, ',': 0, '\t': 0 };
  let inQuotes = false;
  for (const char of text.slice(0, 20_000)) {
    if (char === '"') inQuotes = !inQuotes;
    else if (!inQuotes && (char === ';' || char === ',' || char === '\t')) counts[char] += 1;
  }
  return (['\t', ',', ';'] as const).reduce<Delimiter>((best, candidate) => (counts[candidate] > counts[best] ? candidate : best), ';');
}

/**
 * CSV → hücre ızgarası (RFC 4180'in bankaların uyduğu kadarı): ayırıcı otomatik, alıntı içinde
 * ayırıcı ve satır sonu serbest, `""` bir tırnak, BOM atılır, tamamen boş satır düşer. Satır
 * sonu `\n` ya da `\r\n`.
 */
export function parseCsv(text: string): string[][] {
  const clean = text.replace(/^\uFEFF/, '');
  const delimiter = detectDelimiter(clean);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  const endField = () => {
    row.push(field);
    field = '';
  };
  const endRow = () => {
    endField();
    if (row.some((cell) => cell.trim() !== '')) rows.push(row);
    row = [];
  };

  for (let i = 0; i < clean.length; i += 1) {
    const char = clean[i]!;
    if (inQuotes) {
      if (char === '"') {
        if (clean[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') inQuotes = true;
    else if (char === delimiter) endField();
    else if (char === '\n') endRow();
    else if (char === '\r') {
      if (clean[i + 1] !== '\n') endRow();
    } else field += char;
  }
  if (field !== '' || row.length > 0) endRow();
  return rows;
}

/**
 * Bayt → metin: önce katı UTF-8, bozuksa Windows-1252. Fransız bankaları hâlâ Latin-1 dışa
 * aktarıyor; UTF-8 diye okunan "Libellé" "Libell�" olur ve sütun tanıyıcı adı tanımaz.
 */
export function decodeTextBytes(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    // Katı UTF-8 reddetti: dosya tek baytlı kodlamada. Sessiz değil, bilinçli düşüş.
    return new TextDecoder('windows-1252').decode(bytes);
  }
}
