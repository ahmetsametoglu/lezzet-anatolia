import type { Account, AccountLedgerRow, Counterparty, MoneyDocument, MovementDirection, MovementNature, MovementTag } from '@lezzet/types';
import type { OpsTone } from '@/components/operation/ui/tone';
import type { CounterpartyOption, NatureOption, TagOption } from '@/components/operation/form/movement-form/schema';
import type { SupplierOption } from '@/components/operation/form/document-form/schema';
import type { MatchTarget } from '@/lib/bank/reconcile';
import type { MatchKindView, SuggestionStrength } from './finance-labels';
import type { FinanceUrlState } from './finance-url';

// Para ekranının görünüm modeli: veride duran alan şemadan `Pick`'lenir, hesaplanan alan yanına yazılır. DB alanı görünüm için
// elle yeniden yazılmaz, çünkü ikinci tanım şemadan ayrışır.

/**
 * Hesap kartı: bakiye şeridinin hücresi ve hesap süzgeci. `balanceCents` hesabın alanı değil, `account_balance` görünümünden gelir,
 * çünkü bakiye saklanmaz, hareketlerden türer.
 */
export type AccountView = Pick<Account, 'id' | 'name' | 'type' | 'isActive'> & {
  balanceCents: number;
  movementCount: number;
  tone: OpsTone;
};

/**
 * Defter satırı. `signedAmountCents` görünümden gelir ve ekranda hesaplanmaz, çünkü transferin karşı ucunda işaret hareketin yönüne
 * değil, satırın hangi hesabın defterinde durduğuna bağlıdır.
 */
export type MovementRowView = Pick<
  AccountLedgerRow,
  | 'id'
  | 'ledgerAccountId'
  | 'valueDate'
  | 'type'
  | 'direction'
  | 'explained'
  | 'nature'
  | 'counterpartyId'
  | 'tags'
  | 'signedAmountCents'
  | 'amountCents'
  | 'description'
  | 'source'
  | 'reconciled'
  | 'matchedElsewhere'
> & {
  /** Operatörün okuduğu cümle — açıklama yoksa tipin adı (boş hücre bırakmaktansa). */
  title: string;
  /**
   * Açıklamanın altındaki ipucu: kampanya ya da izah sorusu. `null` ise alt satır çizilmez, çünkü "—" ipucu olmamasını eksiklik gibi
   * gösterirdi.
   */
  ref: string | null;
  /** Cümlenin tonu: bir kayda gidiyorsa `olive`, cevap bekliyorsa `amber`, düz bilgiyse `neutral`. */
  refTone: OpsTone;
  /** Satırın bağı, "Karşılığı" sütununda düz yazı: sipariş, mal kabul, tedarikçi ya da karşı hesap. */
  link: { text: string; tone: OpsTone } | null;
  accountName: string;
  /** Kaba tip: "gider", "transfer"; tür ve etiketler satırın kendi hücresinde okunur. */
  typeLabel: string;
  /** Satır tür alır mı — sipariş parası, stok alımı ve transfer almaz (motor: `acceptsNature`). */
  canClassify: boolean;
  /** Türün okunur adı — pasif tür seçicide yoktur ama satırda adıyla okunmalı. */
  natureLabel: string | null;
  /** Carinin adı; pasif cari de adıyla okunur. */
  counterpartyName: string | null;
  /** Bağlı belgeler, künyesi ve bağın tutarıyla. */
  documents: Array<{ id: string; label: string; amountCents: number }>;
  /** Belgelere bağlanmamış kalan (**cent**) — "Karşılığı" hapının "bağlı / tutar"ı. */
  remainingCents: number;
  /** Ekstreden mi geldi — geri alma ve bağın kaldırılması bu ayrıma göre çizilir. */
  fromBank: boolean;
  /** Ekstre satırının cevabı geri alınabilir mi: mutabık, belgeye bağlı ya da carisi konmuş. */
  canUnmatch: boolean;
  /** Mutabık olmayan ekstre satırının önerisinin gücü, "Karşılığı" hapının tonu; öteki satırlarda `null`. */
  suggestion: MatchRowView['strength'] | null;
  /** En iyi adayın adı, "Karşılığı" hapının "öneri: …"su. */
  suggestionTitle: string | null;
  /** Güçlü önerinin hedefi; satırın ✓'si tek dokunuşla uygular. */
  suggestionTarget: MatchTarget | null;
};

/**
 * Defter satırının kimliği `(id, ledgerAccountId)` çiftidir, çünkü `account_movement` transferi iki hesabın defterinde aynı `id`'li
 * iki satır olarak verir. Anahtar tek yerde kurulur; iki listede elle birleştirilen anahtar ayrışırdı.
 */
export function ledgerRowKey(row: Pick<MovementRowView, 'id' | 'ledgerAccountId'>): string {
  return `${row.id}:${row.ledgerAccountId}`;
}

/** Satırın öneri görünümü — banka satırı + sistemin önerisi (eşleştirme menüsünün "Öneriler"i). */
export interface MatchRowView {
  movementId: string;
  /** Bankanın kendi yazdığı satır ("VIREMENT 8829 LEROY") — sadeleştirilmeden gösterilir. */
  bankLine: string;
  signedAmountCents: number;
  /** Satırın bağlanmamış kalanı; belgeye kısmen bağlanan satır kuyrukta kalanıyla durur. */
  remainingCents: number;
  /** Satırın yönü — seçim penceresi yalnız bu yöne uyan hedefleri listeler. */
  direction: MovementDirection;
  valueDate: string;
  strength: SuggestionStrength;
  /** Önerinin cümlesi — güçlü adayda ne yapacağını da söyler ("…belgeye bağlanır, açık kalanı düşer"). */
  sentence: string;
  /** Onaya gidecek adaylar; `strength === 'none'` iken boş. */
  candidates: MatchCandidateView[];
}

/**
 * Eşleştirme hedefi, seçim penceresinin bir satırı; `target` kapının alacağı karardır ve olduğu gibi gönderilir. Satır kimlik yerine
 * ad okur, çünkü UUID gösteren seçim penceresi okunamaz.
 */
export interface MatchTargetView {
  kind: MatchKindView;
  /** `${kind}:${id}` — öneri ile hedef listesi aynı anahtarla buluşur. */
  key: string;
  target: MatchTarget;
  title: string;
  detail: string;
  /** Hedefin kapattığı banka yönü; `null` = iki yöne de uyar (başka hesaba transfer, cari). */
  direction: MovementDirection | null;
}

export interface MatchCandidateView extends MatchTargetView {
  /** 0–1 arası puan (motorun kendi ölçüsü) — çoklu adayda hangisinin önde olduğunu gösterir. */
  score: number;
  /**
   * "Neden bu aday" — motorun `reasons` alanının insan diline çevrilmiş, en güçlü iki maddesi.
   * Seçim ekranında ayırt edici olan şey tutar değil (adayların hepsi aynı tutara uyduğu için
   * çoklu aday oldular) — ayıran şey tam olarak bu sebeplerdir.
   */
  reasons: string[];
}

/** Listenin hâli. */
export type LedgerState = 'ready' | 'empty';

export interface LedgerView {
  state: LedgerState;
  rows: MovementRowView[];
  /** Sonraki sayfanın imleci (JSON metni) — adrese yazılmaz, "devamını yükle" action'ına gider. */
  nextCursor: string | null;
  /** `empty` hâlinde ekranın basacağı cümle — "hiç yok" ile "bu süzgeçte yok" ayrı cümlelerdir. */
  note: string | null;
}

/**
 * Belge satırı: Belgeler sekmesinin satırı ve "Ödemesini yaz" formunun künyesi. `openAmountCents` belgenin alanı değil,
 * `money_document_balance` görünümünden gelir, çünkü açık kalan saklanmaz, bağlarından türer.
 */
export type DocumentRowView = Pick<
  MoneyDocument,
  | 'id'
  | 'kind'
  | 'number'
  | 'issuedOn'
  | 'dueOn'
  | 'direction'
  | 'nature'
  | 'counterpartyId'
  | 'supplierId'
  | 'tags'
  | 'note'
  | 'amountCents'
  | 'vatAmountCents'
  | 'vatRegime'
> & {
  kindLabel: string;
  /** Karşı tarafın adı, cari ya da tedarikçi; yoksa `null`. */
  partyName: string | null;
  natureLabel: string | null;
  openAmountCents: number;
  hasFile: boolean;
  /** "FA-2026-0912 · Cabinet Muller · açık 360,00 €" — ödeme formunun üstünde okunan künye. */
  label: string;
  /** Pennylane durumu, satırın alt satırının sonunda; eşitleme Pennylane'e bağlanamadıysa ya da belge kapsam dışıysa `null`. */
  pennylane: { text: string; tone: OpsTone } | null;
};

export interface DocumentListView {
  rows: DocumentRowView[];
  nextCursor: string | null;
  note: string | null;
}

/** Hareketin eşleştirme menüsü, `matchOptionsAction`ın cevabı. */
export interface MatchOptionsView {
  /** Satırın öneri görünümü — kuyruk kartıyla AYNI (güç, cümle, adaylar, kalan). */
  row: MatchRowView;
  targets: MatchTargetView[];
  /** Eşleşme bekleyen ekstre satırı mı — seçim kuyruğun kapısına mı gider, belge bağına mı. */
  bankRow: boolean;
}

/** Belgenin bir ödemesi (bağ) — ödeme menüsünde, hareketin künyesiyle. */
export interface PaymentView {
  movementId: string;
  title: string;
  valueDate: string;
  accountName: string;
  /** Bağın tutarı — hareketin tamamı değil (bir havale birkaç faturayı kapatabilir). */
  amountCents: number;
  movementAmountCents: number;
  /** Elle yazılan hareketin bağı tek tek kaldırılır; ekstre satırınınki "Eşleşmeyi geri al" ile çözülür. */
  removable: boolean;
}

/** Belgenin ödeme adayı — kalanı olan, belgenin yönündeki hareket. */
export interface PaymentCandidateView {
  movementId: string;
  title: string;
  valueDate: string;
  accountName: string;
  direction: MovementDirection;
  /** Hareketin henüz bağlanmamış kalanı — bağ bundan ve belgenin açık kalanından küçüğü olur. */
  remainingCents: number;
  /** Motorun puanı; `0` = eşiği geçmedi (listede durur, sırada geride). */
  score: number;
  reasons: string[];
}

export interface DocumentPaymentsView {
  openAmountCents: number;
  payments: PaymentView[];
  candidates: PaymentCandidateView[];
}

/** Sözlük penceresinin listeleri, pasifler dâhil: pasif kayıt geri açılabilsin diye listede durur; seçicilere yalnız aktifler gider. */
export interface DictionaryView {
  natures: Array<Pick<MovementNature, 'slug' | 'label' | 'direction' | 'accountCode' | 'isActive'>>;
  counterparties: Array<Pick<Counterparty, 'id' | 'name' | 'kind' | 'keywords' | 'defaultNature' | 'defaultBusiness' | 'isActive'>>;
  tags: Array<Pick<MovementTag, 'slug' | 'label' | 'isActive'>>;
}

export interface FinanceData {
  accounts: AccountView[];
  /** Hesapların toplamı — şeridin "Toplam" kartı. */
  totalCents: number;
  /** Hareketler sekmesinin ilk sayfası; Belgeler sekmesindeyken `null` — görünmeyen liste okunmaz. */
  ledger: LedgerView | null;
  /** Belgeler sekmesinin ilk sayfası; Hareketler sekmesindeyken `null`. */
  documents: DocumentListView | null;
  /** Açık belge sayısı — Belgeler sekmesinin rozeti: ödenmemiş fatura bir iştir. */
  openDocumentCount: number;
  /** Belge formunun tedarikçi seçeneği: yalnız aktifler, ülkesi ve vadesiyle (rejim ve vade önerisi). */
  supplierOptions: SupplierOption[];
  /** Tür seçenekleri, yalnız aktifler; seçici satırın yönüyle süzsün diye yönü de taşır. */
  natureOptions: NatureOption[];
  /** Serbest etiketler — yalnız AKTİF: pasif etiket yeni harekete verilmez. */
  tagOptions: TagOption[];
  /** Cariler, yalnız aktifler; varsayılan türüyle, seçilince boş türe önerilir. */
  counterpartyOptions: CounterpartyOption[];
  /** Sözlük penceresi — pasifler dâhil. */
  dictionary: DictionaryView;
  /** İzah edilmemiş hareket sayısı; `null` sayaç yok demektir, sıfır değil, çünkü "0 izahsız" dolu kuyruğu boş okuturdu. */
  unexplainedCount: number | null;
}

/**
 * Açık diyalog, `null` hiçbiri: `document` belge girişi, `dictionary` tür · cari · etiket sözlüğü, `bankImport` dosya yükleme.
 * `movement` ile `transfer` aynı penceredir, ikincisi onu transfer kipinde açar.
 */
export type DialogKind = 'movement' | 'transfer' | 'document' | 'dictionary' | 'bankImport' | 'account' | null;

/** Satırın yazım sözleşmesi: ortadaki hücrenin seçenekleri ve kapıları (`useRowWrites`); pasif etiketin adı sözlüğün tamamından. */
export interface RowEditor {
  natureOptions: NatureOption[];
  counterpartyOptions: CounterpartyOption[];
  tagOptions: TagOption[];
  /** Bütün etiketlerin adı (pasifler dâhil) — satır pasif etiketi taşımaya devam eder. */
  tagLabels: ReadonlyMap<string, string>;
  onSetNature: (movementId: string, nature: string | null) => Promise<boolean>;
  onSetCounterparty: (movementId: string, counterpartyId: string | null) => Promise<boolean>;
  onTag: (movementId: string, tags: string[]) => Promise<boolean>;
  onCreateTag: (label: string) => Promise<string | null>;
}

/**
 * İki cihaz görünümünün ortak sözleşmesi. `finance-client.tsx`'te durmaz, çünkü client → desktop → client döngüsü `no-circular`
 * ihlalidir.
 */
export interface FinanceViewProps {
  data: FinanceData;
  urlState: FinanceUrlState;
  /** Elle giriş ve transfer diyaloglarının hesap seçicisi — pasif hesap yeni harekete kapalı. */
  writableAccounts: AccountView[];
  navPending: boolean;
  dialog: DialogKind;
  busyId: string | null;
  onFilter: (next: Partial<FinanceUrlState>) => void;
  onOpenDialog: (kind: DialogKind) => void;
  onCloseDialog: () => void;
  onSaved: () => void;
  // ── Satırın düzenlemesi: söz `false` dönerse kapı reddetti, sebep şeritte ──
  onSetNature: (movementId: string, nature: string | null) => Promise<boolean>;
  onSetCounterparty: (movementId: string, counterpartyId: string | null) => Promise<boolean>;
  /** Etiketler — menünün her dokunuşu listenin yeni hâlini yazar (Kaydet yok). */
  onTag: (movementId: string, tags: string[]) => Promise<boolean>;
  /** Yeni etiket sözlüğe girer, anahtarı döner (var olan ad da anahtarını döndürür); başarısızsa `null`. */
  onCreateTag: (label: string) => Promise<string | null>;
  /** Ekstre satırının eşleşmesini geri alır — satır kuyruğa döner. */
  onUnmatch: (movementId: string) => void;
  /** Elle yazılmış satırın belge bağını kaldırır. */
  onRemoveAllocation: (movementId: string, documentId: string) => void;
  /** Satırın kararı ("Karşılığı" hapı ya da ✓); ekstre satırı kapının hedefine gider. */
  onApplyTarget: (movementId: string, target: MatchTarget) => Promise<boolean>;
  /** Hareket ↔ belge bağı: hareket satırının hapı ve belge satırının "Ödeme bağla"sı. */
  onLinkDocument: (movementId: string, documentId: string) => Promise<boolean>;
  /** Hangi satır beklemede (geri alma, bağ kaldırma) — iki kez tıklanmasın. */
  rowBusyId: string | null;
  /** Satırın son reddi — listenin üstünde okunur. */
  rowError: string | null;

  // ── Listeler: ilk sayfa sunucudan, devamı action ile eklenir ──
  movementRows: MovementRowView[];
  documentRows: DocumentRowView[];
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;

  // ── Belge ──
  /** "Ödemesini yaz" — belge seçildi, elle hareket formu belgeyle dolu açılır. */
  payingDocument: DocumentRowView | null;
  onPayDocument: (document: DocumentRowView) => void;
  onClosePay: () => void;
  /** Belge dosyasını yeni sekmede açar — okuma adresi tıklanınca istenir, süresi kısa. */
  onOpenDocumentFile: (document: DocumentRowView) => void;
}
