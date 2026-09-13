import type { MatchKind, MatchSuggestion } from '@lezzet/domain-core';
import type { Account, AccountBalance, AccountLedgerRow, MoneyDocument, MoneyDocumentBalance } from '@lezzet/types';
import { dayMonth, money } from '@/components/operation/ui/format';
import type { MatchTargets } from '@/lib/bank/reconcile';
import { ACCOUNT_TONE, ACCOUNT_TYPE_LABEL, DOCUMENT_KIND_LABEL, MATCH_EFFECT, MOVEMENT_TYPE_LABEL, type MatchKindView } from './finance-labels';
import type { AccountView, MatchCandidateView, MatchRowView, MatchTargetView, MovementRowView, OpenDocumentView } from './finance-types';

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
 * Açık belge kartları (12.12). Açık kalan GÖRÜNÜMDEN gelir, burada hesaplanmaz; künye belge
 * numarasıyla başlar, numarasız belgede türün adıyla (fiş, bordro).
 */
export function toOpenDocumentViews(documents: ReadonlyArray<MoneyDocument & { balance: MoneyDocumentBalance }>): OpenDocumentView[] {
  return documents.map((doc) => {
    const kindLabel = DOCUMENT_KIND_LABEL[doc.kind];
    const head = doc.number ?? kindLabel;
    const who = doc.counterparty ?? '—';
    return {
      id: doc.id,
      kind: doc.kind,
      number: doc.number,
      issuedOn: doc.issuedOn,
      counterparty: doc.counterparty,
      direction: doc.direction,
      tags: doc.tags,
      kindLabel,
      amountCents: doc.amountCents,
      openAmountCents: doc.balance.openAmountCents,
      hasFile: doc.fileKey !== null,
      label: `${head} · ${who} · açık ${money(doc.balance.openAmountCents)}`,
    };
  });
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
  // Bağsız ama belgeli satır (fatura, fiş, bordro): dayanağı var, bir bağ değil.
  if (row.documentId) return { ref: 'belgeye bağlı', refTone: 'olive' };
  // Yalnız etiketli satır: sınıflandırma tip hücresinde zaten okunuyor, burada tekrarlanmaz.
  if (row.tags.length > 0) return { ref: null, refTone: 'neutral' };
  // Hiçbiri yok: satır izah bekliyor (13.09) — bu bir bilgi değil, bir SORU.
  return { ref: 'izah bekliyor', refTone: 'amber' };
}

/**
 * "gider · Kira · Ortak A" — etiketlerin OKUNUR adları tipin yanına, etiket yoksa yalnız tip (13.09).
 * Sözlükte adı okunamayan slug olduğu gibi yazılır: gizlemek, etiketi yok saymak olurdu.
 */
function typeLabelOf(row: AccountLedgerRow, tagLabels: ReadonlyMap<string, string>): string {
  const base = MOVEMENT_TYPE_LABEL[row.type];
  const labels = row.tags.map((slug) => tagLabels.get(slug) ?? slug);
  return labels.length > 0 ? `${base} · ${labels.join(' · ')}` : base;
}

export function toMovementRows(
  rows: readonly AccountLedgerRow[],
  accountNames: ReadonlyMap<string, string>,
  orderRefs: ReadonlyMap<string, string>,
  /** Etiket slug → okunur ad (sözlük); ekran ham slug basmasın diye. */
  tagLabels: ReadonlyMap<string, string> = new Map(),
): MovementRowView[] {
  return rows.map((row) => {
    const { ref, refTone } = refOf(row, accountNames, orderRefs);
    return {
      id: row.id,
      // Satırın hangi hesabın defterinde durduğu — kimliğin ikinci yarısı (`ledgerRowKey`).
      ledgerAccountId: row.ledgerAccountId,
      valueDate: row.valueDate,
      type: row.type,
      explained: row.explained,
      tags: row.tags,
      signedAmountCents: row.signedAmountCents,
      // Açıklamasız satır boş hücre bırakmaz: bankadan gelen satırın açıklaması hep vardır, elle
      // girilende boş kalabilir — o zaman okunacak tek şey tipin adıdır.
      title: row.description?.trim() || MOVEMENT_TYPE_LABEL[row.type],
      ref,
      refTone,
      accountName: accountNames.get(row.ledgerAccountId) ?? '—',
      typeLabel: typeLabelOf(row, tagLabels),
    };
  });
}

/**
 * Kuyruk satırının `matchQueue` dönüşünden görünüme indirgenmiş hâli.
 *
 * **Öneri yalnız tür + kimlik taşır** (`MatchSuggestion`: kind, id, puan, sebepler) — referans,
 * açık tutar ve tarih motorun ADAY nesnesinde kalır, cevabında değil. Ekran onları hedef
 * listesinden alır (`toMatchTargets`): öneri ile hedef aynı `${kind}:${id}` anahtarıyla buluşur.
 */
interface QueueInput {
  movement: Omit<AccountLedgerRow, 'ledgerAccountId' | 'signedAmountCents'> & { signedAmountCents?: number };
  suggestions: readonly { kind: MatchKind; id: string; score: number; reasons: readonly MatchReason[] }[];
  unambiguous: boolean;
}

type MatchReason = MatchSuggestion['reasons'][number];

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
  name_in_label: 'ad açıklamada geçiyor',
};

const REASON_ORDER = [
  'reference_in_label',
  'name_in_label',
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

const targetKey = (kind: MatchKindView, id: string) => `${kind}:${id}`;
/** Sipariş referansı okunamıyorsa kısaltılmış kimlik: UUID gösteren seçim penceresi okunamaz. */
const orderName = (referenceNo: string | null, id: string) => `Sipariş ${referenceNo ?? `#${id.slice(0, 8)}`}`;

/**
 * Seçim penceresinin hedef listesi (12.13) — kapının listelerinden görünüme.
 *
 * Her hedef iki satır okunur (`title` / `detail`) ve kararı hazır taşır (`target`): pencere
 * seçileni olduğu gibi action'a verir, kendi kimlik kurmaz. Yön hedefin üstünde durur; pencere
 * satırın yönüne uymayanı hiç listelemez (giren paraya fatura ödemesi teklif edilmez).
 */
export function toMatchTargets(targets: MatchTargets, tagLabels: ReadonlyMap<string, string>): MatchTargetView[] {
  const tagsOf = (tags: readonly string[]) => tags.map((tag) => tagLabels.get(tag) ?? tag).join(', ');
  return [
    ...targets.orders.map(
      (order): MatchTargetView => ({
        kind: 'order',
        key: targetKey('order', order.id),
        target: { kind: 'order', orderId: order.id },
        title: orderName(order.referenceNo, order.id),
        detail: `açık ${money(order.outstandingCents)} · satış ${dayMonth(order.saleDate)}`,
        direction: 'in',
      }),
    ),
    ...targets.refunds.map(
      (order): MatchTargetView => ({
        kind: 'refund',
        key: targetKey('refund', order.id),
        target: { kind: 'refund', orderId: order.id },
        title: orderName(order.referenceNo, order.id),
        detail: `net tahsilat ${money(order.netCollectedCents)} · satış ${dayMonth(order.saleDate)}`,
        direction: 'out',
      }),
    ),
    ...targets.documents.map(
      (doc): MatchTargetView => ({
        kind: 'document',
        key: targetKey('document', doc.id),
        target: { kind: 'document', documentId: doc.id },
        title: `${DOCUMENT_KIND_LABEL[doc.kind]}${doc.number ? ` ${doc.number}` : ''} · ${doc.counterparty ?? '—'}`,
        detail: `açık ${money(doc.balance.openAmountCents)} · ${dayMonth(doc.issuedOn)}${doc.tags.length ? ` · ${tagsOf(doc.tags)}` : ''}`,
        direction: doc.direction,
      }),
    ),
    ...targets.intakes.map(
      (intake): MatchTargetView => ({
        kind: 'intake',
        key: targetKey('intake', intake.stockIntakeId),
        target: { kind: 'intake', stockIntakeId: intake.stockIntakeId },
        title: `Mal kabul ${dayMonth(intake.date)} · ${intake.supplierName ?? 'tedarikçisiz'}`,
        detail: `açık ${money(intake.openAmountCents)} · toplam ${money(intake.amountCents)}`,
        direction: 'out',
      }),
    ),
    ...targets.transferLegs.map(
      (leg): MatchTargetView => ({
        kind: 'transfer',
        key: targetKey('transfer', leg.id),
        target: { kind: 'transfer', legId: leg.id },
        // Ucun yönü gönderenin gözünden: uç `out` ise para o hesaptan BU hesaba geliyor.
        title: leg.direction === 'out' ? `${leg.accountName} → bu hesap` : `bu hesap → ${leg.accountName}`,
        detail: `${money(leg.amountCents)} · ${dayMonth(leg.valueDate)}${leg.description ? ` · ${leg.description}` : ''}`,
        direction: leg.direction === 'out' ? 'in' : 'out',
      }),
    ),
    ...targets.provisional.map(
      (movement): MatchTargetView => ({
        kind: 'provisional',
        key: targetKey('provisional', movement.id),
        target: { kind: 'provisional', movementId: movement.id },
        title: movement.description?.trim() || MOVEMENT_TYPE_LABEL[movement.type],
        detail: `${money(movement.amountCents)} · ${dayMonth(movement.valueDate)} · ${MOVEMENT_TYPE_LABEL[movement.type]}${
          movement.tags.length ? ` · ${tagsOf(movement.tags)}` : ''
        } · ${movement.source === 'system' ? 'sistem yazdı' : 'elle yazıldı'}`,
        direction: movement.direction,
      }),
    ),
    ...targets.accounts.map(
      (account): MatchTargetView => ({
        kind: 'transfer_to',
        key: targetKey('transfer_to', account.id),
        target: { kind: 'transfer_to', accountId: account.id },
        title: account.name,
        detail: ACCOUNT_TYPE_LABEL[account.type],
        direction: null,
      }),
    ),
  ];
}

/**
 * Eşleştirme kuyruğu — üç hâl, üç ayrı eylem (tezgâh sözleşmesi).
 *
 * Güç sınıflandırması motorun cevabından TÜRETİLİR, ekranda yeniden karar verilmez: `unambiguous`
 * zaten "iki aday yakın mı" sorusunun cevabıdır (`isUnambiguous`) ve ekran kendi eşiğini koysaydı
 * aynı satır için motorla ayrı düşerdi — motor "belirsiz" derken ekran "onayla" teklif ederdi.
 */
export function toMatchRows(queue: readonly QueueInput[], targets: readonly MatchTargetView[]): MatchRowView[] {
  const targetOf = new Map(targets.map((target) => [target.key, target] as const));
  return queue.map((entry) => {
    const { movement, suggestions, unambiguous } = entry;
    // Hedef listesinde karşılığı olmayan öneri gösterilmez: kimliği olan ama adı olmayan bir aday
    // onaylanamaz. (Kapı ikisini aynı turda kuruyor; ayrışırlarsa sebep kodda, ekranda değil.)
    const candidates = suggestions.flatMap((suggestion): MatchCandidateView[] => {
      const target = targetOf.get(targetKey(suggestion.kind, suggestion.id));
      return target ? [{ ...target, score: suggestion.score, reasons: reasonsOf(suggestion.reasons) }] : [];
    });
    const best = candidates[0];
    const strength = !best ? 'none' : unambiguous ? 'strong' : 'ambiguous';

    return {
      movementId: movement.id,
      bankLine: movement.description?.trim() || 'Açıklamasız banka satırı',
      // Kuyruk tek hesabın kuyruğudur; işaret yönden türer (defter satırı gelmediyse de doğru olsun).
      signedAmountCents:
        movement.signedAmountCents ?? (movement.direction === 'out' ? -movement.amountCents : movement.amountCents),
      direction: movement.direction,
      valueDate: movement.valueDate,
      strength,
      sentence: sentenceOf(strength, best),
      candidates,
    };
  });
}

function sentenceOf(strength: MatchRowView['strength'], best: MatchCandidateView | undefined): string {
  if (!best) return 'Eşleşen bulunamadı — "Elle bağla" ile hedefi seçin ya da satırın adını koyun.';
  if (strength === 'strong') return `${best.title} · ${MATCH_EFFECT[best.kind]}.`;
  return 'Birden çok hedef bu satıra uyuyor — hangisi olduğunu siz seçin.';
}
