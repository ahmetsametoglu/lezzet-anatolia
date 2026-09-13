import type { Account, AccountLedgerRow, MoneyDocument, MovementDirection, MovementTag } from '@lezzet/types';
import type { OpsTone } from '@/components/operation/ui/tone';
import type { ClassifyType, MatchTarget } from '@/lib/bank/reconcile';
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
 */
export type MovementRowView = Pick<
  AccountLedgerRow,
  'id' | 'ledgerAccountId' | 'valueDate' | 'type' | 'explained' | 'tags' | 'signedAmountCents'
> & {
  /** Operatörün okuduğu cümle — açıklama yoksa tipin adı (boş hücre bırakmaktansa). */
  title: string;
  /**
   * Satırın neye bağlı olduğu: "sipariş LZA-26-7K4M2P" · "kampanya: bayram-ig" · "öneri bekliyor".
   * `null` ise alt satır hiç çizilmez — "—" yazmak, bağ olmamasını bir eksiklik gibi gösterirdi.
   */
  ref: string | null;
  /** Bağın tonu: bir kayda gidiyorsa `olive`, cevap bekliyorsa `amber`, düz bilgiyse `neutral`. */
  refTone: OpsTone;
  accountName: string;
  /** "gider · Kira · Ortak A" — tip ve etiketlerin okunur adları tek hücrede, etiket varsa. */
  typeLabel: string;
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
 * Eşleştirme HEDEFİ (12.13) — seçim penceresinin bir satırı: sipariş, açık belge, mal kabul,
 * transfer ucu, başka hesap ya da o hesaba zaten yazılmış hareket.
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
  /** Hedefin kapattığı banka yönü; `null` = iki yöne de uyar (başka hesaba transfer). */
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
 * saklanmaz, bağlı hareketlerden türetilir. `label` "Ödemesini yaz" formunun üstünde okunan künye.
 */
export type OpenDocumentView = Pick<MoneyDocument, 'id' | 'kind' | 'number' | 'issuedOn' | 'counterparty' | 'direction' | 'tags'> & {
  kindLabel: string;
  amountCents: number;
  openAmountCents: number;
  hasFile: boolean;
  label: string;
};

export interface FinanceData {
  accounts: AccountView[];
  /** Hesapların toplamı — şeridin sonundaki "Toplam" hücresi. */
  totalCents: number;
  ledger: LedgerView;
  /** Eşleşme bekleyen banka satırları. Hesap seçili değilken boş (kuyruk hesaba bağlı). */
  queue: MatchRowView[];
  /**
   * Seçim penceresinin hedef listesi (12.13): açık belgeler, ödenmemiş kabuller, bekleyen transfer
   * uçları, o hesaba zaten yazılmış hareketler, penceredeki satışlar, öteki hesaplar. Öneriler bu
   * listenin puanlanmış alt kümesidir; elle seçim hepsini görür.
   */
  matchTargets: MatchTargetView[];
  /** Açık belgeler — ödenmemiş faturalar; doğal tavanlı (kapanan düşer), tek turda. */
  openDocuments: OpenDocumentView[];
  /** Belge formunun tedarikçi seçeneği; yalnız aktif tedarikçiler. */
  supplierOptions: Array<{ value: string; label: string }>;
  /** Sözlüğün TAMAMI (pasifler dâhil) — etiket penceresi pasifi de listeler ki geri açılabilsin. */
  tagList: Array<Pick<MovementTag, 'slug' | 'label' | 'isActive'>>;
  /**
   * İzah edilmemiş hareket sayısı (13.09) — `null` "sayaç kapısı yok" demek, sıfır değil.
   *
   * CLAUDE.md §1: **ölçülemeyen değer SIFIR değildir.** Sayacı olmayan bir ekranda "0 izahsız"
   * yazmak, dolu bir iş kuyruğunu "her şey izahlı" diye okutur.
   */
  unexplainedCount: number | null;
  /**
   * Etiket sözlüğü — sınıflandırma çipleri ve elle giriş formu buradan okur (13.09). Yalnız AKTİF
   * etiketler: pasif etiket yeni harekete verilmez.
   */
  tagOptions: Array<{ value: string; label: string }>;
}

/** Açık diyalog — `null` hiçbiri. `document` belge girişi, `tags` etiket sözlüğü (12.12), `bankImport` dosya yükleme (12.10). */
export type DialogKind = 'movement' | 'transfer' | 'document' | 'tags' | 'bankImport' | null;

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
  /** Banka satırının ADINI koyar — gider (çıkış) ya da sermaye (giriş), sözlükten etiketlerle (13.09). */
  onClassify: (row: MatchRowView, type: ClassifyType, tags: string[]) => void;
  onDismiss: (row: MatchRowView) => void;
  /** Defter satırını etiketler — izah kuyruğunu kapatan yol (12.12). Hangi satır beklemede: `tagBusyId`. */
  onTag: (movementId: string, tags: string[]) => void;
  tagBusyId: string | null;
  /** "Ödemesini yaz" — açık belge seçildi, elle hareket formu belgeyle dolu açılır. */
  payingDocument: OpenDocumentView | null;
  onPayDocument: (document: OpenDocumentView) => void;
  onClosePay: () => void;
  /** Belge dosyasını yeni sekmede açar — okuma adresi tıklanınca istenir, süresi kısa. */
  onOpenDocumentFile: (document: OpenDocumentView) => void;
}

/**
 * Elle giriş diyaloğunun kipi — gider, sermaye ya da sınıflandırılmamış.
 *
 * Yedi tipin dördü BİLEREK dışarıda: `order_payment`/`order_refund` kendi akışlarından düşer
 * (elle girilirse aynı para iki kez sayılır), `purchase` mal kabule bağlıdır (motor bağsızını
 * reddediyor), `transfer` kendi diyaloğunda — çünkü tek alanı değil, iki hesabı sorar.
 */
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

