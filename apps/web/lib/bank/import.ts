import { bankColumnsTask, runTask, type AiModel } from '@lezzet/ai';
import { pennylaneFeedFrom } from '@lezzet/application';
import {
  BankImportProfileService, BankImportService, MoneyMovementService, serviceDb,
} from '@lezzet/database';
import {
  fingerprintRows, heuristicColumnMapper, parseBankRows,
  type ColumnSample, type MappingSuggestion, type RowParseFailure,
} from '@lezzet/domain-core';
import { toCents } from '@lezzet/helper';
import type { BankColumnSuggestion, BankImport, BankImportProfile, MoneyMovementInsert, RawBankRow } from '@lezzet/types';

/**
 * Banka ekstresi içe aktarma kapısı (DOMAIN §9): dosya çözümlenir ve sütun eşlemesi önerilir, operatör onaylar ve şablon kaydedilir,
 * satırlar hareket olarak yazılır. Öneriyi önce yapay zekâ, olmazsa sezgisel motor (`heuristicColumnMapper`) verir.
 */

/** Dosyanın ilk satırlarından sütun örneği çıkarır — yapay zekâya gidecek "bilginin bir kısmı". */
function sampleColumns(rows: readonly RawBankRow[], sampleSize = 5): ColumnSample[] {
  const headers = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  return headers.map((header) => ({
    header,
    values: rows.slice(0, sampleSize).map((r) => r[header] ?? ''),
  }));
}

/** AI önerisindeki her başlık ÖRNEKTE gerçekten var mı — uydurulmuş başlık eşlemeyi düşürür. */
function headersExist(suggestion: BankColumnSuggestion, samples: readonly ColumnSample[]): boolean {
  const known = new Set(samples.map((sample) => sample.header));
  return Object.values(suggestion.mapping).every((header) => header === null || known.has(header));
}

/** Zorunlu alanlardan eşlenemeyenler — modele SORDURULMAZ, eşlemeden türetilir (şema künyesi). */
function missingOf(suggestion: BankColumnSuggestion): MappingSuggestion['missing'] {
  const missing: MappingSuggestion['missing'] = [];
  if (!suggestion.mapping.date) missing.push('date');
  if (!suggestion.mapping.label) missing.push('label');
  const hasAmount = suggestion.amountMode === 'signed' ? !!suggestion.mapping.amount : !!(suggestion.mapping.debit && suggestion.mapping.credit);
  if (!hasAmount) missing.push('amount');
  return missing;
}

/**
 * Dosyayı çözümler: hangi sütun hangi alan; sonuç onaya düşer, çünkü yanlış eşlenen bir sütun (bakiye ↔ tutar) bütün ekstreyi
 * çöpe çevirir. Önce model denenir, her başarısızlıkta sezgisel devralır; modelin örnekte olmayan bir başlık yazdığı cevap bütünüyle
 * atılır, çünkü uydurma başlık parse aşamasında sessizce boş kolon okutur.
 */
export async function analyzeFile(
  rows: readonly RawBankRow[],
  // `model` test enjeksiyonu (`translate-user-text` deseni): anahtarlı bir ortamda koşan test
  // gerçek modele çıkmamalı — `failingAiModel` verir, sezgisele düşer, sonuç deterministik kalır.
  opts: { fallback?: typeof heuristicColumnMapper; model?: AiModel } = {},
): Promise<MappingSuggestion> {
  const samples = sampleColumns(rows);
  const result = await runTask(
    bankColumnsTask,
    { columns: samples.map((s) => ({ header: s.header, values: s.values })) },
    opts.model ? { model: opts.model } : {},
  );
  if (!result.ok || !headersExist(result.data, samples)) return (opts.fallback ?? heuristicColumnMapper)(samples);
  return { ...result.data, missing: missingOf(result.data) };
}

type ImportOutcome = ImportWritten | { status: 'pennylane_feed'; from: string };

interface ImportWritten {
  status: 'ok';
  batch: BankImport;
  /** Yazılan hareket sayısı. */
  inserted: number;
  /** Zaten var olduğu için atlanan — mükerrer korumasının görünür yüzü. */
  duplicates: number;
  /** Okunamayan satırlar; sayısı ve sebebi ekranda gösterilir, dosya sessizce eksik alınmaz. */
  failures: RowParseFailure[];
}

/**
 * Dosyayı hesaba yazar: satırlar doğrudan hareket olur ki bakiye anında doğru olsun, sınıflandırma sonra eşleştirme kuyruğunda
 * yapılır. Mükerrer koruması veritabanındadır (`money_movement_import_key`), çünkü "önce sorgula, yoksa yaz" iki eşzamanlı
 * yüklemede ikisini de yazardı.
 */
export async function importBankRows(input: {
  accountId: string;
  profile: BankImportProfile;
  fileName: string;
  rows: readonly RawBankRow[];
}): Promise<ImportOutcome> {
  const db = serviceDb();
  const { rows, failures } = parseBankRows(input.rows, input.profile);
  // Eşlenen hesabın eşlendiği günden sonrası Pennylane'den gelir; dosya aynı banka satırını ikinci kez yazardı.
  const feedFrom = await pennylaneFeedFrom(db, input.accountId);
  if (feedFrom && rows.some((row) => row.valueDate >= feedFrom)) return { status: 'pennylane_feed', from: feedFrom };
  const fingerprinted = fingerprintRows(input.accountId, rows);

  const batch = await new BankImportService(db).insert({
    accountId: input.accountId,
    profileId: input.profile.id,
    fileName: input.fileName,
    rowCount: input.rows.length,
  });

  const movements: MoneyMovementInsert[] = fingerprinted.map((row) => ({
    accountId: input.accountId,
    direction: row.direction,
    // Ekstre satırı euro okur, hareket cent yazar (STACK §8).
    amountCents: toCents(row.amount),
    // Tip henüz bilinmiyor: banka "para girdi" der, sebebini söylemez; `misc` eşleştirme onaylanınca gerçek tipine döner, baştan
    // `order_payment` siparişi olmayan bir tahsilat uydururdu.
    type: 'misc',
    description: row.label,
    valueDate: row.valueDate,
    source: 'bank_import',
    reconciled: false,
    importFingerprint: row.fingerprint,
    bankImportId: batch.id,
  }));

  const insertedRows = await new MoneyMovementService(db).insertImported(movements);
  const duplicates = movements.length - insertedRows.length;

  const updated = await new BankImportService(db).update({
    id: batch.id,
    insertedCount: insertedRows.length,
    duplicateCount: duplicates,
  });

  return { status: 'ok', batch: updated, inserted: insertedRows.length, duplicates, failures };
}

/**
 * Şablonu kaydeder — ikinci import aynı bankada otomatik uygulansın diye. Operatörün onayladığı
 * eşleme burada kalıcılaşır; öneri bir kez, şablon sürekli.
 */
export function saveProfile(input: {
  accountId: string;
  name: string;
  suggestion: Pick<MappingSuggestion, 'amountMode' | 'mapping' | 'decimalSeparator' | 'dateFormat'>;
}): Promise<BankImportProfile> {
  return new BankImportProfileService(serviceDb()).insert({
    accountId: input.accountId,
    name: input.name,
    amountMode: input.suggestion.amountMode,
    mapping: input.suggestion.mapping,
    decimalSeparator: input.suggestion.decimalSeparator,
    dateFormat: input.suggestion.dateFormat,
  });
}

/** Hesabın kayıtlı şablonu — varsa dosya hiç soru sorulmadan yüklenebilir. */
export function profileFor(accountId: string): Promise<BankImportProfile | null> {
  return new BankImportProfileService(serviceDb()).latestFor(accountId);
}
