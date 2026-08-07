import { z } from 'zod';
import { MovementDirectionEnum, type Account, type AccountLedgerRow, type MovementType } from '@lezzet/types';
import type { OpsTone } from '@/components/operation/ui/tone';
import type { SuggestionStrength } from './finance-labels';
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
  'id' | 'ledgerAccountId' | 'valueDate' | 'type' | 'reconciled' | 'signedAmountCents'
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
  /** "gider · akaryakıt" — tip ve kategori tek hücrede, kategori varsa. */
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
  valueDate: string;
  strength: SuggestionStrength;
  /** Önerinin cümlesi — güçlü adayda ne yapacağını da söyler ("…→ 'ödendi' yapar"). */
  sentence: string;
  /** Onaya gidecek adaylar; `strength === 'none'` iken boş. */
  candidates: MatchCandidateView[];
}

export interface MatchCandidateView {
  orderId: string;
  referenceNo: string;
  /** 0–1 arası puan (motorun kendi ölçüsü) — çoklu adayda hangisinin önde olduğunu gösterir. */
  score: number;
  /**
   * "Neden bu aday" — motorun `reasons` alanının insan diline çevrilmiş, en güçlü iki maddesi.
   *
   * Açık tutar ve satış günü BURADA YOK: motor onları aday nesnesinde kullanıp cevabında geri
   * vermiyor. Ekranın onlara gerçekten ihtiyacı olsaydı ayrıca okunurdu; ama seçim ekranında
   * ayırt edici olan şey tutar değil (adayların hepsi aynı tutara uyduğu için çoklu aday oldular)
   * — ayıran şey tam olarak bu sebeplerdir.
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

export interface FinanceData {
  accounts: AccountView[];
  /** Hesapların toplamı — şeridin sonundaki "Toplam" hücresi. */
  totalCents: number;
  ledger: LedgerView;
  /** Eşleşme bekleyen banka satırları. Hesap seçili değilken boş (kuyruk hesaba bağlı). */
  queue: MatchRowView[];
  /**
   * Eşleşmemiş satır sayısı — `null` "sayaç kapısı yok" demek, sıfır değil.
   *
   * CLAUDE.md §1: **ölçülemeyen değer SIFIR değildir.** Sayacı olmayan bir ekranda "0 eşleşmemiş"
   * yazmak, dolu bir iş kuyruğunu "her şey mutabık" diye okutur.
   */
  unmatchedCount: number | null;
}

/** Açık diyalog — `null` hiçbiri. */
export type DialogKind = 'movement' | 'transfer' | null;

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
  onClassify: (row: MatchRowView, category: string) => void;
  onDismiss: (row: MatchRowView) => void;
}

/**
 * Elle giriş diyaloğunun kipi — gider, sermaye ya da sınıflandırılmamış.
 *
 * Yedi tipin dördü BİLEREK dışarıda: `order_payment`/`order_refund` kendi akışlarından düşer
 * (elle girilirse aynı para iki kez sayılır), `purchase` mal kabule bağlıdır (motor bağsızını
 * reddediyor), `transfer` kendi diyaloğunda — çünkü tek alanı değil, iki hesabı sorar.
 */
export const MANUAL_TYPES = ['expense', 'capital', 'misc'] as const satisfies readonly MovementType[];
export type ManualType = (typeof MANUAL_TYPES)[number];

/**
 * Elle hareket formu.
 *
 * Tutar **cent** taşınır (STACK §8) ve `MoneyField` zaten cent veriyor — forma euro koyup sunucuda
 * çevirseydik yuvarlama iki yerde olurdu. `null` başlangıç değeri "boş kutu" demek; sıfır değil.
 */
export const ManualMovementSchema = z.object({
  accountId: z.string().min(1),
  type: z.enum(MANUAL_TYPES),
  amountCents: z.number().int().positive().nullable(),
  direction: MovementDirectionEnum,
  category: z.string(),
  campaign: z.string(),
  valueDate: z.string(),
  description: z.string(),
});
export type ManualMovementForm = z.infer<typeof ManualMovementSchema>;

export const TransferFormSchema = z.object({
  fromAccountId: z.string().min(1),
  toAccountId: z.string().min(1),
  amountCents: z.number().int().positive().nullable(),
  valueDate: z.string(),
  description: z.string(),
});
export type TransferForm = z.infer<typeof TransferFormSchema>;
