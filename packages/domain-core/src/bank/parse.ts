import type { BankAmountMode, BankColumnMapping, RawBankRow } from '@lezzet/types';

/**
 * Banka satırının okunması (12.4) — saf çeviri: dosyanın hücreleri → anlamlı alanlar.
 *
 * Burada YAZIM YOK, karar da yok; yalnız "1.234,56 €" gibi bir hücrenin ne demek olduğu çözülür.
 * Çözülemeyen satır sessizce atlanmaz, **sebebiyle** döner: sessiz atlama, ekstrenin bir kısmının
 * kaybolduğunu kimseye söylemezdi.
 */

export interface ParseProfile {
  amountMode: BankAmountMode;
  mapping: BankColumnMapping;
  decimalSeparator: ',' | '.';
  dateFormat: 'dmy' | 'ymd' | 'mdy';
}

export interface ParsedRow {
  valueDate: string;
  /** Her zaman POZİTİF; işaret `direction`'da (12.1'in kuralı: işaret tutara gömülmez). */
  amount: number;
  direction: 'in' | 'out';
  label: string;
  reference: string | null;
}

export type RowParseFailure = { rowIndex: number; reason: 'bad_date' | 'bad_amount' | 'zero_amount' | 'missing_column' };

export interface ParseResult {
  rows: ParsedRow[];
  /** Okunamayan satırlar — sayısı ekranda gösterilir, dosya sessizce eksik alınmaz. */
  failures: RowParseFailure[];
}

/**
 * Para hücresi → cent. Binlik ayırıcı, para birimi simgesi ve **muhasebe parantezi** `(120,00)`
 * temizlenir; parantez eksi demektir (bazı dışa aktarımlar eksiyi böyle yazar ve düz parse onu
 * ARTI okur — tam ters işaretli bir hareket).
 */
export function parseAmountCents(raw: string, decimalSeparator: ',' | '.'): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const parenthesised = /^\(.*\)$/.test(trimmed);
  let s = trimmed.replace(/[()€$\s ]|eur/gi, '');
  const negative = parenthesised || s.startsWith('-');
  s = s.replace(/^[+-]/, '');

  // Binlik ayırıcıyı at, ondalığı noktaya çevir.
  s = decimalSeparator === ',' ? s.replaceAll('.', '').replace(',', '.') : s.replaceAll(',', '');
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;

  const cents = Math.round(Number(s) * 100);
  return negative ? -cents : cents;
}

/** Tarih hücresi → `YYYY-MM-DD`. Düzen profilden gelir; tahmin BURADA yapılmaz. */
export function parseDate(raw: string, format: 'dmy' | 'ymd' | 'mdy'): string | null {
  const m = /^\s*(\d{1,4})[/.-](\d{1,2})[/.-](\d{1,4})\s*$/.exec(raw);
  if (!m) return null;

  const [a, b, c] = [m[1]!, m[2]!, m[3]!];
  const [day, month, year] = format === 'ymd' ? [c, b, a] : format === 'mdy' ? [b, a, c] : [a, b, c];

  const y = year.length === 2 ? `20${year}` : year.padStart(4, '0');
  const d = Number(day);
  const mo = Number(month);
  if (d < 1 || d > 31 || mo < 1 || mo > 12) return null;

  const iso = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  // Ay taşması (31 Şubat) sessizce 3 Mart'a kaymasın: Date'in normalizasyonu kabul edilmez.
  const parsed = new Date(`${iso}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) || parsed.getUTCDate() !== d ? null : iso;
}

/** Dosyanın satırlarını profile göre okur. */
export function parseBankRows(raw: readonly RawBankRow[], profile: ParseProfile): ParseResult {
  const rows: ParsedRow[] = [];
  const failures: RowParseFailure[] = [];
  const { mapping } = profile;

  raw.forEach((row, rowIndex) => {
    const rawDate = row[mapping.date];
    const rawLabel = row[mapping.label];
    if (rawDate === undefined || rawLabel === undefined) {
      failures.push({ rowIndex, reason: 'missing_column' });
      return;
    }

    const valueDate = parseDate(rawDate, profile.dateFormat);
    if (!valueDate) {
      failures.push({ rowIndex, reason: 'bad_date' });
      return;
    }

    let cents: number | null;
    if (profile.amountMode === 'signed') {
      cents = mapping.amount ? parseAmountCents(row[mapping.amount] ?? '', profile.decimalSeparator) : null;
    } else {
      // İki sütunlu gelenek: dolu olan hangisiyse yön odur. Borç sütunu POZİTİF yazılır, eksi
      // anlamını sütunun kendisi taşır — o yüzden mutlak değeri alınır.
      const debitCents = mapping.debit ? parseAmountCents(row[mapping.debit] ?? '', profile.decimalSeparator) : null;
      const creditCents = mapping.credit ? parseAmountCents(row[mapping.credit] ?? '', profile.decimalSeparator) : null;
      cents = debitCents ? -Math.abs(debitCents) : creditCents ? Math.abs(creditCents) : null;
    }

    if (cents === null) {
      failures.push({ rowIndex, reason: 'bad_amount' });
      return;
    }
    if (cents === 0) {
      // Sıfır tutarlı satır bilgi taşımaz ve veritabanı kısıtı da reddeder (12.1) — burada,
      // sebebi belliyken elenir; yazımda anlaşılmaz bir kısıt hatası olarak patlamasın.
      failures.push({ rowIndex, reason: 'zero_amount' });
      return;
    }

    rows.push({
      valueDate,
      amount: Math.abs(cents) / 100,
      direction: cents > 0 ? 'in' : 'out',
      label: rawLabel.trim(),
      reference: mapping.reference ? (row[mapping.reference] ?? '').trim() || null : null,
    });
  });

  return { rows, failures };
}
