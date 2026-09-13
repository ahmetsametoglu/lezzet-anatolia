import { z } from 'zod';
import { CurrencyEnum } from '../primitives/enums.schema';

// Para ve ön muhasebe (DOMAIN §9, data-model/para.md).
//
// TEK MANTIK: **para bir hesapta durur, hareketlerle girer/çıkar.** Kasa hareketi ile banka hareketi
// aynı şeydir, yalnız hesabı farklıdır — bu yüzden tek tablo, kasa/banka ayrımı yok.
//
// BAKİYE SAKLANMAZ, hareketlerden türetilir (DATA_MODEL kalıcı kararlar: sayaç tutulmaz, kayarsa izi
// bulunamaz). Türetimin tek yeri `account_movement` görünümüdür — bkz. `AccountLedgerRow`.

/**
 * Paranın durduğu yer. "Online havuz" ayrı değil — o da bir hesap (Stripe).
 *
 * `partner` (13.09 · kullanıcı kararı): ORTAK CARİ HESABI. Ortağın cebinden ödenen şirket gideri ve
 * şirketin ortak adına yaptığı ödeme şirket hesaplarından geçmez; tutunacakları yer bu hesaptır.
 * Bakiye işareti anlatır: eksi = şirket ortağa borçlu, artı = ortak şirkete borçlu.
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
  'expense', // kira/akaryakıt/maaş… (`tags` ile ayrışır)
  'transfer', // hesaplar arası: nakit→banka, Stripe→banka payout
  'capital', // sermaye girişi
  'misc',
]);
export type MovementType = z.infer<typeof MovementTypeEnum>;

/**
 * Reklam giderinin ETİKETİ (12.5 · 13.09) — kampanya ROI raporu (13.2) bu etiketi süzer. Kapı bunu
 * yazar, rapor bunu okur; iki yerde yazılsaydı biri değişince rapor hata vermeden BOŞALIRDI —
 * sessiz sıfır, yanlış cevabın en kötüsü. Sözlükteki karşılığı `movement_tag.slug = 'reklam'`.
 */
export const ADVERTISING_TAG = 'reklam';

/**
 * Stripe ücretinin etiketi (12.14) — webhook ödeme başına komisyonu ve ödeme dışı Stripe ücretlerini
 * havuzdan bu etiketle düşer; kârlılık raporu komisyonu siparişin `paymentFee` alanından okur. Aynı
 * gerekçe: sabit tek yerde, sözlükteki karşılığı `movement_tag.slug = 'stripe-ucreti'`.
 */
export const STRIPE_FEE_TAG = 'stripe-ucreti';

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
   * ETİKETLER (13.09) — sınıflandırmanın tek mekanizması, sözlükten (`movement_tag.slug`). Birden
   * çok olabilir: `maas` + `ortak:ahmet` aynı hareketin iki gerçeğidir. Eski `category` kalktı.
   */
  tags: z.array(z.string()),
  /** Dayanak belge (fatura, fiş, bordro…) — `money_document`. Belge silinirse bağ düşer, hareket kalır. */
  documentId: z.string().uuid().nullable(),
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
   * İZAH (13.09) — türetilmiş kolon, yazılmaz: sipariş/mal kabul/tedarikçi bağı, belge, en az bir
   * etiket ya da transfer varsa `true`. Yoksa hareket "izah edilmemiş" kuyruğundadır; kayıt yine
   * de geçerlidir (banka satırı ham gelir, sonra izah edilir).
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
  /** Sözlükteki slug'lar; tanınmayan etiketi veritabanı reddeder (`check_tags_known`). */
  tags: z.array(z.string()).optional(),
  documentId: z.string().uuid().nullish(),
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

/** `explained` türetilmiş kolondur, güncelleme gövdesine giremez — veritabanı yazımı reddeder. */
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
// ödeme sonra bir hareket olarak gelir ve `documentId` ile belgeye bağlanır. Açık kalan saklanmaz,
// `money_document_balance` görünümünden türetilir.

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
  /** Karşı taraf: kiraya veren, çalışan, kurum… Tedarikçiyse `supplierId` de dolar. */
  counterparty: z.string().nullable(),
  supplierId: z.string().uuid().nullable(),
  /** Stok alımının faturası mal kabule bağlanır; ikinci bir borç DOĞURMAZ (borç mal kabulden türer, 12.3). */
  stockIntakeId: z.string().uuid().nullable(),
  /** `out` = bizim ödeyeceğimiz (gelen fatura, bordro), `in` = bize ödenecek (tedarikçi iadesi). */
  direction: MovementDirectionEnum,
  /** **Cent** (STACK §8); kolon `amount` euro. Belgenin toplamı, KDV dahil. */
  amountCents: z.number().int(),
  /** KDV tutarı (**cent**); belgede yoksa `null` — sıfır "KDV yok" demektir, "bilinmiyor" değil. */
  vatAmountCents: z.number().int().nullable(),
  currency: CurrencyEnum,
  /** Dosyanın ÖZEL kovadaki anahtarı (`r2Keys.financeDocument`); yoksa belge yalnız künyedir. */
  fileKey: z.string().nullable(),
  tags: z.array(z.string()),
  note: z.string().nullable(),
  createdAt: z.string(),
});
export type MoneyDocument = z.infer<typeof MoneyDocumentSchema>;

export const MoneyDocumentInsertSchema = z.object({
  kind: DocumentKindEnum,
  number: z.string().nullish(),
  issuedOn: z.string(),
  counterparty: z.string().nullish(),
  supplierId: z.string().uuid().nullish(),
  stockIntakeId: z.string().uuid().nullish(),
  direction: MovementDirectionEnum,
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

/** `money_document_balance` görünümü — belgenin açık kalanı, bağlı hareketlerden türetilir. */
export const MoneyDocumentBalanceSchema = z.object({
  documentId: z.string().uuid(),
  amountCents: z.number().int(),
  /** Belgeyle aynı yöndeki bağlı hareketlerin toplamı eksi ters yöndekiler (**cent**). */
  settledCents: z.number().int(),
  /** `amount − settled`; eksi çıkabilir (fazla ödeme) ve gizlenmez. */
  openAmountCents: z.number().int(),
});
export type MoneyDocumentBalance = z.infer<typeof MoneyDocumentBalanceSchema>;

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

// ── Etiket sözlüğü (13.09) ───────────────────────────────────────────────────
// Yönetilen liste: operatör ekler, yazım tek kalır; hareket ve belge yalnız buradaki slug'ı taşır.

/** Slug biçimi — ASCII, küçük harf; `ortak:ahmet` gibi iki nokta ayracı serbest. Veritabanı kısıtıyla aynı. */
export const MOVEMENT_TAG_SLUG = /^[a-z0-9][a-z0-9:-]*$/;

export const MovementTagSchema = z.object({
  slug: z.string().regex(MOVEMENT_TAG_SLUG),
  label: z.string(),
  /** Pasif etiket yeni harekete verilmez, eski hareketlerde kalır. */
  isActive: z.boolean(),
  createdAt: z.string(),
});
export type MovementTag = z.infer<typeof MovementTagSchema>;

export const MovementTagInsertSchema = z.object({
  slug: z.string().regex(MOVEMENT_TAG_SLUG),
  label: z.string().min(1),
  isActive: z.boolean().optional(),
});
export type MovementTagInsert = z.infer<typeof MovementTagInsertSchema>;

export const MovementTagUpdateSchema = MovementTagSchema.partial().required({ slug: true });
export type MovementTagUpdate = z.infer<typeof MovementTagUpdateSchema>;
