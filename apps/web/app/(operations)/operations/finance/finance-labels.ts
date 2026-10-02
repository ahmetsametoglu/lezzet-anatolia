import type { AccountType, CounterpartyKind, MovementDirection, MovementType } from '@lezzet/types';
import { DOCUMENT_VAT_PROBLEM_LABEL } from '@/components/operation/form/document-form/labels';
import type { OpsTone } from '@/components/operation/ui/tone';

// Para ekranının sözlüğü: iç terim arayüze çıkmaz ("MoneyMovement" değil "hareket", "reconciled" değil "eşleşti"). Sözlük tek
// dosyada durur ki yeni tip ekleyen ham terimi burada görsün.

/**
 * Hareketin sebebi, operatörün diliyle. `misc` "sair" değil "sınıflandırılmadı"dır: sair kapanmış bir kutu olurdu, oysa banka
 * satırının sebebi henüz söylenmemiştir ve eşleştirme kuyruğu bir iş kuyruğu gibi okunmalı.
 */
export const MOVEMENT_TYPE_LABEL: Record<MovementType, string> = {
  order_payment: 'sipariş ödemesi',
  order_refund: 'iade',
  purchase: 'stok alımı',
  expense: 'gider',
  transfer: 'transfer',
  capital: 'sermaye',
  misc: 'sınıflandırılmadı',
};

/** Süzgeç seçeneği — cümle içinde değil tek başına durduğu için büyük harfle başlar. */
export const MOVEMENT_TYPE_CHIP: Record<MovementType, string> = {
  order_payment: 'Sipariş ödemesi',
  order_refund: 'İade',
  purchase: 'Stok alımı',
  expense: 'Gider',
  transfer: 'Transfer',
  capital: 'Sermaye',
  misc: 'Sınıflandırılmamış',
};

/**
 * Süzgeç sırası `MovementTypeEnum.options` değil, anlamın sırası: düzenli akış, işletme giderleri, içeriden hareketler, en sonda
 * `misc`. Enum'a bırakılsaydı yeni bir tip ekranın sırasını sessizce değiştirirdi.
 */
export const MOVEMENT_TYPE_ORDER = [
  'order_payment',
  'order_refund',
  'purchase',
  'expense',
  'transfer',
  'capital',
  'misc',
] as const satisfies readonly MovementType[];

/**
 * Hesap türü — arayüzde "tip" demiyoruz, çünkü aynı ekranda hareketin de bir tipi var ve iki ayrı
 * şeye aynı adı vermek süzgeç barında karışırdı.
 */
export const ACCOUNT_TYPE_LABEL: Record<AccountType, string> = {
  cash: 'Nakit kasa',
  bank: 'Banka',
  provider: 'Ödeme sağlayıcı',
  // Ortağın şirketle hesabı, ortağın tek kaydı; bakiye işareti ekranda cümleyle değil renkle anlatılır.
  partner: 'Ortak cari',
};

/** Hesap bakiyelerinin grup başlıkları; çoğul, çünkü grubun adıdır, tek hesabın değil. */
export const ACCOUNT_GROUP_LABEL: Record<AccountType, string> = {
  bank: 'Bankalar',
  cash: 'Kasalar',
  provider: 'Ödeme sağlayıcılar',
  partner: 'Ortak carileri',
};

/**
 * Hesap rengi; kasa, banka ve sağlayıcı bir bakışta ayrışsın diye. Sağlayıcı `violet` değil `slate`, çünkü `violet` bu yüzeyde
 * "makine konuştu" (yapay zekâ önerisi) demektir.
 */
export const ACCOUNT_TONE: Record<AccountType, OpsTone> = {
  cash: 'olive',
  bank: 'blue',
  provider: 'slate',
  // Ortak carisi nötr: para değil, bir KİŞİYLE hesap — hesap renklerinin hiçbirine ait değil.
  partner: 'neutral',
};

/**
 * İzah hâli: satırın ne olduğu biliniyor mu (bir bağ, bir belge bağı ya da bir tür); etiket izah değildir, serbest işarettir.
 * "Mutabık" değil "izahlı", çünkü muhasebecinin sorusu "bu satır ne?"dir ve banka bayrağı sistemin yazdığı satırda anlamsızdır.
 */
export const EXPLAINED_LABEL = {
  explained: 'izahlı',
  unexplained: 'izah bekliyor',
} as const;

/**
 * Eşleştirme önerisinin gücü, "Karşılığı" hapının tonu: yeşil güçlü aday (tek dokunuşla onay), amber çoklu aday (menüden seç),
 * gri önerisiz (elle bağla). Üç hâlin eylemi ayrıdır ki güçlü aday tek dokunuşla geçsin.
 */
export const SUGGESTION_VIEW = {
  strong: { tone: 'olive' },
  ambiguous: { tone: 'amber' },
  none: { tone: 'neutral' },
} as const satisfies Record<string, { tone: OpsTone }>;

export type SuggestionStrength = keyof typeof SUGGESTION_VIEW;

/**
 * Eşleştirme hedefinin türü, seçim penceresinin bölüm başlıkları: her banka hareketinin bir karşılığı olmalı. `transfer_to`
 * ekranın eklediği yoldur (ucu olmayan transfer), `counterparty` belgesi olmayan satırın kimin olduğunu söyler.
 */
export const MATCH_KIND_LABEL = {
  order: 'Sipariş tahsilatı',
  refund: 'Müşteri iadesi',
  document: 'Açık belge',
  intake: 'Mal kabul — tedarikçi borcu',
  transfer: 'Transferin öteki yakası',
  transfer_to: 'Başka hesaba transfer',
  provisional: 'Zaten yazılmış hareket',
  counterparty: 'Cari',
} as const;

export type MatchKindView = keyof typeof MATCH_KIND_LABEL;

/**
 * Onaylanınca NE OLUR — kartın cümlesi hedefin adını bununla tamamlar ("Fatura FA-… · belgeye
 * bağlanır, açık kalanı düşer"). Operatör düğmeye basmadan sonucu okur; "onayla"nın sürprizi olmaz.
 */
export const MATCH_EFFECT: Record<MatchKindView, string> = {
  order: 'siparişin tahsilatı olur, açık tutarı kapatır',
  refund: 'siparişin iadesi olarak yazılır',
  document: 'belgeye bağlanır, açık kalanı düşer',
  intake: 'mal kabulün ödemesi olur, tedarikçi borcu düşer',
  transfer: 'transferin karşı satırı olur — para iki kez sayılmaz',
  transfer_to: 'karşı hesaba aynalanan bir transfer olur',
  provisional: 'elle yazılan satırın yerine geçer — o satır silinir, bağları buraya taşınır',
  counterparty: 'carinin satırı olur; varsayılan türü varsa tür de konur',
};

/** Hareketin kaynağı — satırın tip hücresinde tipin yanında okunur ("gider · ekstre"). */
export const MOVEMENT_SOURCE_LABEL = {
  bank_import: 'ekstre',
  manual: 'elle',
  system: 'sistem',
} as const;

/** Belgenin hâli — açık kalanından türer: borç sürüyor, kapandı ya da fazla ödendi. */
export const DOCUMENT_STATE_LABEL = {
  open: 'açık',
  settled: 'kapandı',
  overpaid: 'fazla ödendi',
} as const;

/** Carinin türü — seçicide ve sözlükte grup başlığı. */
export const COUNTERPARTY_KIND_LABEL: Record<CounterpartyKind, string> = {
  institution: 'Kurum',
  service: 'Hizmet veren',
  employee: 'Çalışan',
  other: 'Diğer',
};

/** Türün yönü — sözlükte "bu tür hangi paranın türü": `null` iki yön. */
export const NATURE_DIRECTION_LABEL: Record<MovementDirection | 'both', string> = {
  out: 'Gider (çıkan para)',
  in: 'Gelir (giren para)',
  both: 'İki yön',
};

/**
 * Ekranın "burada olmayan"ları — tasarım §6'nın yasakları, operatöre CÜMLEYLE söyleniyor.
 *
 * Düğmeyi gizleyip susmak yerine sebebini yazmak, aynı soruyu ikinci kez sormayı keser: "sipariş
 * tahsilatını neden elle giremiyorum" sorusunun cevabı ekranda yoksa, operatör onu `misc` olarak
 * girer ve sipariş ile para kaydı sessizce ayrışır.
 */
export const NOTES = {
  manualEntryScope:
    'Sipariş tahsilatları buradan girilmez — online ödeme, kapıda tahsilat ve kurye gün kapanışı kendi akışlarından düşer. Elle giriş gider, transfer ve sermaye içindir.',
  emptyLedger:
    'Henüz hareket yok. İlk tahsilat, gider ya da banka dosyası girdiğinde liste burada dolmaya başlar.',
  allMatched: 'Eşleşme bekleyen banka satırı yok.',
  noOpenDocuments: 'Açık belge yok — girilen her fatura ve bordronun ödemesi bağlanmış.',
  noLedgerMatch: 'Bu süzgeçlerle hareket yok — tarih aralığını genişletin ya da süzgeci kaldırın.',
  noDocuments: 'Henüz belge yok. Fatura, fiş ya da bordro geldiğinde "Eylemler → Belge ekle" ile girilir; ödemesi sonra bağlanır.',
  noDocumentMatch: 'Bu tarih aralığında belge yok.',
  noBankFile:
    'Banka dosyası yüklenmedi. Dosyayı yükleyince satırlar buraya düşer; sistem eşleşme önerir, kararı siz verirsiniz.',
} as const;

/** Hesabı olmayan bir kurulumda ekranın ilk cümlesi — boş liste değil, kurulum daveti. */
export const NO_ACCOUNTS =
  'Henüz hesap tanımlı değil. Para bir hesapta durur: kasa, banka ve Stripe aynı kavramın örnekleridir — ilkini ekleyerek başlayın.';

/**
 * Motorun ve tür kapısının reddi (`validateMovement` · `natureProblemOf`) → operatörün cümlesi; ham anahtar kimseye bir
 * şey söylemez ve cümle motorun değil operatörün kelimesiyle kurulur. Sözlük tek yerde durur ki aynı ret iki diyalogda iki
 * cümleyle karşılanmasın.
 */
export const INVALID_REASON = {
  amount_not_positive: 'Tutar sıfırdan büyük olmalı.',
  direction_mismatch: 'Bu tür için paranın yönü sabit — gider çıkış, sermaye giriştir.',
  transfer_needs_counter: 'Transferde paranın gittiği hesap da seçilmeli.',
  transfer_same_account: 'Aynı hesabın içinde transfer olmaz — iki farklı hesap seçin.',
  counter_on_non_transfer: 'Karşı hesap yalnız transferde olur.',
  order_link_missing: 'Sipariş tahsilatı ve iadesi buradan girilmez — kendi akışından düşer.',
  supply_link_missing: 'Stok alımı bir mal kabule bağlanmalı — Tedarik ekranından girilir.',
  unknown_nature: 'Seçilen tür sözlükte yok ya da pasif — Sözlük penceresinden bakın.',
  nature_direction: 'Bu tür paranın bu yönüne uymuyor — gider türü giren paraya konmaz.',
  nature_not_applicable: 'Sipariş parası, stok alımı ve transfer tür almaz — onları bağları açıklar.',
} as const;

// Belge türünün, yönünün ve KDV rejiminin adları ortak belge formunda (`document-form/labels.ts`): asistan kuyruğu da aynı formu
// açıyor ve kardeş sayfadan içe aktaramaz (`STACK §7`).

/** Belge kapısının reddi → operatörün cümlesi. */
export const DOCUMENT_REASON = {
  unknown_tag: 'Etiket sözlükte yok ya da pasif — Sözlük penceresinden bakın.',
  unknown_nature: 'Seçilen tür sözlükte yok ya da pasif — Sözlük penceresinden bakın.',
  nature_direction: 'Bu tür belgenin yönüne uymuyor — bize ödenecek belgeye gider türü konmaz.',
  unknown_counterparty: 'Seçilen cari bulunamadı ya da pasif — sayfayı tazeleyin.',
  party_conflict: 'Belgenin karşı tarafı ya bir cari ya bir tedarikçidir — ikisi birden olmaz.',
  not_found: 'Belge bulunamadı — başka bir oturumda silinmiş olabilir.',
  wrong_key: 'Yüklenen dosya bu belgeye ait değil — yeniden yükleyin.',
  unsupported_type: 'Yalnız PDF ve fotoğraf (JPG, PNG, WEBP, HEIC) yüklenebilir.',
  storage_unavailable: 'Belge deposu bu ortamda tanımlı değil — belge kaydedildi, dosyası sonra yüklenebilir.',
  ...DOCUMENT_VAT_PROBLEM_LABEL,
  due_before_issue: 'Vade belgenin tarihinden önce olamaz.',
  link_conflict: 'Belge ya bir mal kabulün ya bir tedarik siparişinin faturasıdır — ikisi birden olmaz.',
  link_needs_supplier: 'Mal kabulün ya da siparişin faturası bir tedarikçinin belgesidir — önce tedarikçiyi seçin.',
  link_not_found: 'Seçilen mal kabul ya da sipariş bulunamadı — sayfayı tazeleyin.',
  link_supplier_mismatch: 'Seçilen mal kabul ya da sipariş başka bir tedarikçinin — belgenin tedarikçisiyle aynı olmalı.',
  link_has_document: 'Bu mal kabulün ya da siparişin faturası zaten girilmiş.',
} as const;

/** Belge bağı kapısının reddi → operatörün cümlesi. */
export const ALLOCATION_REASON = {
  not_found: 'Hareket ya da belge bulunamadı — sayfayı tazeleyin.',
  direction_mismatch: 'Belgenin yönü paranın yönüne uymuyor — bizim ödeyeceğimiz belgeyi çıkan para kapatır.',
  already_allocated: 'Bu hareket bu belgeye zaten bağlı.',
  nothing_to_allocate: 'Hareketin bağlanacak kalanı yok — tutarın tamamı başka belgelere bağlanmış.',
  document_settled: 'Belgenin açık kalanı yok — ödemesi zaten tamamlanmış.',
} as const;

/** Etiket kapısının reddi → operatörün cümlesi. */
export const TAG_REASON = {
  bad_label: 'Etiket adı boş olamaz.',
  exists: 'Bu etiket zaten sözlükte.',
  not_found: 'Etiket bulunamadı — sayfayı tazeleyin.',
  unknown_tag: 'Etiket sözlükte yok ya da pasif — Sözlük penceresinden bakın.',
} as const;

/** Tür kapısının reddi → operatörün cümlesi. */
export const NATURE_REASON = {
  bad_label: 'Tür adı boş olamaz.',
  exists: 'Bu tür zaten sözlükte.',
  not_found: 'Tür bulunamadı — sayfayı tazeleyin.',
  bad_code: 'Hesap kodu yalnız rakam olur, 2–8 hane (ör. 613).',
  unknown_nature: INVALID_REASON.unknown_nature,
  nature_direction: INVALID_REASON.nature_direction,
  nature_not_applicable: INVALID_REASON.nature_not_applicable,
} as const;

/** Cari kapısının reddi → operatörün cümlesi. */
export const COUNTERPARTY_REASON = {
  bad_name: 'Cari adı boş olamaz.',
  exists: 'Bu adla bir cari zaten var.',
  not_found: 'Cari ya da hareket bulunamadı — sayfayı tazeleyin.',
  unknown_nature: 'Varsayılan tür sözlükte yok — Sözlük penceresinden bakın.',
  unknown_counterparty: 'Seçilen cari bulunamadı ya da pasif — sayfayı tazeleyin.',
  party_taken: 'Bu hareketin karşı tarafı bir tedarikçi — cari ayrıca konmaz.',
} as const;

/**
 * Eşleştirme kapısının reddi; ilk üçü "geç kaldın" sınıfıdır (satır dokunulabilir hâlde değil), kalanlar hedefin satıra
 * uymadığını söyler.
 */
export const RECONCILE_REASON = {
  already_reconciled: 'Bu satır zaten eşleştirilmiş — sayfayı tazeleyin.',
  not_bank_row: 'Bu satır banka dosyasından gelmiyor; eşleştirme kuyruğu yalnız ekstre satırları içindir.',
  not_found: 'Satır bulunamadı — başka bir oturumda değişmiş olabilir.',
  direction_mismatch: 'Hedefin yönü satıra uymuyor — giren para iade ya da gider, çıkan para tahsilat ya da sermaye olamaz.',
  target_not_found: 'Seçilen hedef bulunamadı ya da artık açık değil — sayfayı tazeleyin.',
  target_taken: 'Bu transfer ucunu başka bir ekstre satırı zaten sahiplenmiş — sayfayı tazeleyin.',
  same_account: 'Aynı hesabın içinde transfer olmaz — başka bir hesap seçin.',
  document_settled: ALLOCATION_REASON.document_settled,
  already_allocated: ALLOCATION_REASON.already_allocated,
} as const;

/** Okunamayan ekstre satırının sebebi — sayısı ve sebebi söylenir, dosya sessizce eksik alınmaz. */
export const ROW_FAILURE_LABEL = {
  bad_date: 'tarih okunamadı',
  bad_amount: 'tutar okunamadı',
  zero_amount: 'tutar sıfır',
  missing_column: 'sütun eksik',
} as const;

/** Tarih düzeni — dosyanın gününü ayından ayıran kural; Fransız bankaları gün-ay-yıl yazar. */
export const DATE_FORMAT_LABEL = {
  dmy: 'Gün / ay / yıl (12/09/2026)',
  ymd: 'Yıl-ay-gün (2026-09-12)',
  mdy: 'Ay / gün / yıl (09/12/2026)',
} as const;
