import { z } from 'zod';
import { dbNumeric } from '../primitives/db-numeric';

// Banka ekstresi import'u (12.4) — DOMAIN §9, data-model/para.md.
//
// Banka dosyası bir GERÇEK KAYNAĞIDIR: satırları para hareketine dönüşür ve hesabın bakiyesi
// oradan türer. Bu yüzden iki şey pazarlıksızdır:
// 1. **Aynı satır iki kez yazılmaz** — mükerrer yazım her bakiyeyi ve her kâr raporunu yalancı yapar.
// 2. **Eşleştirme ONAYA düşer** — yanlış eşleşen satır parayı başka bir siparişin ödemesi yapar;
//    o sipariş "ödendi" görünürken gerçekte ödeyen müşteri borçlu kalır.

/**
 * Tutarın dosyada nasıl durduğu. Bankalar iki gelenekten birini kullanır: tek işaretli sütun
 * (−45,90) ya da ayrı borç/alacak sütunları. Üçüncü bir gelenek yok, o yüzden enum.
 */
export const BankAmountModeEnum = z.enum(['signed', 'debit_credit']);
export type BankAmountMode = z.infer<typeof BankAmountModeEnum>;

/**
 * Hangi sütun hangi alana denk geliyor — **sütun BAŞLIĞIYLA** tutulur, sırasıyla değil: banka
 * dosyasına bir sütun eklediğinde sıra kayar, başlık kalır.
 */
export const BankColumnMappingSchema = z.object({
  date: z.string(),
  label: z.string(),
  /** `signed` modda tutar sütunu. */
  amount: z.string().nullable(),
  /** `debit_credit` modda para çıkışı sütunu. */
  debit: z.string().nullable(),
  /** `debit_credit` modda para girişi sütunu. */
  credit: z.string().nullable(),
  /** Varsa banka referansı — eşleştirmede güçlü ipucu. */
  reference: z.string().nullable(),
});
export type BankColumnMapping = z.infer<typeof BankColumnMappingSchema>;

/**
 * AI sütun tanıyıcısının çıktısı (12.4 · sınıf 3, 16.08) — `MappingSuggestion`ın (domain-core)
 * modele dayatılabilir yarısı. `missing` BURADA YOK ve bilerek: hangi zorunlu alanın boş kaldığı
 * eşlemeden TÜRETİLİR; modele türetilebilir bir alanı doldurtmak, iki cevabın ayrışabileceği
 * ikinci bir kaynak açmak olurdu — uygulama katmanı hesaplar.
 */
export const BankColumnSuggestionSchema = z.object({
  amountMode: BankAmountModeEnum,
  mapping: BankColumnMappingSchema,
  decimalSeparator: z.enum([',', '.']),
  dateFormat: z.enum(['dmy', 'ymd', 'mdy']),
  /** Alan başına 0–1 güven — düşük güven ekranda işaretlenir, operatör oraya bakar. */
  confidence: z.object({
    date: z.number().min(0).max(1),
    label: z.number().min(0).max(1),
    amount: z.number().min(0).max(1),
    debit: z.number().min(0).max(1),
    credit: z.number().min(0).max(1),
    reference: z.number().min(0).max(1),
  }),
});
export type BankColumnSuggestion = z.infer<typeof BankColumnSuggestionSchema>;

/**
 * **Hesaba özel** import şablonu. Banka başına bir kez çıkarılır, sonraki dosyalarda otomatik
 * uygulanır — her ay aynı soruyu sormak memurluktur.
 */
export const BankImportProfileSchema = z.object({
  id: z.string().uuid(),
  accountId: z.string().uuid(),
  name: z.string(),
  amountMode: BankAmountModeEnum,
  mapping: BankColumnMappingSchema,
  /** `1.234,56` mı `1,234.56` mı — Fransız dosyaları virgüllüdür. */
  decimalSeparator: z.enum([',', '.']),
  /** Tarih düzeni: `dd/mm/yyyy` (FR) · `yyyy-mm-dd` (ISO) · `mm/dd/yyyy` (US). */
  dateFormat: z.enum(['dmy', 'ymd', 'mdy']),
  createdAt: z.string(),
});
export type BankImportProfile = z.infer<typeof BankImportProfileSchema>;

export const BankImportProfileInsertSchema = BankImportProfileSchema.omit({ id: true, createdAt: true });
export type BankImportProfileInsert = z.infer<typeof BankImportProfileInsertSchema>;

export const BankImportProfileUpdateSchema = BankImportProfileSchema.partial().required({ id: true });
export type BankImportProfileUpdate = z.infer<typeof BankImportProfileUpdateSchema>;

/** Bir dosya yüklemesinin kaydı — "bu satır nereden geldi" sorusunun cevabı; import geri alınabilsin. */
export const BankImportSchema = z.object({
  id: z.string().uuid(),
  accountId: z.string().uuid(),
  profileId: z.string().uuid().nullable(),
  fileName: z.string(),
  /** Dosyadaki satır sayısı. */
  rowCount: z.number().int(),
  /** Gerçekten yazılan. */
  insertedCount: z.number().int(),
  /** Zaten var olduğu için atlanan — mükerrer korumasının görünür yüzü. */
  duplicateCount: z.number().int(),
  createdAt: z.string(),
});
export type BankImport = z.infer<typeof BankImportSchema>;

export const BankImportInsertSchema = BankImportSchema.omit({ id: true, createdAt: true }).partial({
  rowCount: true, insertedCount: true, duplicateCount: true,
});
export type BankImportInsert = z.infer<typeof BankImportInsertSchema>;

export const BankImportUpdateSchema = BankImportSchema.partial().required({ id: true });
export type BankImportUpdate = z.infer<typeof BankImportUpdateSchema>;

/** Dosyadan okunmuş, henüz yorumlanmamış satır: başlık → hücre. */
export const RawBankRowSchema = z.record(z.string());
export type RawBankRow = z.infer<typeof RawBankRowSchema>;

/** Profil uygulandıktan sonraki satır — para hareketine dönüşmeye hazır. */
export const ParsedBankRowSchema = z.object({
  valueDate: z.string(),
  amount: dbNumeric,
  direction: z.enum(['in', 'out']),
  label: z.string(),
  reference: z.string().nullable(),
  /**
   * Satırın kimliği — mükerrer korumasının dayanağı. Banka satır kimliği vermediği için
   * hesap + tarih + tutar + yön + açıklama'dan ÜRETİLİR; aynı gün aynı tutarlı iki gerçek hareket
   * `occurrence` ile ayrışır (bkz. `domain-core/bank/fingerprint`).
   */
  fingerprint: z.string(),
});
export type ParsedBankRow = z.infer<typeof ParsedBankRowSchema>;
