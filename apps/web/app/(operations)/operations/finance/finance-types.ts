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
export type MovementRowView = Pick<AccountLedgerRow, 'id' | 'valueDate' | 'type' | 'reconciled' | 'signedAmountCents'> & {
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
 * Listenin OKUNABİLİRLİK hâli — analitik ekranının `ready`/`warming`/`absent` ayrımının aynısı.
 *
 * `blocked` bu ekrana özgü ve geçici: veri var, ekran hazır, **okuma kapısı yok**. Boş listeyle
 * karıştırılmaması şart — "hiç hareket yok" ile "hepsini gösteremiyorum" farklı cümlelerdir ve
 * ikincisini birincisi gibi göstermek, dolu bir kasayı boş göstermek olurdu.
 */
export type LedgerState = 'ready' | 'empty' | 'blocked';

export interface LedgerView {
  state: LedgerState;
  rows: MovementRowView[];
  nextCursor: string | null;
  /** `blocked`/`empty` hâlinde ekranın basacağı cümle. */
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
