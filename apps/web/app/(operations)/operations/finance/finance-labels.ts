import type { AccountType, DocumentKind, MovementDirection, MovementType } from '@lezzet/types';
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
  /* 13.09: ortağın şirketle hesabı. Bakiye işareti anlatır — eksi "şirket ortağa borçlu", artı
     "ortak şirkete borçlu" (şema künyesi). */
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
 * İZAH hâli (13.09) — satırın ne olduğu biliniyor mu: bir bağ (sipariş, mal kabul, tedarikçi),
 * bir belge, bir etiket ya da transfer.
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

/**
 * Elle giriş diyaloğunun üç kipi — adı ve ne olduğunu söyleyen tek satırlık ipucu.
 *
 * İpucu süs değil: "sermaye" ile "sınıflandırılmamış" arasındaki fark bir muhasebe bilgisi ve
 * ekranı kullanan her zaman muhasebeci değil (`requireFinance` yöneticiyi de içeri alıyor). Seçim
 * yanlış yapılırsa para doğru yere girer ama raporda yanlış kovaya düşer — sessiz bir hata.
 */
// `MANUAL_TYPE_VIEW` FORMUN yanına taşındı (`movement-form/schema`, 22.11) — tür seçicisini artık
// iki yüzey çiziyor ve etiketin tek tanımı olmalı.

// Hızlı gider kategorileri KALKTI (13.09): sınıflandırma sözlükten etiketle yapılıyor
// (`movement_tag`), çipler veritabanından okunan `tagOptions` ile geliyor — kodda sabit liste yok.

/**
 * Motorun reddi (`validateMovement`) → operatörün cümlesi.
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
  unknown_tag: 'Etiket sözlükte yok — önce Etiketler penceresinden ekleyin.',
  vat_over_amount: 'KDV tutarı belge toplamını aşamaz; toplam KDV dâhildir.',
  not_found: 'Belge bulunamadı — başka bir oturumda silinmiş olabilir.',
  wrong_key: 'Yüklenen dosya bu belgeye ait değil — yeniden yükleyin.',
  unsupported_type: 'Yalnız PDF ve fotoğraf (JPG, PNG, WEBP, HEIC) yüklenebilir.',
  storage_unavailable: 'Belge deposu bu ortamda tanımlı değil — belge kaydedildi, dosyası sonra yüklenebilir.',
} as const;

/** Etiket kapısının reddi → operatörün cümlesi. */
export const TAG_REASON = {
  bad_label: 'Etiket adı boş olamaz.',
  exists: 'Bu etiket zaten sözlükte.',
  not_found: 'Etiket bulunamadı — sayfayı tazeleyin.',
  unknown_tag: 'Etiket sözlükte yok ya da pasif — önce Etiketler penceresinden ekleyin.',
} as const;

/** Eşleştirme kapısının reddi. Üçü de "geç kaldın" sınıfı: satır artık dokunulabilir değil. */
export const RECONCILE_REASON = {
  already_reconciled: 'Bu satır zaten eşleştirilmiş — sayfayı tazeleyin.',
  not_bank_row: 'Bu satır banka dosyasından gelmiyor; eşleştirme kuyruğu yalnız ekstre satırları içindir.',
  not_found: 'Satır bulunamadı — başka bir oturumda değişmiş olabilir.',
} as const;
