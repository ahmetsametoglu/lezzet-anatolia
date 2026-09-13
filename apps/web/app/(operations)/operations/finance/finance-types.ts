import type { Account, AccountLedgerRow, Counterparty, MoneyDocument, MovementDirection, MovementNature, MovementTag } from '@lezzet/types';
import type { OpsTone } from '@/components/operation/ui/tone';
import type { CounterpartyOption, NatureOption, TagOption } from '@/components/operation/form/movement-form/schema';
import type { MatchTarget } from '@/lib/bank/reconcile';
import type { MatchKindView, SuggestionStrength } from './finance-labels';
import type { FinanceUrlState } from './finance-url';

// Para ekranının GÖRÜNÜM MODELİ. Kural (CLAUDE.md §1): view-model şemadan TÜRETİLİR —
// `View = Entity & { extra }`. Veride duran alan `Pick`'lenir, hesaplanan alan yazılır; DB alanları
// görünüm için elle yeniden yazılmaz (müşteri ekranının O9 dersi).

/**
 * Hesap kartı — bakiye şeridinin satırı.
 *
 * `balanceCents` hesabın kendi alanı DEĞİL, `account_balance` görünümünden gelir: bakiye saklanmaz,
 * hareketlerden türetilir. Bu yüzden `Account`a `Pick` ile değil, yanına eklenerek konuyor.
 */
export type AccountView = Pick<Account, 'id' | 'name' | 'type' | 'isActive'> & {
  balanceCents: number;
  movementCount: number;
  tone: OpsTone;
};

/**
 * Defter satırı — hareket tablosunun bir satırı.
 *
 * **`signedAmountCents` görünümden gelir, ekranda HESAPLANMAZ.** İşaret kuralının tek uygulaması
 * `account_movement`tir (servisin künyesi: *"kural iki yere yazılmaz"*); ekran `direction`a bakıp
 * kendi eksisini koysaydı transferin karşı ucunda yanılırdı — orada işaret ters ve sebebi hareketin
 * yönü değil, satırın hangi hesabın defterinde durduğu.
 *
 * ── SATIR KENDİ YERİNDE DÜZENLENİR (13.09 · kullanıcı bulgusu) ─────────────
 * Tür seçici, etiket menüsü, belge bağı ve "eşleşmeyi geri al" satırın üstünde. Bir tur satır salt
 * okunurdu ve verilen cevap geri alınamıyordu ("eşleştirmeyle ilgili düzenleme yapamıyorum").
 */
export type MovementRowView = Pick<
  AccountLedgerRow,
  'id' | 'ledgerAccountId' | 'valueDate' | 'type' | 'direction' | 'explained' | 'nature' | 'counterpartyId' | 'tags' | 'signedAmountCents'
> & {
  /** Operatörün okuduğu cümle — açıklama yoksa tipin adı (boş hücre bırakmaktansa). */
  title: string;
  /**
   * Satırın neye bağlı olduğu: "sipariş LZA-26-7K4M2P" · "belge: FA-2026-0912" · "öneri bekliyor".
   * `null` ise alt satırda bağ cümlesi çizilmez — "—" yazmak, bağ olmamasını bir eksiklik gibi gösterirdi.
   */
  ref: string | null;
  /** Bağın tonu: bir kayda gidiyorsa `olive`, cevap bekliyorsa `amber`, düz bilgiyse `neutral`. */
  refTone: OpsTone;
  accountName: string;
  /** Kaba tip — "gider", "transfer". Tür ve etiketler satırın kendi seçicilerinde okunur (13.09). */
  typeLabel: string;
  /** Satır tür alır mı — sipariş parası, stok alımı ve transfer almaz (motor: `acceptsNature`). */
  canClassify: boolean;
  /** Türün okunur adı — pasif tür seçicide yoktur ama satırda adıyla okunmalı. */
  natureLabel: string | null;
  /** Carinin adı (13.09) — aynı gerekçe: pasif cari de adıyla okunur. */
  counterpartyName: string | null;
  /** Bağlı belgeler (13.09 · bağ ayrı tabloda) — künyesiyle. */
  documents: Array<{ id: string; label: string }>;
  /** Ekstreden mi geldi — geri alma ve bağın kaldırılması bu ayrıma göre çizilir. */
  fromBank: boolean;
  /** Ekstre satırının cevabı geri alınabilir mi: mutabık, belgeye bağlı ya da carisi konmuş. */
  canUnmatch: boolean;
};

/**
 * Defter satırının KİMLİĞİ — `id` tek başına değil, `(id, ledgerAccountId)` ÇİFTİ.
 *
 * Ölçüldü (06.08, kullanıcı bildirimi — React "iki çocuk aynı anahtarla" uyarısı): `account_movement`
 * bir transferi İKİ satır olarak veriyor (gönderen hesabın defteri + alanın defteri) ve ikisinin
 * `id`'si aynı hareketin kimliği. Hesap süzgeci yokken ("Tüm hesaplar") her iki bacak da aynı listede
 * duruyor, yani `id` orada tekil DEĞİL. Görünümün künyesi bunu zaten söylüyordu: *"bir hareket
 * dokunduğu her hesapta bir satır üretir: normal hareket bir, transfer iki."*
 *
 * Satırdan `id`'yi ATMADIM ve atmamalıyım: o gerçek bir hareket kimliği ve mutabakat eylemi onunla
 * çalışıyor. Eksik olan ikinci yarısıydı; anahtar bu yüzden burada, tek yerde kuruluyor — iki listede
 * elle birleştirilseydi biri bir gün ötekinden ayrışırdı.
 */
export function ledgerRowKey(row: Pick<MovementRowView, 'id' | 'ledgerAccountId'>): string {
  return `${row.id}:${row.ledgerAccountId}`;
}

/** Eşleştirme kuyruğunun kartı — banka satırı + sistemin önerisi. */
export interface MatchRowView {
  movementId: string;
  /** Bankanın kendi yazdığı satır ("VIREMENT 8829 LEROY") — sadeleştirilmeden gösterilir. */
  bankLine: string;
  signedAmountCents: number;
  /**
   * Satırın BAĞLANMAMIŞ kalanı (13.09 · bağ tutarıyla) — belgeye kısmen bağlanan satır kuyrukta
   * kalanıyla durur; tamamı açıksa tutarın kendisi.
   */
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
 * Eşleştirme HEDEFİ (12.13 · 13.09) — seçim penceresinin bir satırı: sipariş, açık belge, mal kabul,
 * transfer ucu, başka hesap, o hesaba zaten yazılmış hareket ya da cari.
 *
 * `target` kapının aldığı kararın kendisidir (`MatchTarget`), ekran onu olduğu gibi gönderir;
 * `title`/`detail` operatörün okuduğu iki satır. Kimlik yerine ad: UUID gösteren bir seçim
 * penceresi okunamaz.
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

/**
 * Listenin hâli.
 *
 * Bir tur ÜÇÜNCÜ bir hâl vardı (`blocked`: veri var, ekran hazır, okuma kapısı yok) ve işini
 * gördü — "hiç hareket yok" ile "hepsini gösteremiyorum" farklı cümlelerdir, ikincisini birincisi
 * gibi göstermek dolu bir kasayı boş göstermek olurdu. Kapı gelince (`LedgerFilter.accountId`
 * isteğe bağlı oldu) hâl kendiliğinden ölü kaldı ve silindi: geçici bir dürüstlük aracıydı,
 * kalıcı bir kavram değil.
 */
export type LedgerState = 'ready' | 'empty';

export interface LedgerView {
  state: LedgerState;
  rows: MovementRowView[];
  nextCursor: string | null;
  /** `empty` hâlinde ekranın basacağı cümle. */
  note: string | null;
}

/**
 * Açık belge kartı (12.12) — ödenmemiş fatura, bordro ya da bize ödenecek dekont.
 *
 * `openAmountCents` belgenin alanı DEĞİL, `money_document_balance` görünümünden gelir: açık kalan
 * saklanmaz, bağlarından türetilir. `label` "Ödemesini yaz" formunun üstünde okunan künye.
 */
export type OpenDocumentView = Pick<MoneyDocument, 'id' | 'kind' | 'number' | 'issuedOn' | 'direction' | 'nature' | 'counterpartyId' | 'tags'> & {
  kindLabel: string;
  /** Karşı tarafın ADI (13.09) — cari ya da tedarikçi; yoksa `null`. */
  partyName: string | null;
  amountCents: number;
  openAmountCents: number;
  hasFile: boolean;
  label: string;
};

/**
 * Sözlük penceresinin listeleri (13.09) — PASİFLER DÂHİL: pasif tür, cari ya da etiket geri
 * açılabilsin diye listede durur; seçicilere yalnız aktifler gider (`FinanceData.*Options`).
 */
export interface DictionaryView {
  natures: Array<Pick<MovementNature, 'slug' | 'label' | 'direction' | 'accountCode' | 'isActive'>>;
  counterparties: Array<Pick<Counterparty, 'id' | 'name' | 'kind' | 'keywords' | 'defaultNature' | 'isActive'>>;
  tags: Array<Pick<MovementTag, 'slug' | 'label' | 'isActive'>>;
}

export interface FinanceData {
  accounts: AccountView[];
  /** Hesapların toplamı — şeridin "Toplam" hücresi. */
  totalCents: number;
  ledger: LedgerView;
  /** Eşleşme bekleyen banka satırları. Hesap seçili değilken boş (kuyruk hesaba bağlı). */
  queue: MatchRowView[];
  /**
   * Seçim penceresinin hedef listesi (12.13): açık belgeler, ödenmemiş kabuller, bekleyen transfer
   * uçları, o hesaba zaten yazılmış hareketler, penceredeki satışlar, öteki hesaplar, cariler.
   * Öneriler bu listenin puanlanmış alt kümesidir; elle seçim hepsini görür.
   */
  matchTargets: MatchTargetView[];
  /** Açık belgeler — ödenmemiş faturalar; doğal tavanlı (kapanan düşer), tek turda. */
  openDocuments: OpenDocumentView[];
  /** Belge formunun tedarikçi seçeneği; yalnız aktif tedarikçiler. */
  supplierOptions: Array<{ value: string; label: string }>;
  /** Tür seçenekleri (13.09) — yalnız AKTİF; seçici satırın yönüyle süzsün diye yönü de taşır. */
  natureOptions: NatureOption[];
  /** Serbest etiketler — yalnız AKTİF: pasif etiket yeni harekete verilmez. */
  tagOptions: TagOption[];
  /** Cariler (13.09) — yalnız AKTİF; varsayılan türüyle (seçilince boş türe önerilir). */
  counterpartyOptions: CounterpartyOption[];
  /** Sözlük penceresi — pasifler dâhil. */
  dictionary: DictionaryView;
  /**
   * İzah edilmemiş hareket sayısı (13.09) — `null` "sayaç kapısı yok" demek, sıfır değil.
   *
   * CLAUDE.md §1: **ölçülemeyen değer SIFIR değildir.** Sayacı olmayan bir ekranda "0 izahsız"
   * yazmak, dolu bir iş kuyruğunu "her şey izahlı" diye okutur.
   */
  unexplainedCount: number | null;
}

/**
 * Açık diyalog — `null` hiçbiri. `document` belge girişi, `dictionary` tür · cari · etiket sözlüğü
 * (13.09), `bankImport` dosya yükleme (12.10).
 */
export type DialogKind = 'movement' | 'transfer' | 'document' | 'dictionary' | 'bankImport' | null;

/**
 * İki cihaz görünümünün ORTAK sözleşmesi.
 *
 * `finance-client.tsx`'te DEĞİL burada duruyor ve sebebi yaşanmış: client → desktop → client
 * döngüsü `no-circular` ihlali veriyor (geri bildirim ekranında aynısı olmuştu). Tipler ikisinin de
 * altında duran bir modülde yaşamalı.
 */
export interface FinanceViewProps {
  data: FinanceData;
  urlState: FinanceUrlState;
  /** Elle giriş ve transfer diyaloglarının hesap seçicisi — pasif hesap yeni harekete kapalı. */
  writableAccounts: AccountView[];
  navPending: boolean;
  dialog: DialogKind;
  busyId: string | null;
  queueError: string | null;
  onFilter: (next: Partial<FinanceUrlState>) => void;
  onOpenDialog: (kind: DialogKind) => void;
  onCloseDialog: () => void;
  onSaved: () => void;
  onApprove: (row: MatchRowView) => void;
  onPick: (row: MatchRowView) => void;
  /** Banka satırının TÜRÜNÜ koyar (13.09) — kuyruk kartının "Gider" menüsünden, tek dokunuş. */
  onClassify: (row: MatchRowView, nature: string) => void;
  onDismiss: (row: MatchRowView) => void;
  /**
   * Defter satırının türünü koyar ya da kaldırır (`null`). Söz `false` dönerse kapı reddetti — satır
   * iyimser gösterimi bırakır, sebep satırların üstündeki şeritte okunur.
   */
  onSetNature: (movementId: string, nature: string | null) => Promise<boolean>;
  /** Defter satırının carisini koyar ya da kaldırır; carinin varsayılan türü boş türe geçer. */
  onSetCounterparty: (movementId: string, counterpartyId: string | null) => Promise<boolean>;
  /** Defter satırının etiketleri — menünün her dokunuşu listenin yeni hâlini yazar (Kaydet yok). */
  onTag: (movementId: string, tags: string[]) => Promise<boolean>;
  /** Yeni etiket sözlüğe girer, anahtarı döner (var olan ad da anahtarını döndürür); başarısızsa `null`. */
  onCreateTag: (label: string) => Promise<string | null>;
  /** Ekstre satırının eşleşmesini geri alır — satır kuyruğa döner. */
  onUnmatch: (movementId: string) => void;
  /** Elle yazılmış satırın belge bağını kaldırır. */
  onRemoveAllocation: (movementId: string, documentId: string) => void;
  /** Hangi defter satırı beklemede (geri alma, bağ kaldırma) — iki kez tıklanmasın. */
  rowBusyId: string | null;
  /** Defter satırının son reddi — satırların üstünde okunur (kuyruğun hatası sağ sütunda). */
  rowError: string | null;
  /** "Ödemesini yaz" — açık belge seçildi, elle hareket formu belgeyle dolu açılır. */
  payingDocument: OpenDocumentView | null;
  onPayDocument: (document: OpenDocumentView) => void;
  onClosePay: () => void;
  /** Belge dosyasını yeni sekmede açar — okuma adresi tıklanınca istenir, süresi kısa. */
  onOpenDocumentFile: (document: OpenDocumentView) => void;
}

/**
 * ── ELLE HAREKET ŞEMASI ARTIK FORMUN YANINDA (22.18) ────────────────────────
 * `MANUAL_TYPES`, `ManualType`, `ManualMovementSchema` ve `ManualMovementForm` buradan
 * `components/operation/form/movement-form/schema.ts`e taşındı: form ortak alana çıktı (asistan
 * kuyruğu da onu açıyor) ve bir komponentin sayfa klasöründen şema okuması ters yönlü bağımlılıktır.
 *
 * **Yeniden ihraç YOK:** çağıranların hepsi (diyalog · kuyruk gövdesi · devir okuması) şemayı
 * doğrudan oradan okuyor. Buradan da vermek, aynı tanıma ikinci bir adres açmak olurdu.
 */

// `TransferFormSchema`/`TransferForm` de aynı yolu izledi (22.22) →
// `components/operation/form/transfer-form/schema.ts`. Sebep aynı: transfer formu artık kuyruğun
// içinde de açılıyor ve iki yüzey tek tanımı paylaşmalı.
