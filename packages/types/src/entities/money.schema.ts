import { z } from 'zod';
import { CurrencyEnum } from '../primitives/enums.schema';

// Para ve ön muhasebe (DOMAIN §9, data-model/para.md).
//
// TEK MANTIK: **para bir hesapta durur, hareketlerle girer/çıkar.** Kasa hareketi ile banka hareketi
// aynı şeydir, yalnız hesabı farklıdır — bu yüzden tek tablo, kasa/banka ayrımı yok.
//
// BAKİYE SAKLANMAZ, hareketlerden türetilir (DATA_MODEL kalıcı kararlar: sayaç tutulmaz, kayarsa izi
// bulunamaz). Türetimin tek yeri `account_movement` görünümüdür — bkz. `AccountLedgerRow`.
//
// ── SINIFLANDIRMA: TEK TÜR + CARİ + SERBEST ETİKET (13.09 · ikinci karar) ────
// "Bu para neyin parası" sorusunun cevabı bir TÜRDÜR (`nature`: tek, hesap planı koduyla); "kime /
// kimden" sorusunun cevabı bir CARİDİR (`counterpartyId`) ya da tedarikçidir; ETİKET serbest bir
// işarettir ve izah sayılmaz. Belge bağı tutarıyla ayrı tabloda durur (`MoneyAllocation`).

/**
 * Paranın durduğu yer. "Online havuz" ayrı değil — o da bir hesap (Stripe).
 *
 * `partner` (13.09 · kullanıcı kararı): ORTAK CARİ HESABI — ortağın TEK kaydı. Ortakla şirket
 * arasındaki her para (koyduğu, çektiği, cebinden ödediği, şirketin onun yerine ödediği) bu hesaptan
 * geçer. Bakiye işareti anlatır: eksi = şirket ortağa borçlu, artı = ortak şirkete borçlu.
 */
export const AccountTypeEnum = z.enum(['cash', 'bank', 'provider', 'partner']);
export type AccountType = z.infer<typeof AccountTypeEnum>;

export const AccountSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  type: AccountTypeEnum,
  currency: CurrencyEnum,
  isActive: z.boolean(),
  createdAt: z.string(),
});
export type Account = z.infer<typeof AccountSchema>;

export const AccountInsertSchema = z.object({
  name: z.string().min(1),
  type: AccountTypeEnum,
  currency: CurrencyEnum.optional(),
  isActive: z.boolean().optional(),
});
export type AccountInsert = z.infer<typeof AccountInsertSchema>;

export const AccountUpdateSchema = AccountSchema.partial().required({ id: true });
export type AccountUpdate = z.infer<typeof AccountUpdateSchema>;

/** Paranın yönü — hesabın gözünden: `in` girdi, `out` çıktı. */
export const MovementDirectionEnum = z.enum(['in', 'out']);
export type MovementDirection = z.infer<typeof MovementDirectionEnum>;

/**
 * Hareketin SEBEBİ. Yön çoğunlukla sebepten türer (satış parayı içeri, gider dışarı alır) — bu
 * ilişki motorda tanımlıdır (`domain-core/money.expectedDirection`), veri modelinde değil: kural
 * değişirse tek yerde değişir.
 */
export const MovementTypeEnum = z.enum([
  'order_payment', // sipariş tahsilatı
  'order_refund', // müşteriye iade
  'purchase', // stok alımı (StockIntake bağı)
  'expense', // kira/akaryakıt/maaş… (`nature` ile ayrışır)
  'transfer', // hesaplar arası: nakit→banka, Stripe→banka payout
  'capital', // sermaye girişi
  'misc',
]);
export type MovementType = z.infer<typeof MovementTypeEnum>;

/**
 * Reklam giderinin TÜRÜ (12.5 · 13.09) — kampanya ROI raporu (13.2) bu türü süzer. Kapı bunu
 * yazar, rapor bunu okur; iki yerde yazılsaydı biri değişince rapor hata vermeden BOŞALIRDI —
 * sessiz sıfır, yanlış cevabın en kötüsü. Sözlükteki karşılığı `movement_nature.slug = 'reklam'`.
 */
export const ADVERTISING_NATURE = 'reklam';

/**
 * Stripe ücretinin türü (12.14) — webhook ödeme başına komisyonu ve ödeme dışı Stripe ücretlerini
 * havuzdan bu türle düşer; kârlılık raporu komisyonu siparişin `paymentFee` alanından okur. Aynı
 * gerekçe: sabit tek yerde, sözlükteki karşılığı `movement_nature.slug = 'stripe-ucreti'`.
 */
export const STRIPE_FEE_NATURE = 'stripe-ucreti';

/**
 * Sermayenin türü (13.09) — girişte bu tür seçilince hareket `capital` tipine geçer (motor:
 * `classificationTypeOf`); öteki türler çıkışta `expense`, girişte `misc` olur. Sözlükteki
 * karşılığı `movement_nature.slug = 'sermaye'`.
 */
export const CAPITAL_NATURE = 'sermaye';

/**
 * Hareketi kim yazdı (12.4 · 13.09): operatör elle (`manual`), banka dosyası (`bank_import`) ya da
 * sistemin kendisi (`system`: Stripe webhook'u, kapıda tahsilat, hızlı satış, payout). Üçüncüsü
 * olmadan Stripe tahsilatı elle girilmiş bir satırdan ayırt edilemiyordu.
 */
export const MovementSourceEnum = z.enum(['manual', 'bank_import', 'system']);
export type MovementSource = z.infer<typeof MovementSourceEnum>;

export const MoneyMovementSchema = z.object({
  id: z.string().uuid(),
  accountId: z.string().uuid(),
  direction: MovementDirectionEnum,
  /** **Cent** (02.9 · STACK §8); DB kolonu `money_movement.amount` euro `numeric`. İşARETSİZ — yön
   *  `direction`tadır, işaretli hâli defter satırındadır (`signedAmountCents`). */
  amountCents: z.number().int(),
  type: MovementTypeEnum,
  /**
   * TÜR (13.09 · ikinci karar) — "bu para neyin parası": `movement_nature.slug`, TEK. Sipariş parası,
   * stok alımı ve transferde boştur (bağın kendisi söyler); giderde, sermayede ve sınıflandırılmamış
   * parada izahın en kısa yolu budur.
   */
  nature: z.string().nullable(),
  /** CARİ (13.09) — paranın kime gittiği / kimden geldiği (`counterparty`). Tedarikçiyse `supplierId` dolar, bu değil. */
  counterpartyId: z.string().uuid().nullable(),
  /** ETİKETLER — serbest işaret (`movement_tag.slug`), birden çok; izah SAYILMAZ. */
  tags: z.array(z.string()),
  /** Ek künye — reklam giderinde `{campaign}` (gerçek ROI, 12.5/13), Stripe tahsilatında `{providerRef}`. */
  meta: z.record(z.unknown()).nullable(),
  /** Transferde KARŞI hesap. Transfer TEK satırdır; karşı hesaba ters işaretle yansır (görünüm). */
  counterAccountId: z.string().uuid().nullable(),
  orderId: z.string().uuid().nullable(),
  stockIntakeId: z.string().uuid().nullable(),
  /** Tedarikçiye ödemeyse — tedarikçi borcu bundan türetilir (Σ giriş − Σ ödeme). */
  supplierId: z.string().uuid().nullable(),
  /** Paranın gerçekten hareket ettiği gün; kayıt günü (`createdAt`) ondan farklı olabilir. */
  valueDate: z.string(),
  description: z.string().nullable(),
  source: MovementSourceEnum,
  /**
   * Banka ekstresiyle eşleşti mi (12.4). YALNIZ banka satırında anlamlıdır (`source = bank_import`);
   * "izah edildi mi" sorusunun cevabı `explained`tir (13.09).
   */
  reconciled: z.boolean(),
  /**
   * İZAH (13.09) — türetilir, yazılmaz (tetikleyici kurar; uygulamanın gönderdiği değer ezilir):
   * sipariş / mal kabul / tedarikçi bağı, transfer, TÜR ya da en az bir belge bağı varsa `true`.
   * Etiket izah değildir. Yoksa hareket "izah edilmemiş" kuyruğundadır; kayıt yine de geçerlidir.
   */
  explained: z.boolean(),
  /**
   * Banka satırının üretilmiş kimliği (12.4) — aynı satır iki kez yazılmasın diye. Elle girilen
   * harekette `null`: elle iki kez 20 € girmek meşrudur, kısıt ona takılmamalı.
   */
  importFingerprint: z.string().nullable(),
  /**
   * **Yazımın kimliği** (21.263) — "bu isteği zaten yazdım mı?". İstemcide üretilir; cevabı
   * kaybolan bir tahsilat isteği tekrarlandığında aynı anahtarla gelir ve veritabanı ikinci
   * yazımı reddeder (`money_movement_idempotency_key`).
   *
   * `importFingerprint`in yerine geçmez: o *"bu banka ekstresindeki bu satır"*tır ve tekilliği
   * HESAP BAŞINADIR; bu ise isteğin kimliğidir ve tekilliği küreseldir. Künyenin tamamı
   * `0018_money.sql`de. `null` = korumasız yazım (elle giriş, besleme) ve meşrudur.
   */
  idempotencyKey: z.string().nullable(),
  bankImportId: z.string().uuid().nullable(),
  /**
   * KARŞI UÇ (12.13) — bu ekstre satırı şu transferin öteki yakasıdır. Transfer tek satırdır ve
   * karşı hesaba aynalanır; ekstre o yakayı bir kez daha getirince satır buradan uca bağlanır ve
   * ayna susar (`account_movement`) — para iki kez sayılmaz. Yalnız ekstre satırı, yalnız transferde.
   */
  counterpartMovementId: z.string().uuid().nullable(),
  createdAt: z.string(),
});
export type MoneyMovement = z.infer<typeof MoneyMovementSchema>;

export const MoneyMovementInsertSchema = z.object({
  accountId: z.string().uuid(),
  direction: MovementDirectionEnum,
  amountCents: z.number().int().positive(),
  type: MovementTypeEnum,
  /** Türün slug'ı; tanınmayanı veritabanı (FK), pasifi ve ters yönlüsünü uygulama kapısı reddeder. */
  nature: z.string().nullish(),
  counterpartyId: z.string().uuid().nullish(),
  /** Serbest etiket slug'ları; tanınmayanı veritabanı reddeder (`check_tags_known`). */
  tags: z.array(z.string()).optional(),
  meta: z.record(z.unknown()).nullish(),
  counterAccountId: z.string().uuid().nullish(),
  orderId: z.string().uuid().nullish(),
  stockIntakeId: z.string().uuid().nullish(),
  supplierId: z.string().uuid().nullish(),
  valueDate: z.string().optional(),
  description: z.string().nullish(),
  source: MovementSourceEnum.optional(),
  reconciled: z.boolean().optional(),
  importFingerprint: z.string().nullish(),
  /** Yazımın kimliği (21.263) — künyesi varlık şemasında. Verilmezse yazım korumasızdır. */
  idempotencyKey: z.string().nullish(),
  bankImportId: z.string().uuid().nullish(),
  counterpartMovementId: z.string().uuid().nullish(),
});
export type MoneyMovementInsert = z.infer<typeof MoneyMovementInsertSchema>;

/** `explained` türetilmiş kolondur, güncelleme gövdesine giremez — tetikleyici her yazımda yeniden kurar. */
export const MoneyMovementUpdateSchema = MoneyMovementSchema.omit({ explained: true }).partial().required({ id: true });
export type MoneyMovementUpdate = z.infer<typeof MoneyMovementUpdateSchema>;

/**
 * `account_movement` görünümünün satırı — **defter satırı**: bir hareket dokunduğu HER hesapta bir
 * satır üretir (transfer iki hesabı birden etkiler). `signedAmount` işaret kuralının TEK
 * uygulamasıdır; bakiye de ekstre de bunun üstünde durur, kural iki yere yazılmaz.
 */
export const AccountLedgerRowSchema = MoneyMovementSchema.extend({
  /** Satırın ait olduğu hesap — transferde `accountId`'den farklı olabilir. */
  ledgerAccountId: z.string().uuid(),
  /** Bu hesap için işaretli tutar (**cent**): girişte +, çıkışta −; transferin karşı ucunda ters. */
  signedAmountCents: z.number().int(),
});
export type AccountLedgerRow = z.infer<typeof AccountLedgerRowSchema>;

/**
 * `record_order_movement` / `resync_order_amounts` dönüşü (12.2). Tutarlar **hareketlerden yeniden
 * hesaplanır**, artırılmaz — kaçırılan/tekrarlanan çağrı kalıcı sapma bırakmasın.
 */
export const OrderAmountsSchema = z.object({
  ok: z.boolean(),
  movementId: z.string().uuid().optional(),
  /**
   * **Bu çağrı yeni bir hareket YAZMADI** (21.263): aynı `idempotencyKey` ile daha önce yazılmış
   * bir hareket bulundu ve onun sonucu döndü. Tutarlar yine defterin O ANKİ hâlidir (RPC tekrar
   * dalında da `resync_order_amounts` koşuyor), yani okuyan taraf için `true` bir eksiklik değil
   * bir BİLGİDİR: ekran "tahsil edildi" yerine "zaten yazılmıştı" diyebilsin.
   *
   * `optional` çünkü yalnız sipariş parasını yazan RPC bu alanı üretiyor.
   */
  deduped: z.boolean().optional(),
  // RPC euro döndürür; cent'e çevrim servis sınırında (`rpcMoneyToCents`, 02.9 · STACK §8).
  amountCollectedCents: z.number().int(),
  amountRefundedCents: z.number().int(),
});
export type OrderAmounts = z.infer<typeof OrderAmountsSchema>;

/** `account_balance` görünümü — bakiye SAKLANMAZ, defter satırlarından toplanır. */
export const AccountBalanceSchema = z.object({
  accountId: z.string().uuid(),
  balanceCents: z.number().int(),
  movementCount: z.number().int(),
});
export type AccountBalance = z.infer<typeof AccountBalanceSchema>;

// ── Belge (13.09) ────────────────────────────────────────────────────────────
// Resmî muhasebe sorduğunda hareketin dayanağı. Belge PARA DEĞİLDİR: fatura gelince borç doğar,
// ödeme sonra bir hareket olarak gelir ve bir BAĞLA (`MoneyAllocation`, tutarıyla) belgeye bağlanır.
// Açık kalan saklanmaz, `money_document_balance` görünümünden türetilir.

/** Belge türü — kapalı küme; `other` bir kaçış kutusu değil, "bu beşten hiçbiri" demektir. */
export const DocumentKindEnum = z.enum(['invoice', 'receipt', 'payslip', 'contract', 'statement', 'other']);
export type DocumentKind = z.infer<typeof DocumentKindEnum>;

export const MoneyDocumentSchema = z.object({
  id: z.string().uuid(),
  kind: DocumentKindEnum,
  /** Belge numarası — faturada var, fiş ve bordroda olmayabilir. */
  number: z.string().nullable(),
  /** Belgenin kendi tarihi (ISO gün). */
  issuedOn: z.string(),
  /** Karşı taraf (13.09): cari (kiraya veren, çalışan, kurum) — tedarikçiyse `supplierId`; ikisinden en çok biri. */
  counterpartyId: z.string().uuid().nullable(),
  supplierId: z.string().uuid().nullable(),
  /** Stok alımının faturası mal kabule bağlanır; ikinci bir borç DOĞURMAZ (borç mal kabulden türer, 12.3). */
  stockIntakeId: z.string().uuid().nullable(),
  /** `out` = bizim ödeyeceğimiz (gelen fatura, bordro), `in` = bize ödenecek (tedarikçi iadesi). */
  direction: MovementDirectionEnum,
  /** Belgenin TÜRÜ (13.09) — ödemesi bağlanınca harekete de geçer (hareketin türü boşsa). */
  nature: z.string().nullable(),
  /** **Cent** (STACK §8); kolon `amount` euro. Belgenin toplamı, KDV dahil. */
  amountCents: z.number().int(),
  /** KDV tutarı (**cent**); belgede yoksa `null` — sıfır "KDV yok" demektir, "bilinmiyor" değil. */
  vatAmountCents: z.number().int().nullable(),
  currency: CurrencyEnum,
  /** Dosyanın ÖZEL kovadaki anahtarı (`r2Keys.financeDocument`); yoksa belge yalnız künyedir. */
  fileKey: z.string().nullable(),
  /** Serbest etiketler (13.09) — sınıflandırma `nature`dadır. */
  tags: z.array(z.string()),
  note: z.string().nullable(),
  createdAt: z.string(),
});
export type MoneyDocument = z.infer<typeof MoneyDocumentSchema>;

export const MoneyDocumentInsertSchema = z.object({
  kind: DocumentKindEnum,
  number: z.string().nullish(),
  issuedOn: z.string(),
  counterpartyId: z.string().uuid().nullish(),
  supplierId: z.string().uuid().nullish(),
  stockIntakeId: z.string().uuid().nullish(),
  direction: MovementDirectionEnum,
  nature: z.string().nullish(),
  amountCents: z.number().int().positive(),
  vatAmountCents: z.number().int().nonnegative().nullish(),
  currency: CurrencyEnum.optional(),
  fileKey: z.string().nullish(),
  tags: z.array(z.string()).optional(),
  note: z.string().nullish(),
});
export type MoneyDocumentInsert = z.infer<typeof MoneyDocumentInsertSchema>;

export const MoneyDocumentUpdateSchema = MoneyDocumentSchema.partial().required({ id: true });
export type MoneyDocumentUpdate = z.infer<typeof MoneyDocumentUpdateSchema>;

/** `money_document_balance` görünümü — belgenin açık kalanı, bağlarından türetilir. */
export const MoneyDocumentBalanceSchema = z.object({
  documentId: z.string().uuid(),
  amountCents: z.number().int(),
  /** Belgeyle aynı yöndeki hareketlerin bağ tutarları toplamı eksi ters yöndekiler (**cent**). */
  settledCents: z.number().int(),
  /** `amount − settled`; eksi çıkabilir (fazla ödeme) ve gizlenmez. */
  openAmountCents: z.number().int(),
});
export type MoneyDocumentBalance = z.infer<typeof MoneyDocumentBalanceSchema>;

// ── Belge bağı (13.09 · ikinci karar) ────────────────────────────────────────

/**
 * Hareket ↔ belge bağı, TUTARIYLA. Bir havale birkaç faturayı kapatır (tedarikçinin üç faturası tek
 * ödemede), bir fatura birkaç ödemeyle kapanır (taksit). Bir hareketin bağları toplamı kendi
 * tutarını aşamaz (veritabanı tetikleyicisi); belgenin açık kalanı eksiye düşebilir — fazla ödeme
 * bir olgudur, gizlenmez.
 */
export const MoneyAllocationSchema = z.object({
  id: z.string().uuid(),
  movementId: z.string().uuid(),
  documentId: z.string().uuid(),
  /** **Cent** (STACK §8); kolon `amount` euro. Bağın taşıdığı tutar — hareketin tamamı olmak zorunda değil. */
  amountCents: z.number().int(),
  createdAt: z.string(),
});
export type MoneyAllocation = z.infer<typeof MoneyAllocationSchema>;

export const MoneyAllocationInsertSchema = z.object({
  movementId: z.string().uuid(),
  documentId: z.string().uuid(),
  amountCents: z.number().int().positive(),
});
export type MoneyAllocationInsert = z.infer<typeof MoneyAllocationInsertSchema>;

/**
 * `stock_intake_balance` görünümü — mal kabulün açık kalanı: kabul tutarı − kabule bağlı alım
 * ödemeleri (12.3'ün türetimi, 12.13'ün "hangi mal kabulün parası" adayı). Faturası belge olarak
 * girilen kabul `hasDocument` taşır; borcu belgenin açık kalanında görünür, burada ikinci kez değil.
 */
export const StockIntakeBalanceSchema = z.object({
  stockIntakeId: z.string().uuid(),
  supplierId: z.string().uuid().nullable(),
  date: z.string(),
  amountCents: z.number().int(),
  /** Kabule bağlı `purchase` çıkışları eksi girişleri (tedarikçi iadesi) — **cent**. */
  paidCents: z.number().int(),
  /** `amount − paid`; eksi çıkabilir (fazla ödeme) ve gizlenmez. */
  openAmountCents: z.number().int(),
  hasDocument: z.boolean(),
});
export type StockIntakeBalance = z.infer<typeof StockIntakeBalanceSchema>;

// ── Sözlükler (13.09) ────────────────────────────────────────────────────────
// Tür ve etiket YÖNETİLEN listelerdir: operatör ekler, yazım tek kalır; hareket yalnız buradaki
// slug'ı taşır. Anahtar `slug`, okunur ad `label`.

/** Tür ve etiket slug'ının biçimi — ASCII, küçük harf, tire. Veritabanı kısıtıyla aynı cümle. */
export const DICTIONARY_SLUG = /^[a-z0-9][a-z0-9-]*$/;

/** TÜR — "bu para neyin parası". Hareketin ve belgenin TEK sınıflandırması (13.09 · ikinci karar). */
export const MovementNatureSchema = z.object({
  slug: z.string().regex(DICTIONARY_SLUG),
  label: z.string(),
  /** Türün anlamlı olduğu yön: `out` gider, `in` gelir; `null` iki yön. Seçici satırın yönüyle süzer. */
  direction: MovementDirectionEnum.nullable(),
  /** Fransız hesap planı kodu (PCG) — isteğe bağlı; karşılığı tek değilse boş kalır, uydurulmaz. */
  accountCode: z.string().nullable(),
  /** Pasif tür yeni harekete verilmez, eski hareketlerde kalır. */
  isActive: z.boolean(),
  createdAt: z.string(),
});
export type MovementNature = z.infer<typeof MovementNatureSchema>;

export const MovementNatureInsertSchema = z.object({
  slug: z.string().regex(DICTIONARY_SLUG),
  label: z.string().min(1),
  direction: MovementDirectionEnum.nullish(),
  accountCode: z.string().regex(/^[0-9]{2,8}$/).nullish(),
  isActive: z.boolean().optional(),
});
export type MovementNatureInsert = z.infer<typeof MovementNatureInsertSchema>;

export const MovementNatureUpdateSchema = MovementNatureSchema.partial().required({ slug: true });
export type MovementNatureUpdate = z.infer<typeof MovementNatureUpdateSchema>;

/** ETİKET — serbest işaret, izah sayılmaz (13.09 · ikinci karar). */
export const MovementTagSchema = z.object({
  slug: z.string().regex(DICTIONARY_SLUG),
  label: z.string(),
  /** Pasif etiket yeni harekete verilmez, eski hareketlerde kalır. */
  isActive: z.boolean(),
  createdAt: z.string(),
});
export type MovementTag = z.infer<typeof MovementTagSchema>;

export const MovementTagInsertSchema = z.object({
  slug: z.string().regex(DICTIONARY_SLUG),
  label: z.string().min(1),
  isActive: z.boolean().optional(),
});
export type MovementTagInsert = z.infer<typeof MovementTagInsertSchema>;

export const MovementTagUpdateSchema = MovementTagSchema.partial().required({ slug: true });
export type MovementTagUpdate = z.infer<typeof MovementTagUpdateSchema>;

// ── Cari (13.09 · ikinci karar) ──────────────────────────────────────────────
// Paranın kime gittiği / kimden geldiği: kurum, hizmet veren, çalışan. Tedarikçi burada değil (stok
// modülünün `supplier`ı), ortak da değil (ortağın kaydı cari HESABIDIR).

/** Carinin türü — seçicide grup başlığı: kurum (URSSAF, vergi), hizmet (muhasebeci, telefon, kira), çalışan, diğer. */
export const CounterpartyKindEnum = z.enum(['institution', 'service', 'employee', 'other']);
export type CounterpartyKind = z.infer<typeof CounterpartyKindEnum>;

export const CounterpartySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  kind: CounterpartyKindEnum,
  /** Eşleşme kelimeleri — banka satırında biri geçerse bu cari (ve varsayılan türü) önerilir. */
  keywords: z.array(z.string()),
  /** Tanınan satıra önerilecek tür (`movement_nature.slug`). */
  defaultNature: z.string().nullable(),
  note: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: z.string(),
});
export type Counterparty = z.infer<typeof CounterpartySchema>;

export const CounterpartyInsertSchema = z.object({
  name: z.string().min(1),
  kind: CounterpartyKindEnum.optional(),
  keywords: z.array(z.string()).optional(),
  defaultNature: z.string().nullish(),
  note: z.string().nullish(),
  isActive: z.boolean().optional(),
});
export type CounterpartyInsert = z.infer<typeof CounterpartyInsertSchema>;

export const CounterpartyUpdateSchema = CounterpartySchema.partial().required({ id: true });
export type CounterpartyUpdate = z.infer<typeof CounterpartyUpdateSchema>;
