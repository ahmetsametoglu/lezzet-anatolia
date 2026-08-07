import type { Account, AccountBalance, AccountLedgerRow } from '@lezzet/types';
import { ACCOUNT_TONE, MOVEMENT_TYPE_LABEL } from './finance-labels';
import type { AccountView, MatchCandidateView, MatchRowView, MovementRowView } from './finance-types';

// Para ekranının SAF indirgemeleri — servis satırı → görünüm satırı.
//
// Sunucu bileşeninden ayrı bir dosyada duruyorlar çünkü **saf oldukları için test edilebilirler**
// (`finance-read.test.ts`): işaret, etiket ve bağ kuralları burada; okuma (`page.tsx`) yalnız
// satırları getirip bunlara veriyor. Karışsalardı her iddia bir veritabanı ister, birim testi
// entegrasyon testine dönerdi.

/**
 * Hesap kartları — bakiye haritasıyla birleştirilir.
 *
 * **Haritada olmayan hesap 0 bakiyeli DEĞİL, 0 hareketli sayılır** ve bu ayrım kasıtlı: hiç hareketi
 * olmayan yeni bir hesabın bakiyesi gerçekten 0'dır (servis de öyle diyor, `balance()` künyesi).
 * Ölçüm düşmüş olsaydı `null` dönmeliydi — ama burada ölçüm düşmüyor, kayıt hiç yok.
 */
export function toAccountViews(accounts: readonly Account[], balances: ReadonlyMap<string, AccountBalance>): AccountView[] {
  return accounts.map((account) => {
    const balance = balances.get(account.id);
    return {
      id: account.id,
      name: account.name,
      type: account.type,
      isActive: account.isActive,
      balanceCents: balance?.balanceCents ?? 0,
      movementCount: balance?.movementCount ?? 0,
      tone: ACCOUNT_TONE[account.type],
    };
  });
}

/** Şeridin sonundaki "Toplam" — hesapların bakiyeleri toplanır. */
export function totalBalance(accounts: readonly AccountView[]): number {
  return accounts.reduce((sum, account) => sum + account.balanceCents, 0);
}

/**
 * Hareketin NEYE bağlı olduğu — tek cümle + tonu.
 *
 * Sıra öncelik sırasıdır ve rastgele değil: bir satır hem tedarikçiye hem mal kabule bağlı olabilir,
 * ve o zaman okunmak istenen şey **en somut olandır**. Kampanya en başta çünkü reklam giderinin tek
 * ayırt edici bilgisi odur (`meta.campaign`); tipi zaten "gider" yazıyor.
 *
 * Eşleşmeyi bekleyen banka satırı `amber` döner — o bir bağ değil, bir SORU: "bu para neyin nesi".
 * Tasarımın kuyruk sayacı da aynı kümeyi sayıyor, yani satır ile rozet aynı ölçütten çıkıyor.
 */
function refOf(
  row: AccountLedgerRow,
  accountNames: ReadonlyMap<string, string>,
  orderRefs: ReadonlyMap<string, string>,
): { ref: string | null; refTone: MovementRowView['refTone'] } {
  const campaign = typeof row.meta?.campaign === 'string' ? row.meta.campaign : null;
  if (campaign) return { ref: `kampanya: ${campaign}`, refTone: 'olive' };

  if (row.orderId) {
    // Referans numarası okunabildiyse o yazılır: "siparişe bağlı" doğru ama HANGİ sipariş sorusunu
    // cevapsız bırakır ve operatörü satırdan çıkıp aramaya iter.
    const reference = orderRefs.get(row.orderId);
    return { ref: reference ? `sipariş ${reference}` : 'siparişe bağlı', refTone: 'olive' };
  }
  if (row.stockIntakeId) return { ref: 'mal kabule bağlı', refTone: 'olive' };
  if (row.supplierId) return { ref: 'tedarikçi ödemesi', refTone: 'olive' };

  if (row.counterAccountId) {
    // Transferde okunmak istenen şey karşı taraftır; bu satırın kendi hesabı zaten sütunda yazıyor.
    const counter = accountNames.get(row.counterAccountId);
    return { ref: counter ? `karşı hesap: ${counter}` : 'transfer', refTone: 'neutral' };
  }

  if (row.source === 'bank_import' && !row.reconciled) return { ref: 'öneri bekliyor', refTone: 'amber' };
  return { ref: row.category, refTone: 'neutral' };
}

/** "gider · akaryakıt" — kategori varsa tipin yanına, yoksa yalnız tip. */
function typeLabelOf(row: AccountLedgerRow): string {
  const base = MOVEMENT_TYPE_LABEL[row.type];
  // Reklam giderinin kategorisi `advertising` sabitidir ve etiketi zaten `ref`te kampanya olarak
  // görünüyor; ham sabiti ikinci kez basmak iç terimi arayüze sızdırırdı (tasarım §6).
  return row.category && row.category !== 'advertising' ? `${base} · ${row.category}` : base;
}

export function toMovementRows(
  rows: readonly AccountLedgerRow[],
  accountNames: ReadonlyMap<string, string>,
  orderRefs: ReadonlyMap<string, string>,
): MovementRowView[] {
  return rows.map((row) => {
    const { ref, refTone } = refOf(row, accountNames, orderRefs);
    return {
      id: row.id,
      // Satırın hangi hesabın defterinde durduğu — kimliğin ikinci yarısı (`ledgerRowKey`).
      ledgerAccountId: row.ledgerAccountId,
      valueDate: row.valueDate,
      type: row.type,
      reconciled: row.reconciled,
      signedAmountCents: row.signedAmountCents,
      // Açıklamasız satır boş hücre bırakmaz: bankadan gelen satırın açıklaması hep vardır, elle
      // girilende boş kalabilir — o zaman okunacak tek şey tipin adıdır.
      title: row.description?.trim() || MOVEMENT_TYPE_LABEL[row.type],
      ref,
      refTone,
      accountName: accountNames.get(row.ledgerAccountId) ?? '—',
      typeLabel: typeLabelOf(row),
    };
  });
}

/**
 * Kuyruk satırının `matchQueue` dönüşünden görünüme indirgenmiş hâli.
 *
 * **Öneri yalnız `orderId` taşır** (`MatchSuggestion`: kimlik + puan + sebepler) — referans numarası,
 * açık tutar ve satış günü motorun ADAY nesnesinde kalır, cevabında değil. Ekran onları ayrı bir
 * okumadan alır (`OrderService.listByIds`, tek tur): motorun cevabını şişirmek yerine, gösterimin
 * ihtiyacını gösterim tarafı karşılıyor.
 */
interface QueueInput {
  movement: Omit<AccountLedgerRow, 'ledgerAccountId' | 'signedAmountCents'> & { signedAmountCents?: number };
  suggestions: readonly { orderId: string; score: number; reasons: readonly MatchReason[] }[];
  unambiguous: boolean;
}

type MatchReason = 'reference_in_label' | 'exact_amount' | 'close_amount' | 'same_day' | 'near_date' | 'customer_in_label';

/**
 * "Neden bu öneri" — motorun `reasons` dizisi operatörün diline çevrilir.
 *
 * Motorun künyesi bu alanı açıkça bunun için koymuş (*"operatör 'neden bu?' diye sormasın"*) ve
 * gösterilmeseydi alan ölü kalırdı. Sıra önem sırası: referans eşleşmesi en güçlü kanıttır (banka
 * açıklamasında bizim numaramız geçiyor), tarih yakınlığı en zayıfı.
 */
const REASON_LABEL: Record<MatchReason, string> = {
  reference_in_label: 'referans açıklamada geçiyor',
  exact_amount: 'tutar birebir',
  close_amount: 'tutar yakın',
  same_day: 'aynı gün',
  near_date: 'tarih yakın',
  customer_in_label: 'müşteri adı açıklamada',
};

const REASON_ORDER = [
  'reference_in_label',
  'customer_in_label',
  'exact_amount',
  'close_amount',
  'same_day',
  'near_date',
] as const satisfies readonly MatchReason[];

/** En güçlü iki sebep — hepsini yazmak kartı bir gerekçe listesine çevirirdi. */
function reasonsOf(reasons: readonly MatchReason[]): string[] {
  return REASON_ORDER.filter((reason) => reasons.includes(reason))
    .slice(0, 2)
    .map((reason) => REASON_LABEL[reason]);
}

/**
 * Eşleştirme kuyruğu — üç hâl, üç ayrı eylem (tezgâh sözleşmesi).
 *
 * Güç sınıflandırması motorun cevabından TÜRETİLİR, ekranda yeniden karar verilmez: `unambiguous`
 * zaten "iki aday yakın mı" sorusunun cevabıdır (`isUnambiguous`) ve ekran kendi eşiğini koysaydı
 * aynı satır için motorla ayrı düşerdi — motor "belirsiz" derken ekran "onayla" teklif ederdi.
 */
export function toMatchRows(queue: readonly QueueInput[], orderRefs: ReadonlyMap<string, string>): MatchRowView[] {
  return queue.map((entry) => {
    const { movement, suggestions, unambiguous } = entry;
    const best = suggestions[0];
    const strength = !best ? 'none' : unambiguous ? 'strong' : 'ambiguous';

    return {
      movementId: movement.id,
      bankLine: movement.description?.trim() || 'Açıklamasız banka satırı',
      // Kuyruk tek hesabın kuyruğudur; işaret yönden türer (defter satırı gelmediyse de doğru olsun).
      signedAmountCents:
        movement.signedAmountCents ?? (movement.direction === 'out' ? -movement.amountCents : movement.amountCents),
      valueDate: movement.valueDate,
      strength,
      sentence: sentenceOf(strength, best, orderRefs),
      candidates: suggestions.map((suggestion) => toCandidate(suggestion, orderRefs)),
    };
  });
}

function toCandidate(suggestion: QueueInput['suggestions'][number], orderRefs: ReadonlyMap<string, string>): MatchCandidateView {
  return {
    orderId: suggestion.orderId,
    // Referansı okunamayan sipariş kimliğiyle gösterilmez: operatöre UUID göstermek, seçim ekranını
    // okunamaz kılardı. Kısaltılmış kimlik hiç olmazsa "hangisi" sorusunu ayırt eder.
    referenceNo: orderRefs.get(suggestion.orderId) ?? `#${suggestion.orderId.slice(0, 8)}`,
    score: suggestion.score,
    reasons: reasonsOf(suggestion.reasons),
  };
}

function sentenceOf(
  strength: MatchRowView['strength'],
  best: QueueInput['suggestions'][number] | undefined,
  orderRefs: ReadonlyMap<string, string>,
): string {
  if (!best) return 'Eşleşen bulunamadı — tip/kategori seçip elle bağlayın.';
  if (strength === 'strong') {
    const reference = orderRefs.get(best.orderId);
    return reference
      ? `Sipariş ${reference} · açık tutarı kapatır ve siparişi "ödendi" yapar.`
      : 'Tek güçlü aday var · onaylarsanız siparişin tahsilatı olur.';
  }
  return 'Birden çok sipariş bu satıra uyuyor — hangisi olduğunu siz seçin.';
}
