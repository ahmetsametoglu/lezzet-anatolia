import type { BankAmountMode, BankColumnMapping } from '@lezzet/types';

/**
 * Sütun tanıma (12.4) — "hangi sütun hangi alan?" sorusunun cevabı.
 *
 * **Bu bir PORT'tur.** Bugün sezgisel bir uygulama dolduruyor; yarın yapay zekâ aynı imzayı
 * dolduracak (`packages/ai` bugün çeviri taşıyor — sütun-eşleme ucu oraya eklenir, İKİNCİ bir AI
 * paketi açılmaz). Kural şu: girdi dosyanın küçük bir örneğidir (başlıklar +
 * birkaç satır), çıktı eşlemedir. Çağıran taraf hangisinin cevapladığını BİLMEZ — o yüzden gerçek
 * çağrı geldiğinde değişen tek şey bu dosyadaki uygulamadır.
 *
 * **Cevap her hâlükârda ONAYA düşer.** Yanlış eşlenen bir sütun (ör. bakiye ↔ tutar) bütün ekstreyi
 * çöpe çevirir; ne sezgisel kural ne yapay zekâ bunu tek başına üstlenebilir.
 */

/** Yapay zekâya (bugün sezgisele) verilen örnek: bir sütunun başlığı ve ilk birkaç değeri. */
export interface ColumnSample {
  header: string;
  values: string[];
}

export interface MappingSuggestion {
  amountMode: BankAmountMode;
  mapping: BankColumnMapping;
  decimalSeparator: ',' | '.';
  dateFormat: 'dmy' | 'ymd' | 'mdy';
  /** Alan başına 0–1 güven. Düşük güven ekranda işaretlenir — operatör oraya bakar. */
  confidence: Record<keyof BankColumnMapping, number>;
  /** Hiçbir sütuna oturmayan zorunlu alanlar; boşsa şablon kullanılabilir. */
  missing: Array<'date' | 'label' | 'amount'>;
}

/** Sütun tanıyıcının sözleşmesi — sezgisel ya da yapay zekâ, çağıran ayırt etmez. */
export type ColumnMapper = (samples: readonly ColumnSample[]) => MappingSuggestion;

// Başlık ipuçları — Fransız bankaları öncelikli (FR/DE/EN/TR). Türkçe karşılıklar da var, çünkü
// operatörün elle düzenlediği dosyalar geliyor.
const HEADER_HINTS = {
  date: ['date', 'datum', 'valeur', 'value date', 'operation', 'opération', 'tarih', 'islem tarihi'],
  label: ['libell', 'label', 'description', 'objet', 'verwendungszweck', 'buchungstext', 'aciklama', 'açıklama', 'detay'],
  amount: ['montant', 'amount', 'betrag', 'tutar', 'somme'],
  debit: ['débit', 'debit', 'soll', 'borc', 'borç', 'cikis', 'çıkış'],
  credit: ['crédit', 'credit', 'haben', 'alacak', 'giris', 'giriş'],
  reference: ['référence', 'reference', 'ref', 'referenz', 'referans', 'numero', 'numéro'],
  balance: ['solde', 'balance', 'saldo', 'bakiye'],
} as const;

type MappedField = keyof typeof HEADER_HINTS;

/** Aksan ve büyük/küçük farkını sil — "Débit" ile "debit" aynı sütundur. */
function normalize(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function hintScore(header: string, hints: readonly string[]): number {
  const normalized = normalize(header);
  for (const hint of hints) {
    const target = normalize(hint);
    if (normalized === target) return 1;
    if (normalized.includes(target)) return 0.8;
  }
  return 0;
}

const DATE_PATTERN = /^\s*(\d{1,4})[/.-](\d{1,2})[/.-](\d{1,4})\s*$/;
/** Para değeri: `1 234,56` · `-45.90` · `1.234,56 €` · `(120,00)` (muhasebe eksisi). */
const MONEY_PATTERN = /^\s*[(-]?\s*[\d\s. ]*\d(?:[.,]\d{1,2})?\s*\)?\s*(?:€|eur)?\s*$/i;

/** Değerlerin kaçta kaçı tarih görünüyor. */
function dateRatio(values: readonly string[]): number {
  const filled = values.filter((v) => v.trim());
  if (!filled.length) return 0;
  return filled.filter((v) => DATE_PATTERN.test(v)).length / filled.length;
}

/** Değerlerin kaçta kaçı para görünüyor. */
function moneyRatio(values: readonly string[]): number {
  const filled = values.filter((v) => v.trim());
  if (!filled.length) return 0;
  return filled.filter((v) => MONEY_PATTERN.test(v)).length / filled.length;
}

/** İşaretli sütun mu — negatif değer taşıyorsa borç/alacak ayrımı yok demektir. */
function hasSignedValues(values: readonly string[]): boolean {
  return values.some((v) => /^\s*[(-]/.test(v));
}

/**
 * **Sezgisel sütun tanıyıcı** — yapay zekâ entegrasyonu gelene kadarki uygulama.
 *
 * İki kanıt birleştirilir: başlığın adı ve **değerlerin biçimi.** Yalnız başlığa baksaydık
 * başlıksız/beklenmedik dilde bir dosyada çuvallardı; yalnız biçime baksaydık tarih ile referans
 * numarasını ya da tutar ile bakiyeyi ayırt edemezdi. İkisi birlikte, yanlış olduğunda da
 * **güveni düşük** çıkar — operatör tam oraya bakar.
 */
export const heuristicColumnMapper: ColumnMapper = (samples) => {
  const confidence: Record<string, number> = {};
  const taken = new Set<string>();

  const bestFor = (
    field: MappedField,
    shapeScore: (sample: ColumnSample) => number,
  ): { header: string | null; score: number } => {
    let best: { header: string | null; score: number } = { header: null, score: 0 };
    for (const sample of samples) {
      if (taken.has(sample.header)) continue;
      const score = 0.6 * hintScore(sample.header, HEADER_HINTS[field]) + 0.4 * shapeScore(sample);
      if (score > best.score) best = { header: sample.header, score };
    }
    return best;
  };

  /**
   * Bir alana sütun atar. **`minScore` şart:** yeterli kanıt yoksa sütun TÜKETİLMEZ — yoksa "borç"
   * alanı adı hiç uymayan bir sayı sütununu kapar ve gerçek sahibi (tutar) boşta kalırdı.
   */
  const assign = (field: MappedField, minScore: number, shapeScore: (sample: ColumnSample) => number) => {
    const best = bestFor(field, shapeScore);
    confidence[field] = Math.round(best.score * 100) / 100;
    if (!best.header || best.score < minScore) return null;
    taken.add(best.header);
    return best.header;
  };

  const date = assign('date', 0.3, (s) => dateRatio(s.values));
  const label = assign('label', 0.3, (s) => (moneyRatio(s.values) < 0.5 && dateRatio(s.values) < 0.5 ? 1 : 0));
  // Bakiye sütunu ÖNCE tüketilir ki tutarla karışmasın — ama YALNIZ adıyla tanınırsa (0.6):
  // bakiyeyi tutar sanmak bütün ekstreyi çöpe çevirir, tanımadığını yutmak da öyle.
  assign('balance', 0.6, (s) => (moneyRatio(s.values) > 0.8 ? 0.5 : 0));

  // Borç/alacak ADIYLA tanınmalı: biçim tek başına yeterli değil, her sayı sütunu aday olurdu.
  const debit = assign('debit', 0.6, (s) => (moneyRatio(s.values) > 0.5 ? 0.5 : 0));
  const credit = assign('credit', 0.6, (s) => (moneyRatio(s.values) > 0.5 ? 0.5 : 0));
  // Tutar biçimden de bulunabilir (başlıksız dosya) — ama güveni düşük çıkar ve ekranda işaretlenir.
  const amount = assign('amount', 0.2, (s) => (moneyRatio(s.values) > 0.5 ? (hasSignedValues(s.values) ? 1 : 0.5) : 0));
  const reference = assign('reference', 0.6, () => 0);

  // Mod kararı: borç ve alacak sütunlarının İKİSİ de adıyla tanınmışsa iki sütunlu gelenektir.
  const twoColumn = !!debit && !!credit;
  const amountMode: BankAmountMode = twoColumn ? 'debit_credit' : 'signed';

  const allValues = samples.flatMap((s) => s.values);
  const moneyValues = allValues.filter((v) => MONEY_PATTERN.test(v));
  const dateValues = allValues.filter((v) => DATE_PATTERN.test(v));

  const mapping: BankColumnMapping = {
    date: date ?? '',
    label: label ?? '',
    amount: twoColumn ? null : amount,
    debit: twoColumn ? debit : null,
    credit: twoColumn ? credit : null,
    reference,
  };

  const missing: MappingSuggestion['missing'] = [];
  if (!mapping.date) missing.push('date');
  if (!mapping.label) missing.push('label');
  if (twoColumn ? !(mapping.debit && mapping.credit) : !mapping.amount) missing.push('amount');

  return {
    amountMode,
    mapping,
    decimalSeparator: usesCommaDecimal(moneyValues) ? ',' : '.',
    dateFormat: detectDateFormat(dateValues),
    confidence: {
      date: confidence['date'] ?? 0,
      label: confidence['label'] ?? 0,
      amount: confidence['amount'] ?? 0,
      debit: confidence['debit'] ?? 0,
      credit: confidence['credit'] ?? 0,
      reference: confidence['reference'] ?? 0,
    },
    missing,
  };
};

/** Ondalık ayırıcı: son ayırıcıdan sonra 1-2 hane varsa o ayırıcıdır. */
function usesCommaDecimal(values: readonly string[]): boolean {
  let comma = 0;
  let dot = 0;
  for (const value of values) {
    if (!/[.,](\d{1,2})\s*(?:€|eur)?\s*\)?\s*$/i.test(value)) continue;
    if (value.includes(',') && value.lastIndexOf(',') > value.lastIndexOf('.')) comma += 1;
    else dot += 1;
  }
  // Beraberlikte virgül: dosyalar Fransa'dan geliyor.
  return comma >= dot;
}

/**
 * Tarih düzeni. İlk parça 4 haneliyse ISO'dur. Değilse: **bir örnekte ilk parça 12'yi aşıyorsa**
 * gün-ay'dır (13/07 ay olamaz). Hiçbiri ayırt etmiyorsa gün-ay varsayılır — piyasa Fransa.
 */
function detectDateFormat(values: readonly string[]): 'dmy' | 'ymd' | 'mdy' {
  let firstOverTwelve = false;
  let secondOverTwelve = false;
  for (const value of values) {
    const parts = DATE_PATTERN.exec(value);
    if (!parts) continue;
    if (parts[1]!.length === 4) return 'ymd';
    if (Number(parts[1]) > 12) firstOverTwelve = true;
    if (Number(parts[2]) > 12) secondOverTwelve = true;
  }
  if (secondOverTwelve && !firstOverTwelve) return 'mdy';
  return 'dmy';
}
