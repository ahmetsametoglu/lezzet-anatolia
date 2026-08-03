import {
  BankImportProfileService, BankImportService, MoneyMovementService, serviceDb,
} from '@lezzet/database';
import {
  fingerprintRows, heuristicColumnMapper, parseBankRows,
  type ColumnSample, type MappingSuggestion, type RowParseFailure,
} from '@lezzet/domain-core';
import { toCents } from '@lezzet/helper';
import type { BankImport, BankImportProfile, MoneyMovementInsert, RawBankRow } from '@lezzet/types';

/**
 * Banka ekstresi import kapısı (12.4) — DOMAIN §9.
 *
 * Akış üç adımdır ve **ikisi otomatik, biri insanın**: dosya çözümlenir (sütun eşlemesi önerilir) →
 * operatör onaylar/düzeltir ve şablon kaydedilir → satırlar hareket olarak yazılır.
 *
 * **Sütun eşlemesini bugün sezgisel bir motor öneriyor** (`heuristicColumnMapper`); yapay zekâ
 * entegrasyonu geldiğinde (`packages/ai`) değişen tek şey aşağıdaki `mapper` varsayılanıdır —
 * imza aynı kalır, bu dosyanın gerisi hiç değişmez.
 */

/** Dosyanın ilk satırlarından sütun örneği çıkarır — yapay zekâya gidecek "bilginin bir kısmı". */
function sampleColumns(rows: readonly RawBankRow[], sampleSize = 5): ColumnSample[] {
  const headers = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  return headers.map((header) => ({
    header,
    values: rows.slice(0, sampleSize).map((r) => r[header] ?? ''),
  }));
}

/**
 * Dosyayı çözümler: hangi sütun hangi alan. **Sonuç ONAYA düşer** — yanlış eşlenen bir sütun
 * (ör. bakiye ↔ tutar) bütün ekstreyi çöpe çevirir; ne sezgisel kural ne yapay zekâ bunu tek
 * başına üstlenebilir.
 */
export function analyzeFile(rows: readonly RawBankRow[], mapper = heuristicColumnMapper): MappingSuggestion {
  return mapper(sampleColumns(rows));
}

interface ImportOutcome {
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
 * Dosyayı hesaba yazar.
 *
 * **Mükerrer koruması veritabanındadır** (`money_movement_import_key`): "önce sorgula, yoksa yaz"
 * iki eşzamanlı yüklemede ikisini de yazardı. Çakışan satır sessizce düşer, sayısı farktan çıkar.
 *
 * **Satırlar doğrudan HAREKET olur**, bekleme odasına değil: banka gerçeği para gerçeğidir, hesabın
 * bakiyesi anında doğru olmalıdır. Sınıflandırma (hangi sipariş, hangi gider) sonra gelir —
 * `reconciled=false` kuyruğu tam bunun için var (12.1).
 */
export async function importBankRows(input: {
  accountId: string;
  profile: BankImportProfile;
  fileName: string;
  rows: readonly RawBankRow[];
}): Promise<ImportOutcome> {
  const db = serviceDb();
  const { rows, failures } = parseBankRows(input.rows, input.profile);
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
    // Ekstre satırı euro okur (banka dosyası öyle gelir); hareket cent yazar (02.9 · STACK §8).
    amountCents: toCents(row.amount),
    // Tip HENÜZ BİLİNMİYOR: banka "para girdi" der, sebebini söylemez. `misc` sınıflandırılmamış
    // demektir; eşleştirme onaylandığında gerçek tipine döner. Baştan `order_payment` deseydik
    // siparişi olmayan bir tahsilat uydurmuş olurduk.
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
