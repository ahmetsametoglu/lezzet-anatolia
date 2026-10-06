import { z } from 'zod';
import { BusinessEnum, CurrencyEnum, PaymentMethodEnum } from '../primitives/enums.schema';

// Para ve ön muhasebe (DOMAIN §9): para bir hesapta durur ve hareketlerle girer-çıkar; bakiye saklanmaz, `account_movement`
// görünümünden türer, çünkü saklanan sayaç kayar. "Neyin parası" tek bir türdür (`nature`), "kime/kimden" cari ya da
// tedarikçidir; etiket izah sayılmaz, belge bağı tutarıyla ayrı tabloda durur.

/**
 * Paranın durduğu yer; çevrim içi tahsilat da bir hesaptır (sağlayıcı). `partner` ortak cari hesabıdır: ortakla şirket arasındaki
 * her para buradan geçer, bakiyenin işareti borcun yönünü söyler (eksi şirket ortağa, artı ortak şirkete borçlu).
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
 * Hareketin sebebi. Yön çoğunlukla sebepten türer ve ilişki motorda tanımlıdır (`domain-core/money.expectedDirection`), kural
 * değişirse tek yerde değişsin diye.
 */
export const MovementTypeEnum = z.enum([
  'order_payment', // sipariş tahsilatı
  'order_refund', // müşteriye iade
  'purchase', // stok alımı (StockIntake bağı)
  'expense', // kira/akaryakıt/maaş… (`nature` ile ayrışır)
  'transfer', // hesaplar arası: nakit→banka, kart ödemeleri→banka aktarımı
  'capital', // sermaye girişi
  'misc',
]);
export type MovementType = z.infer<typeof MovementTypeEnum>;

/**
 * Reklam giderinin türü; kampanya kârlılık raporu bunu süzer. Sabit tek yerde, çünkü iki yerde yazılsaydı biri değişince rapor
 * hata vermeden boşalırdı (`movement_nature.slug = 'reklam'`).
 */
export const ADVERTISING_NATURE = 'reklam';

/**
 * Kart ödemesi komisyonunun türü: webhook ödeme başına komisyonu havuzdan bu türle düşer, kârlılık komisyonu siparişin
 * `paymentFee` alanından okur (`movement_nature.slug = 'kart-komisyonu'`).
 */
export const CARD_FEE_NATURE = 'kart-komisyonu';

/**
 * Sermayenin türü: girişte seçilince hareket `capital` tipine geçer (`classificationTypeOf`); öteki türler çıkışta `expense`,
 * girişte `misc` olur (`movement_nature.slug = 'sermaye'`).
 */
export const CAPITAL_NATURE = 'sermaye';

/**
 * Hareketi kim yazdı: operatör (`manual`), banka dosyası (`bank_import`) ya da sistemin kendisi (`system`: webhook, kapıda
 * tahsilat, hızlı satış, payout). Üçüncüsü olmadan sistemin yazdığı tahsilat elle girilmiş satırdan ayırt edilemezdi.
 */
export const MovementSourceEnum = z.enum(['manual', 'bank_import', 'system']);
export type MovementSource = z.infer<typeof MovementSourceEnum>;

export const MoneyMovementSchema = z.object({
  id: z.string().uuid(),
  accountId: z.string().uuid(),
  direction: MovementDirectionEnum,
  /**
   * **Cent** (STACK §8); kolon `money_movement.amount` euro `numeric`. İşaretsizdir, yön `direction`dadır; işaretli hâli defter
   * satırında (`signedAmountCents`).
   */
  amountCents: z.number().int(),
  type: MovementTypeEnum,
  /** Tür, "bu para neyin parası": `movement_nature.slug`, tek. Sipariş parası, stok alımı ve transferde boştur, bağın kendisi söyler. */
  nature: z.string().nullable(),
  /** Cari — paranın kime gittiği ya da kimden geldiği; tedarikçiyse `supplierId` dolar, bu değil. */
  counterpartyId: z.string().uuid().nullable(),
  /** Etiketler — serbest işaret (`movement_tag.slug`), birden çok; izah sayılmaz. */
  tags: z.array(z.string()),
  /** Ek künye — reklam giderinde `{campaign}`, sağlayıcı tahsilatında `{providerRef}`. */
  meta: z.record(z.unknown()).nullable(),
  /** Transferde karşı hesap. Transfer tek satırdır, karşı hesaba ters işaretle yansır (görünüm). */
  counterAccountId: z.string().uuid().nullable(),
  orderId: z.string().uuid().nullable(),
  /**
   * Sipariş parasının yöntemi; kapıda nakit ve kart aynı kasa hesabına girdiği için hesaptan okunamaz, sertifikalı kasa ise ikisini
   * ayrı ister. `null` = bilinmiyor, kasaya tahminle yazılmaz.
   */
  paymentMethod: PaymentMethodEnum.nullable(),
  stockIntakeId: z.string().uuid().nullable(),
  /** Tedarikçiye ödemeyse — tedarikçi borcu bundan türetilir (Σ giriş − Σ ödeme). */
  supplierId: z.string().uuid().nullable(),
  /** İş, türetilir: belge bağı, tedarikçi, cari, sonra hesap; tetikleyici kurar, gönderilen değer ezilir. */
  business: BusinessEnum,
  /** Paranın gerçekten hareket ettiği gün; kayıt günü (`createdAt`) ondan farklı olabilir. */
  valueDate: z.string(),
  description: z.string().nullable(),
  source: MovementSourceEnum,
  /** Banka ekstresiyle eşleşti mi; yalnız `bank_import` satırında anlamlıdır, "izah edildi mi" sorusu `explained`tir. */
  reconciled: z.boolean(),
  /**
   * İzah, türetilir: sipariş, mal kabul ya da tedarikçi bağı, transfer, tür ya da belge bağı varsa `true`;
   * tetikleyici kurar, gönderilen değer ezilir. Yoksa hareket "izah edilmemiş" kuyruğundadır ama kayıt geçerlidir.
   */
  explained: z.boolean(),
  /** Banka satırının üretilmiş kimliği, aynı satır iki kez yazılmasın diye. Elle girilen harekette `null`: iki kez 20 € girmek meşrudur. */
  importFingerprint: z.string().nullable(),
  /**
   * Yazımın kimliği: istemcide üretilir, cevabı kaybolan istek tekrarlanınca veritabanı ikinci yazımı reddeder
   * (`money_movement_idempotency_key`). Tekilliği küreseldir, hesap başına tekil `importFingerprint`in yerine geçmez; `null`
   * korumasız yazımdır.
   */
  idempotencyKey: z.string().nullable(),
  bankImportId: z.string().uuid().nullable(),
  /** Karşı uç: bu ekstre satırı şu transferin öteki yakasıdır. Bağlanınca ayna susar (`account_movement`), para iki kez sayılmaz. */
  counterpartMovementId: z.string().uuid().nullable(),
  /** Muhasebe yazılımında bizde olmayan bir faturaya eşli; izah saymaz, çünkü belgesi bizde girilmelidir. */
  matchedElsewhere: z.boolean(),
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
  paymentMethod: PaymentMethodEnum.nullish(),
  stockIntakeId: z.string().uuid().nullish(),
  supplierId: z.string().uuid().nullish(),
  valueDate: z.string().optional(),
  description: z.string().nullish(),
  source: MovementSourceEnum.optional(),
  reconciled: z.boolean().optional(),
  importFingerprint: z.string().nullish(),
  /** Yazımın kimliği, künyesi varlık şemasında; verilmezse yazım korumasızdır. */
  idempotencyKey: z.string().nullish(),
  bankImportId: z.string().uuid().nullish(),
  counterpartMovementId: z.string().uuid().nullish(),
});
export type MoneyMovementInsert = z.infer<typeof MoneyMovementInsertSchema>;

/** `explained` ve `business` türetilmiş kolonlardır, güncelleme gövdesine giremez; tetikleyici yeniden kurar. */
export const MoneyMovementUpdateSchema = MoneyMovementSchema.omit({ explained: true, business: true }).partial().required({ id: true });
export type MoneyMovementUpdate = z.infer<typeof MoneyMovementUpdateSchema>;

/**
 * `account_movement` görünümünün satırı: hareket dokunduğu her hesapta bir satır üretir (transfer iki hesabı birden etkiler).
 * `signedAmount` işaret kuralının tek uygulamasıdır; bakiye de ekstre de onun üstünde durur.
 */
export const AccountLedgerRowSchema = MoneyMovementSchema.extend({
  /** Satırın ait olduğu hesap — transferde `accountId`'den farklı olabilir. */
  ledgerAccountId: z.string().uuid(),
  /** Bu hesap için işaretli tutar (**cent**): girişte +, çıkışta −; transferin karşı ucunda ters. */
  signedAmountCents: z.number().int(),
});
export type AccountLedgerRow = z.infer<typeof AccountLedgerRowSchema>;

/**
 * `record_order_movement` / `resync_order_amounts` dönüşü; tutarlar hareketlerden yeniden hesaplanır, kaçırılan ya da tekrarlanan
 * çağrı kalıcı sapma bırakmasın diye artırılmaz.
 */
export const OrderAmountsSchema = z.object({
  ok: z.boolean(),
  movementId: z.string().uuid().optional(),
  /**
   * Bu çağrı yeni hareket yazmadı, aynı anahtarla yazılmış hareketin sonucu döndü; tutarlar yine defterin o anki hâlidir. Yalnız
   * sipariş parasını yazan RPC ürettiği için isteğe bağlıdır.
   */
  deduped: z.boolean().optional(),
  // RPC euro döndürür; cent'e çevrim servis sınırında (`rpcMoneyToCents`, STACK §8).
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

// ── Belge ────────────────────────────────────────────────────────────────────
// Belge para değildir: fatura gelince borç doğar, ödeme sonra hareket olarak gelir ve tutarıyla belgeye bağlanır
// (`MoneyAllocation`). Açık kalan saklanmaz, `money_document_balance` görünümünden türer.

/** Belge türü — kapalı küme; `other` bir kaçış kutusu değil, "bu beşten hiçbiri" demektir. */
export const DocumentKindEnum = z.enum(['invoice', 'receipt', 'payslip', 'contract', 'statement', 'other']);
export type DocumentKind = z.infer<typeof DocumentKindEnum>;

/**
 * Gelen belgenin KDV rejimi; alan, çünkü "KDV 0" standart belgede sıfır KDV ile ters yüklemeyi (autoliquidation) ayırt edemezdi.
 * Satışın `VatTreatmentEnum`ından ayrıdır: o kestiğimiz faturanın sorusu, bu gelen belgenin.
 */
export const DocumentVatRegimeEnum = z.enum(['standard', 'reverse_charge', 'exempt']);
export type DocumentVatRegime = z.infer<typeof DocumentVatRegimeEnum>;

/** Gelen belgede geçen Fransız KDV oranları (yüzde), seçicinin sırasıyla; küme veri kısıtında da var (`money_document_vat_lines`). */
export const DocumentVatRateSchema = z.union([z.literal(5.5), z.literal(10), z.literal(20), z.literal(2.1)]);
export type DocumentVatRate = z.infer<typeof DocumentVatRateSchema>;
export const DOCUMENT_VAT_RATES: readonly DocumentVatRate[] = DocumentVatRateSchema.options.map((option) => option.value);

/**
 * KDV kırılımının bir satırı: oran başına KDV hariç tutar ve KDV (**cent**). Ters yüklemede KDV sıfırdır, oran beyandaki orandır;
 * jsonb içinde durduğu için anahtarlar çevrilmez.
 */
export const DocumentVatLineSchema = z.object({
  vatRate: DocumentVatRateSchema,
  netCents: z.number().int().positive(),
  vatCents: z.number().int().nonnegative(),
});
export type DocumentVatLine = z.infer<typeof DocumentVatLineSchema>;

export const MoneyDocumentSchema = z.object({
  id: z.string().uuid(),
  kind: DocumentKindEnum,
  /** Belge numarası — faturada var, fiş ve bordroda olmayabilir. */
  number: z.string().nullable(),
  /** Belgenin kendi tarihi (ISO gün). */
  issuedOn: z.string(),
  /** Vade — ödemenin son günü; belgede yazmıyorsa `null`. Belge gününden önce olamaz (veri kısıtı). */
  dueOn: z.string().nullable(),
  /** Karşı taraf: cari (kiraya veren, çalışan, kurum) — tedarikçiyse `supplierId`; ikisinden en çok biri. */
  counterpartyId: z.string().uuid().nullable(),
  supplierId: z.string().uuid().nullable(),
  /**
   * Stok alımının faturası mal kabule ya da tedarik siparişine bağlanır (en çok biri, ikisi de tedarikçi ister). Borç bu belgeden
   * türer, çünkü kabulün satır toplamı KDV hariçtir ve nakliyeyi bilmez; belgeli kabul borca ikinci kez girmez.
   */
  stockIntakeId: z.string().uuid().nullable(),
  /** Faturası mal gelmeden kesilen sipariş: siparişin kabulleri bu belgeyle borçlanır. */
  purchaseOrderId: z.string().uuid().nullable(),
  /** Belgenin işi; belge bölünmez, ödemesinin işi de buradan gelir. */
  business: BusinessEnum,
  /** `out` = bizim ödeyeceğimiz (gelen fatura, bordro), `in` = bize ödenecek (tedarikçi iadesi). */
  direction: MovementDirectionEnum,
  /** Belgenin türü — ödemesi bağlanınca harekete de geçer (hareketin türü boşsa). */
  nature: z.string().nullable(),
  /** **Cent** (STACK §8); kolon `amount` euro. Belgenin toplamı, KDV dahil; kırılım varsa satırlarının toplamıdır. */
  amountCents: z.number().int(),
  /** KDV kırılımı, belgenin KDV'sinin tek kaynağı; boş dizi = belgede KDV yazmıyor. */
  vatLines: z.array(DocumentVatLineSchema),
  /** KDV toplamı (**cent**), kırılımdan türer (üretilmiş kolon); satırsız belgede `null`, sıfır "KDV yok" demektir. */
  vatAmountCents: z.number().int().nullable(),
  /** KDV rejimi — ters yüklemede satırın KDV'si sıfır, muaf belgede satır yok (veri kısıtı `money_document_vat_regime`). */
  vatRegime: DocumentVatRegimeEnum,
  currency: CurrencyEnum,
  /** Dosyanın ÖZEL kovadaki anahtarı (`r2Keys.financeDocument`); yoksa belge yalnız künyedir. */
  fileKey: z.string().nullable(),
  /** Serbest etiketler — sınıflandırma `nature`dadır. */
  tags: z.array(z.string()),
  note: z.string().nullable(),
  createdAt: z.string(),
});
export type MoneyDocument = z.infer<typeof MoneyDocumentSchema>;

export const MoneyDocumentInsertSchema = z.object({
  kind: DocumentKindEnum,
  number: z.string().nullish(),
  issuedOn: z.string(),
  dueOn: z.string().nullish(),
  counterpartyId: z.string().uuid().nullish(),
  supplierId: z.string().uuid().nullish(),
  stockIntakeId: z.string().uuid().nullish(),
  purchaseOrderId: z.string().uuid().nullish(),
  business: BusinessEnum,
  direction: MovementDirectionEnum,
  nature: z.string().nullish(),
  amountCents: z.number().int().positive(),
  vatLines: z.array(DocumentVatLineSchema).optional(),
  vatRegime: DocumentVatRegimeEnum.optional(),
  currency: CurrencyEnum.optional(),
  fileKey: z.string().nullish(),
  tags: z.array(z.string()).optional(),
  note: z.string().nullish(),
});
export type MoneyDocumentInsert = z.infer<typeof MoneyDocumentInsertSchema>;

/** Belge kapısının girdisi: iş seçilmediyse kapı tedarikçinin ya da carinin varsayılanından kurar. */
export const MoneyDocumentEntrySchema = MoneyDocumentInsertSchema.extend({ business: BusinessEnum.nullish() });
export type MoneyDocumentEntry = z.infer<typeof MoneyDocumentEntrySchema>;

/** `vatAmountCents` üretilmiş kolondur, yazılamaz. */
export const MoneyDocumentUpdateSchema = MoneyDocumentSchema.omit({ vatAmountCents: true }).partial().required({ id: true });
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

// ── Belge bağı ───────────────────────────────────────────────────────────────

/**
 * Hareket ↔ belge bağı, tutarıyla: bir havale birkaç faturayı, bir fatura birkaç ödemeyi kapatabilir. Bağlar hareketin tutarını
 * aşamaz (tetikleyici); kapı tutarı hareketin kalanı ile belgenin açık kalanının küçüğünden kurar, fazla ödeme harekette kalır.
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
 * `stock_intake_balance` görünümü: mal kabulün açık kalanı, kabul tutarından kabule bağlı alım ödemeleri düşülür. Faturası belge
 * olarak girilen kabul `hasDocument` taşır, borcu belgede görünür ve burada ikinci kez sayılmaz.
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
  /** Kabulün kendisine ya da siparişine bağlı bir belge var mı — varsa borç belgenin açık kalanındadır. */
  hasDocument: z.boolean(),
  /** Kabulün notu — irsaliye/fatura numarası orada durur; banka satırı onu anarsa referans eşleşmesi. */
  note: z.string().nullable(),
});
export type StockIntakeBalance = z.infer<typeof StockIntakeBalanceSchema>;

// ── Sözlükler ────────────────────────────────────────────────────────────────
// Tür ve etiket yönetilen listelerdir: operatör ekler, yazım tek kalır; hareket yalnız buradaki slug'ı taşır.

/** Tür ve etiket slug'ının biçimi — ASCII, küçük harf, tire. Veritabanı kısıtıyla aynı cümle. */
export const DICTIONARY_SLUG = /^[a-z0-9][a-z0-9-]*$/;

/** Tür — "bu para neyin parası"; hareketin ve belgenin tek sınıflandırması. */
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

/** Etiket — serbest işaret, izah sayılmaz. */
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

// ── Cari ─────────────────────────────────────────────────────────────────────
// Paranın kime gittiği / kimden geldiği: kurum, hizmet veren, çalışan. Tedarikçi burada değil (stok modülünün `supplier`ı), ortak
// da değil (ortağın kaydı cari hesabıdır).

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
  /** Belgelerinin ve hareketlerinin varsayılan işi; iki işle çalışan caride `null`. */
  defaultBusiness: BusinessEnum.nullable(),
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
  defaultBusiness: BusinessEnum.nullish(),
  note: z.string().nullish(),
  isActive: z.boolean().optional(),
});
export type CounterpartyInsert = z.infer<typeof CounterpartyInsertSchema>;

export const CounterpartyUpdateSchema = CounterpartySchema.partial().required({ id: true });
export type CounterpartyUpdate = z.infer<typeof CounterpartyUpdateSchema>;
