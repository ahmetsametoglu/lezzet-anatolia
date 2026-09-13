import type { AccountType, CounterpartyKind, DocumentKind, MovementDirection, MovementType } from '@lezzet/types';
import type { OpsTone } from '@/components/operation/ui/tone';

// Para ekranının SÖZLÜĞÜ. Tasarımın §6 kuralı burada zorlanıyor ve tezgâh sözleşmesi onu aynen
// tekrarlıyor: **iç terim arayüze çıkmaz** — "MoneyMovement", "reconciled", "BankImportProfile"
// değil; "hareket", "eşleşti/eşleşmedi", "banka şablonu". Sözlüğün tek dosyada durması bunu
// denetlenebilir kılıyor: yeni bir tip eklerken adı buraya yazmak zorunda kalan kişi, ham terimi
// de burada görür.

/**
 * Hareketin SEBEBİ — operatörün diliyle.
 *
 * `misc` "sair" DEĞİL, **"sınıflandırılmadı"**: muhasebe dilinde "sair" kapanmış bir kutudur ("bu
 * kadar, gerisi önemsiz"), oysa buradaki `misc` açık bir sorudur — banka satırı içeri girmiştir,
 * sebebi henüz söylenmemiştir (12.4'ün kuralı: *"banka 'para girdi' der, sebebini söylemez"*).
 * Kapanmış bir adla anılsaydı eşleştirme kuyruğu bir iş kuyruğu gibi okunmazdı.
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
 * Süzgeç SIRASI — `MovementTypeEnum.options` DEĞİL.
 *
 * Enum sırası bir veri kararıdır (şemadaki yazım sırası) ve ekranı bağlamaz. Burada sıra anlam
 * taşıyor: önce paranın düzenli akışı (tahsilat · iade), sonra işletme giderleri (alım · gider),
 * sonra içeriden hareketler (transfer · sermaye), en sonda cevabı olmayan (`misc`). Enum'a
 * bırakılsaydı yeni bir tip eklendiğinde ekranın sırası da sessizce değişirdi.
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
  /* 13.09: ortağın şirketle hesabı — ortağın TEK kaydı. Bakiye işareti anlatır: eksi "şirket ortağa
     borçlu", artı "ortak şirkete borçlu" (şema künyesi). */
  partner: 'Ortak cari',
};

/**
 * Hesap rengi — kasa/banka/sağlayıcı bir bakışta ayrışsın diye.
 *
 * **Sağlayıcı `violet` DEĞİL `slate`** ve bu bir renk zevki değil, kural: `violet` bu yüzeyde
 * "makine konuştu" demektir (AI çevirisi, AI önerisi). Stripe bir makine değil bir hesap; mor
 * verseydik operatör aynı rengi iki ayrı anlamda okumak zorunda kalırdı. Tasarımın mavi-moru
 * (`#6a5acd`) bu yüzden `slate`e iniyor — bilinçli sapma, `design/BACKLOG` kaydı var.
 */
export const ACCOUNT_TONE: Record<AccountType, OpsTone> = {
  cash: 'olive',
  bank: 'blue',
  provider: 'slate',
  // Ortak carisi nötr: para değil, bir KİŞİYLE hesap — hesap renklerinin hiçbirine ait değil.
  partner: 'neutral',
};

/**
 * İZAH hâli (13.09) — satırın ne olduğu biliniyor mu: bir bağ (sipariş, mal kabul, tedarikçi,
 * transfer), bir belge bağı ya da bir TÜR. Etiket izah değildir (ikinci karar): serbest işarettir.
 *
 * Nokta bir tur banka mutabakat bayrağını okuyordu ("eşleşti/eşleşmedi") ve o bayrak yalnız ekstre
 * satırında anlam taşıdığı için sistemin kendi yazdığı her tahsilat "eşleşmedi" görünüyordu.
 * "Mutabık" DEĞİL "izahlı": muhasebecinin sorusu budur — *bu satır ne?*
 */
export const EXPLAINED_LABEL = {
  explained: 'izahlı',
  unexplained: 'izah bekliyor',
} as const;

/**
 * Eşleştirme önerisinin GÜCÜ — tezgâh sözleşmesinin üç hâli: *"yeşil rozet güçlü aday (onayla),
 * amber çoklu aday (seç), gri önerisiz (elle bağla)"*.
 *
 * Üçünün eylem adı da farklı ve bu kasıtlı: aynı düğmeye üç ayrı iş yüklenirse operatör güçlü
 * adayı da "seçmek" zorunda sanır, tek tıkla geçilebilecek satırda durup düşünür.
 */
export const SUGGESTION_VIEW = {
  strong: { label: 'güçlü aday', tone: 'olive', action: '✓ Onayla' },
  ambiguous: { label: 'çoklu aday', tone: 'amber', action: 'Seç' },
  none: { label: 'öneri yok', tone: 'neutral', action: 'Elle bağla' },
} as const satisfies Record<string, { label: string; tone: OpsTone; action: string }>;

export type SuggestionStrength = keyof typeof SUGGESTION_VIEW;

/**
 * Eşleştirme HEDEFİNİN türü (12.13 · kullanıcı kararı 13.09: "her banka hareketinin bir karşılığı
 * olmalı") — seçim penceresinin bölüm başlıkları. `transfer_to` motorun türü değil, ekranın
 * eklediği yol: ucu olmayan transfer ("bu para kasaya çekildi"). `counterparty` (13.09 · ikinci
 * karar): belgesi olmayan satırın KİMİN olduğu.
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

/** Carinin türü (13.09) — seçicide ve sözlükte grup başlığı. */
export const COUNTERPARTY_KIND_LABEL: Record<CounterpartyKind, string> = {
  institution: 'Kurum',
  service: 'Hizmet veren',
  employee: 'Çalışan',
  other: 'Diğer',
};

/** Türün yönü (13.09) — sözlükte "bu tür hangi paranın türü": `null` iki yön. */
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
  noBankFile:
    'Banka dosyası yüklenmedi. Dosyayı yükleyince satırlar buraya düşer; sistem eşleşme önerir, kararı siz verirsiniz.',
} as const;

/** Hesabı olmayan bir kurulumda ekranın ilk cümlesi — boş liste değil, kurulum daveti. */
export const NO_ACCOUNTS =
  'Henüz hesap tanımlı değil. Para bir hesapta durur: kasa, banka ve Stripe aynı kavramın örnekleridir — ilkini ekleyerek başlayın.';

// `MANUAL_TYPE_VIEW` FORMUN yanına taşındı (`movement-form/schema`, 22.11) — tür seçicisini artık
// iki yüzey çiziyor ve etiketin tek tanımı olmalı.

// Hızlı gider kategorileri KALKTI (13.09): sınıflandırma sözlükten TÜRLE yapılıyor (`movement_nature`),
// seçenekler veritabanından okunan `natureOptions` ile geliyor — kodda sabit liste yok.

/**
 * Motorun ve tür kapısının reddi (`validateMovement` · `natureProblemOf`) → operatörün cümlesi.
 *
 * Ret sebepleri ham anahtar olarak gösterilemez ("direction_mismatch" kimseye bir şey söylemez),
 * ama cümlelerin **motorun kelimeleriyle** kurulması da yanlış olurdu: operatör "yön" diye
 * düşünmüyor, "para girdi mi çıktı mı" diye düşünüyor. Sözlük bu çeviriyi tek yerde tutuyor —
 * aynı ret iki ayrı diyalogda iki ayrı cümleyle karşılansaydı, aynı kural iki kurala benzerdi.
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

/** Belge türü — operatörün diliyle (12.12). `other` "sair" değil "bu beşten hiçbiri". */
export const DOCUMENT_KIND_LABEL: Record<DocumentKind, string> = {
  invoice: 'Fatura',
  receipt: 'Fiş',
  payslip: 'Bordro',
  contract: 'Sözleşme',
  statement: 'Dekont',
  other: 'Diğer belge',
};

/** Belgenin yönü — "kime borçluyuz / kim bize borçlu" diliyle, `in/out` değil. */
export const DOCUMENT_DIRECTION_LABEL: Record<MovementDirection, string> = {
  out: 'Biz ödeyeceğiz',
  in: 'Bize ödenecek',
};

/** Belge kapısının reddi → operatörün cümlesi. */
export const DOCUMENT_REASON = {
  unknown_tag: 'Etiket sözlükte yok ya da pasif — Sözlük penceresinden bakın.',
  unknown_nature: 'Seçilen tür sözlükte yok ya da pasif — Sözlük penceresinden bakın.',
  nature_direction: 'Bu tür belgenin yönüne uymuyor — bize ödenecek belgeye gider türü konmaz.',
  unknown_counterparty: 'Seçilen cari bulunamadı ya da pasif — sayfayı tazeleyin.',
  party_conflict: 'Belgenin karşı tarafı ya bir cari ya bir tedarikçidir — ikisi birden olmaz.',
  vat_over_amount: 'KDV tutarı belge toplamını aşamaz; toplam KDV dâhildir.',
  not_found: 'Belge bulunamadı — başka bir oturumda silinmiş olabilir.',
  wrong_key: 'Yüklenen dosya bu belgeye ait değil — yeniden yükleyin.',
  unsupported_type: 'Yalnız PDF ve fotoğraf (JPG, PNG, WEBP, HEIC) yüklenebilir.',
  storage_unavailable: 'Belge deposu bu ortamda tanımlı değil — belge kaydedildi, dosyası sonra yüklenebilir.',
} as const;

/** Belge bağı kapısının reddi (13.09 · bağ tutarıyla) → operatörün cümlesi. */
export const ALLOCATION_REASON = {
  not_found: 'Hareket ya da belge bulunamadı — sayfayı tazeleyin.',
  direction_mismatch: 'Belgenin yönü paranın yönüne uymuyor — bizim ödeyeceğimiz belgeyi çıkan para kapatır.',
  already_allocated: 'Bu hareket bu belgeye zaten bağlı.',
  nothing_to_allocate: 'Hareketin bağlanacak kalanı yok — tutarın tamamı başka belgelere bağlanmış.',
  document_settled: 'Belgenin açık kalanı yok — ödemesi zaten tamamlanmış.',
  over_movement: 'Bağ tutarı hareketin kalanını aşıyor.',
} as const;

/** Etiket kapısının reddi → operatörün cümlesi. */
export const TAG_REASON = {
  bad_label: 'Etiket adı boş olamaz.',
  exists: 'Bu etiket zaten sözlükte.',
  not_found: 'Etiket bulunamadı — sayfayı tazeleyin.',
  unknown_tag: 'Etiket sözlükte yok ya da pasif — Sözlük penceresinden bakın.',
} as const;

/** Tür kapısının reddi (13.09) → operatörün cümlesi. */
export const NATURE_REASON = {
  bad_label: 'Tür adı boş olamaz.',
  exists: 'Bu tür zaten sözlükte.',
  not_found: 'Tür bulunamadı — sayfayı tazeleyin.',
  bad_code: 'Hesap kodu yalnız rakam olur, 2–8 hane (ör. 613).',
  unknown_nature: INVALID_REASON.unknown_nature,
  nature_direction: INVALID_REASON.nature_direction,
  nature_not_applicable: INVALID_REASON.nature_not_applicable,
} as const;

/** Cari kapısının reddi (13.09) → operatörün cümlesi. */
export const COUNTERPARTY_REASON = {
  bad_name: 'Cari adı boş olamaz.',
  exists: 'Bu adla bir cari zaten var.',
  not_found: 'Cari ya da hareket bulunamadı — sayfayı tazeleyin.',
  unknown_nature: 'Varsayılan tür sözlükte yok — Sözlük penceresinden bakın.',
  unknown_counterparty: 'Seçilen cari bulunamadı ya da pasif — sayfayı tazeleyin.',
  party_taken: 'Bu hareketin karşı tarafı bir tedarikçi — cari ayrıca konmaz.',
} as const;

/**
 * Eşleştirme kapısının reddi. İlk üçü "geç kaldın" sınıfı (satır artık dokunulabilir değil);
 * kalanlar hedefin satıra uymadığını söyler (12.13 · 13.09).
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

/** Okunamayan ekstre satırının sebebi (12.10) — sayısı ve sebebi söylenir, dosya sessizce eksik alınmaz. */
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
