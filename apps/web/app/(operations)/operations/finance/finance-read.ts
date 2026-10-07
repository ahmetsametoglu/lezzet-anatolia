import {
  acceptsNature,
  pennylaneDocumentStatus,
  type MatchKind,
  type MatchSuggestion,
  type PennylaneDocumentStatus,
} from '@lezzet/domain-core';
import { pennylaneBlockReasonLabel } from '@lezzet/i18n';
import type {
  Account,
  AccountBalance,
  AccountLedgerRow,
  MoneyDocument,
  MoneyDocumentBalance,
  MoneyMovement,
  MovementType,
  PennylaneDocumentMirror,
  PennylaneQueue,
} from '@lezzet/types';
import { amount, dayMonth, money } from '@/components/operation/ui/format';
import type { DocumentPaymentOptions, MatchOptions, MatchTarget, MatchTargets } from '@/lib/bank/reconcile';
import { queueBlockReason } from '@/lib/queue/block-reason';
import { DOCUMENT_KIND_LABEL } from '@/components/operation/form/document-form/labels';
import {
  ACCOUNT_TONE,
  ACCOUNT_TYPE_LABEL,
  COUNTERPARTY_KIND_LABEL,
  MATCH_EFFECT,
  MOVEMENT_TYPE_LABEL,
  PENNYLANE_STATUS_LABEL,
  type MatchKindView,
} from './finance-labels';
import type {
  AccountView,
  DocumentPaymentsView,
  DocumentRowView,
  MatchCandidateView,
  MatchOptionsView,
  MatchRowView,
  MatchTargetView,
  MovementRowView,
} from './finance-types';

// Para ekranının saf indirgemeleri: servis satırı → görünüm satırı. Okumadan ayrı dururlar, çünkü saf oldukları için veritabanısız
// sınanırlar (`finance-read.test.ts`).

/**
 * Hesap kartları, bakiye haritasıyla birleştirilir. Haritada olmayan hesabın bakiyesi bilinmiyor değil 0'dır, çünkü hiç hareketi
 * olmayan hesabın bakiyesi gerçekten sıfırdır.
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

/** Şeridin "Toplam"ı — hesapların bakiyeleri toplanır. */
export function totalBalance(accounts: readonly AccountView[]): number {
  return accounts.reduce((sum, account) => sum + account.balanceCents, 0);
}

/** Belgenin künyesi — numarası, numarasızsa türünün adı (fiş, bordro). */
export function documentHead(doc: Pick<MoneyDocument, 'kind' | 'number'>): string {
  return doc.number ?? DOCUMENT_KIND_LABEL[doc.kind];
}

/** Belgenin karşı tarafının adı — cari ya da tedarikçi (ikisi de kimlik, adlar tek haritada). */
function partyOf(doc: Pick<MoneyDocument, 'counterpartyId' | 'supplierId'>, partyNames: ReadonlyMap<string, string>): string | null {
  const id = doc.counterpartyId ?? doc.supplierId;
  return id ? (partyNames.get(id) ?? null) : null;
}

/** Belgelerin Pennylane durumunun girdisi, tek turda okunmuş haritalar; anahtar belge kimliğidir. */
export interface DocumentPennylaneContext {
  /** Eşitleme Pennylane'e bağlanabildi mi; bağlanamıyorsa kuyruk işlenmez, durum yazılmaz. */
  connected: boolean;
  mirrors: ReadonlyMap<string, Pick<PennylaneDocumentMirror, 'paymentStatus' | 'pennylaneOpenCents'>>;
  queue: ReadonlyMap<string, Pick<PennylaneQueue, 'attempts' | 'lastError'>>;
}

/** Satırdaki Pennylane durumu; sorunlu durum amber, öteki silik yazılır. */
function pennylaneLine(status: PennylaneDocumentStatus | null): DocumentRowView['pennylane'] {
  if (!status) return null;
  switch (status.kind) {
    case 'uploaded':
    case 'pending':
      return { text: PENNYLANE_STATUS_LABEL[status.kind], tone: 'neutral' };
    case 'failing':
      return { text: PENNYLANE_STATUS_LABEL.failing, tone: 'amber' };
    case 'blocked':
      return { text: `${PENNYLANE_STATUS_LABEL.blocked}: ${pennylaneBlockReasonLabel(status.reason)}`, tone: 'amber' };
    case 'different':
      return { text: `${PENNYLANE_STATUS_LABEL.different} · açık ${amount(status.pennylaneOpenCents)}`, tone: 'amber' };
  }
}

/** Belge satırları: Belgeler sekmesi ve "Ödemesini yaz" formunun künyesi; açık kalan görünümden gelir, burada hesaplanmaz. */
export function toDocumentRows(
  documents: ReadonlyArray<MoneyDocument & { balance: MoneyDocumentBalance }>,
  names: Pick<MovementReadContext, 'partyNames' | 'natureLabels'>,
  pennylane: DocumentPennylaneContext,
): DocumentRowView[] {
  return documents.map((doc) => {
    const partyName = partyOf(doc, names.partyNames);
    const queued = pennylane.queue.get(doc.id);
    return {
      id: doc.id,
      kind: doc.kind,
      number: doc.number,
      issuedOn: doc.issuedOn,
      dueOn: doc.dueOn,
      direction: doc.direction,
      nature: doc.nature,
      counterpartyId: doc.counterpartyId,
      supplierId: doc.supplierId,
      tags: doc.tags,
      note: doc.note,
      amountCents: doc.amountCents,
      vatAmountCents: doc.vatAmountCents,
      vatRegime: doc.vatRegime,
      kindLabel: DOCUMENT_KIND_LABEL[doc.kind],
      partyName,
      natureLabel: doc.nature ? (names.natureLabels.get(doc.nature) ?? doc.nature) : null,
      openAmountCents: doc.balance.openAmountCents,
      hasFile: doc.fileKey !== null,
      label: `${documentHead(doc)} · ${partyName ?? '—'} · açık ${money(doc.balance.openAmountCents)}`,
      pennylane: pennylaneLine(
        pennylaneDocumentStatus({
          connected: pennylane.connected,
          openAmountCents: doc.balance.openAmountCents,
          mirror: pennylane.mirrors.get(doc.id) ?? null,
          queue: queued ? { attempts: queued.attempts, blockReason: queueBlockReason(queued.lastError) } : null,
        }),
      ),
    };
  });
}

/** Defter satırını adlandırmak için gereken sözlükler — hepsi tek turda okunmuş haritalar. */
export interface MovementReadContext {
  accountNames: ReadonlyMap<string, string>;
  orderRefs: ReadonlyMap<string, string>;
  /** Cari ve tedarikçi kimliği → adı (ikisi de uuid, tek haritada çakışmaz). */
  partyNames: ReadonlyMap<string, string>;
  /** Tür anahtarı → okunur adı — pasif türler dâhil. */
  natureLabels: ReadonlyMap<string, string>;
  /** Hareketin bağlı belgeleri (bağ tablosundan) — künyesi ve bağın tutarıyla. */
  documentsOf: ReadonlyMap<string, Array<{ id: string; label: string; amountCents: number }>>;
  /** Mutabık olmayan ekstre satırlarının önerisi, hareket kimliğiyle. */
  suggestions?: ReadonlyMap<string, RowSuggestion>;
}

/** Ekstre satırının önerisi: gücü ve en iyi adayın adı (adsız aday gösterilmez). */
export interface RowSuggestion {
  strength: MatchRowView['strength'];
  title: string | null;
  /** Güçlü önerinin hedefi, satırın ✓'si tek dokunuşla uygular; güçlü değilse `null`. */
  target: MatchTarget | null;
}

/**
 * Tür almayan tiplerin izahı bağıdır (`acceptsNature`): izahsızsa eksik olan o bağdır ve satırda tür menüsü yoktur. "Türünü seçin"
 * demek olmayan bir düğmeyi göstermek olurdu.
 */
const MISSING_LINK: Partial<Record<MovementType, string>> = {
  order_payment: 'siparişe bağlı değil',
  order_refund: 'siparişe bağlı değil',
  purchase: 'mal kabule bağlı değil',
  transfer: 'karşı hesabı yok',
};

/**
 * Açıklamanın altındaki ipucu ve satırın bağı. İpucu kampanya (reklam giderinin tek ayırt edici bilgisi) ya da izah sorusudur; eşleşme
 * bekleyen ekstre satırının sorusu "Karşılığı" sütununun hapında durduğu için altta tekrarlanmaz.
 */
function refOf(row: AccountLedgerRow, context: MovementReadContext): Pick<MovementRowView, 'ref' | 'refTone' | 'link'> {
  const campaign = typeof row.meta?.campaign === 'string' ? row.meta.campaign : null;
  const bankPending = row.source === 'bank_import' && !row.reconciled;
  // Soru tür alan satıra türü, almayana eksik bağı söyler.
  const hint: Pick<MovementRowView, 'ref' | 'refTone'> = campaign
    ? { ref: `kampanya: ${campaign}`, refTone: 'olive' }
    : !row.explained && !bankPending
      ? {
          ref: acceptsNature(row.type) ? 'izah bekliyor — türünü seçin ya da belgeye bağlayın' : `izah bekliyor — ${MISSING_LINK[row.type] ?? 'bağı eksik'}`,
          refTone: 'amber',
        }
      : { ref: null, refTone: 'neutral' };
  return { ...hint, link: linkOf(row, context) };
}

/**
 * Satırın bağı, "Karşılığı" sütununda düz yazı; sıra öncelik sırasıdır, en somut olan okunur. Ekstre satırının belge bağı ve önerisi
 * sütunun hapındadır.
 */
function linkOf(row: AccountLedgerRow, context: MovementReadContext): MovementRowView['link'] {
  if (row.orderId) {
    // Referans numarası okunabildiyse o yazılır: "siparişe bağlı" doğru ama HANGİ sipariş sorusunu
    // cevapsız bırakır ve operatörü satırdan çıkıp aramaya iter.
    const reference = context.orderRefs.get(row.orderId);
    return { text: reference ? `sipariş ${reference}` : 'siparişe bağlı', tone: 'olive' };
  }
  if (row.stockIntakeId) return { text: 'mal kabule bağlı', tone: 'olive' };
  if (row.supplierId) {
    const supplier = context.partyNames.get(row.supplierId);
    return { text: supplier ? `tedarikçi: ${supplier}` : 'tedarikçi ödemesi', tone: 'olive' };
  }
  if (row.counterAccountId) {
    // Transferde okunmak istenen şey karşı taraftır; bu satırın kendi hesabı zaten sütunda yazıyor.
    const counter = context.accountNames.get(row.counterAccountId);
    return { text: counter ? `karşı hesap: ${counter}` : 'transfer', tone: 'neutral' };
  }
  return null;
}

export function toMovementRows(rows: readonly AccountLedgerRow[], context: MovementReadContext): MovementRowView[] {
  return rows.map((row) => {
    const documents = context.documentsOf.get(row.id) ?? [];
    const { ref, refTone, link } = refOf(row, context);
    const fromBank = row.source === 'bank_import';
    return {
      id: row.id,
      // Satırın hangi hesabın defterinde durduğu — kimliğin ikinci yarısı (`ledgerRowKey`).
      ledgerAccountId: row.ledgerAccountId,
      valueDate: row.valueDate,
      type: row.type,
      direction: row.direction,
      explained: row.explained,
      nature: row.nature,
      counterpartyId: row.counterpartyId,
      tags: row.tags,
      signedAmountCents: row.signedAmountCents,
      amountCents: row.amountCents,
      description: row.description,
      source: row.source,
      reconciled: row.reconciled,
      matchedElsewhere: row.matchedElsewhere,
      // Açıklamasız satır boş hücre bırakmaz: bankadan gelen satırın açıklaması hep vardır, elle
      // girilende boş kalabilir — o zaman okunacak tek şey tipin adıdır.
      title: row.description?.trim() || MOVEMENT_TYPE_LABEL[row.type],
      ref,
      refTone,
      link,
      accountName: context.accountNames.get(row.ledgerAccountId) ?? '—',
      typeLabel: MOVEMENT_TYPE_LABEL[row.type],
      canClassify: acceptsNature(row.type),
      natureLabel: row.nature ? (context.natureLabels.get(row.nature) ?? row.nature) : null,
      counterpartyName: row.counterpartyId ? (context.partyNames.get(row.counterpartyId) ?? null) : null,
      documents,
      remainingCents: row.amountCents - documents.reduce((sum, document) => sum + document.amountCents, 0),
      fromBank,
      suggestion: context.suggestions?.get(row.id)?.strength ?? null,
      suggestionTitle: context.suggestions?.get(row.id)?.title ?? null,
      suggestionTarget: context.suggestions?.get(row.id)?.target ?? null,
      canUnmatch: fromBank && (row.reconciled || documents.length > 0 || row.counterpartyId !== null),
    };
  });
}

/**
 * Listeyi ardışık anahtara göre gruplar: hareketler günlere, belgeler aylara. Sayfalar o tarihe göre azalan geldiği için eklenen
 * sayfanın ilk satırı önceki son gruba katılır ve başlık ikinci kez çizilmez.
 */
export function groupConsecutive<T>(rows: readonly T[], keyOf: (row: T) => string): Array<{ key: string; rows: T[] }> {
  const groups: Array<{ key: string; rows: T[] }> = [];
  for (const row of rows) {
    const key = keyOf(row);
    const last = groups[groups.length - 1];
    if (last?.key === key) last.rows.push(row);
    else groups.push({ key, rows: [row] });
  }
  return groups;
}

/**
 * Kuyruk satırı, `matchQueue` dönüşü. Öneri yalnız tür ve kimlik taşır; referans, açık tutar ve tarih hedef listesinden gelir ve öneri
 * ile hedef aynı `${kind}:${id}` anahtarıyla buluşur.
 */
interface QueueInput {
  movement: Omit<AccountLedgerRow, 'ledgerAccountId' | 'signedAmountCents'> & { signedAmountCents?: number };
  remainingCents: number;
  suggestions: readonly { kind: MatchKind; id: string; score: number; reasons: readonly MatchReason[] }[];
  unambiguous: boolean;
}

type MatchReason = MatchSuggestion['reasons'][number];

/** "Neden bu öneri": motorun `reasons` dizisi operatörün dilinde. */
const REASON_LABEL: Record<MatchReason, string> = {
  reference_in_label: 'referans açıklamada geçiyor',
  keyword_in_label: 'eşleşme kelimesi geçiyor',
  exact_amount: 'tutar birebir',
  close_amount: 'tutar yakın',
  same_day: 'aynı gün',
  near_date: 'tarih yakın',
  name_in_label: 'ad açıklamada geçiyor',
};

// Önem sırası: banka açıklamasında bizim numaramız en güçlü kanıttır, carinin eşleşme kelimesi ondan sonra, tarih yakınlığı en zayıfı.
const REASON_ORDER = [
  'reference_in_label',
  'keyword_in_label',
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
 * Seçim penceresinin hedef listesi; her hedef kararı hazır taşır, pencere seçileni olduğu gibi gönderir. Yön hedefin üstünde durur,
 * çünkü pencere satırın yönüne uymayanı listelemez.
 */
export function toMatchTargets(targets: MatchTargets, natureLabels: ReadonlyMap<string, string>): MatchTargetView[] {
  const natureOf = (slug: string | null) => (slug ? (natureLabels.get(slug) ?? slug) : null);
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
        title: `${DOCUMENT_KIND_LABEL[doc.kind]}${doc.number ? ` ${doc.number}` : ''} · ${doc.partyName ?? '—'}`,
        detail: `açık ${money(doc.balance.openAmountCents)} · ${dayMonth(doc.issuedOn)}${doc.nature ? ` · ${natureOf(doc.nature)}` : ''}`,
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
        detail: `${money(movement.amountCents)} · ${dayMonth(movement.valueDate)} · ${natureOf(movement.nature) ?? MOVEMENT_TYPE_LABEL[movement.type]} · ${
          movement.source === 'system' ? 'sistem yazdı' : 'elle yazıldı'
        }`,
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
    // Cari iki yöne de listelenir: varsayılan türü satırın yönüne uymuyorsa tür konmaz, cari yine yazılır.
    ...targets.counterparties.map(
      (counterparty): MatchTargetView => ({
        kind: 'counterparty',
        key: targetKey('counterparty', counterparty.id),
        target: { kind: 'counterparty', counterpartyId: counterparty.id },
        title: counterparty.name,
        detail: `${COUNTERPARTY_KIND_LABEL[counterparty.kind]} · ${natureOf(counterparty.defaultNature) ?? 'türü sonra seçilir'}`,
        direction: null,
      }),
    ),
  ];
}

/**
 * Eşleştirme önerisinin görünümü. Güç motorun cevabından türer (`isUnambiguous`), çünkü ekran kendi eşiğini koysaydı motor "belirsiz"
 * derken "onayla" teklif ederdi.
 */
export function toMatchRows(queue: readonly QueueInput[], targets: readonly MatchTargetView[]): MatchRowView[] {
  const targetOf = new Map(targets.map((target) => [target.key, target] as const));
  return queue.map((entry) => {
    const { movement, suggestions, unambiguous, remainingCents } = entry;
    // Hedef listesinde karşılığı olmayan öneri gösterilmez: kimliği olan ama adı olmayan bir aday
    // onaylanamaz. (Kapı ikisini aynı turda kuruyor; ayrışırlarsa sebep kodda, ekranda değil.)
    const candidates = suggestions.flatMap((suggestion): MatchCandidateView[] => {
      const target = targetOf.get(targetKey(suggestion.kind, suggestion.id));
      return target ? [{ ...target, score: suggestion.score, reasons: reasonsOf(suggestion.reasons) }] : [];
    });
    const best = candidates[0];
    const strength = !best ? 'none' : unambiguous ? 'strong' : 'ambiguous';
    const partial = remainingCents < movement.amountCents;

    return {
      movementId: movement.id,
      bankLine: movement.description?.trim() || 'Açıklamasız banka satırı',
      // Kuyruk tek hesabın kuyruğudur; işaret yönden türer (defter satırı gelmediyse de doğru olsun).
      signedAmountCents:
        movement.signedAmountCents ?? (movement.direction === 'out' ? -movement.amountCents : movement.amountCents),
      remainingCents,
      direction: movement.direction,
      valueDate: movement.valueDate,
      strength,
      sentence: `${partial ? `Kısmen bağlı — kalan ${money(remainingCents)}. ` : ''}${sentenceOf(strength, best)}`,
      candidates,
    };
  });
}

function sentenceOf(strength: MatchRowView['strength'], best: MatchCandidateView | undefined): string {
  if (!best) return 'Eşleşen bulunamadı — "Elle bağla" ile hedefi seçin ya da satırın türünü koyun.';
  if (strength === 'strong') return `${best.title} · ${MATCH_EFFECT[best.kind]}.`;
  return 'Birden çok hedef bu satıra uyuyor — hangisi olduğunu siz seçin.';
}

/** Hareketin eşleştirme menüsü; tek satır için ikinci bir öneri dili yazılmaz, görünüm ve hedef listesi aynıdır. */
export function toMatchOptionsView(options: MatchOptions, natureLabels: ReadonlyMap<string, string>): MatchOptionsView {
  const targets = toMatchTargets(options.targets, natureLabels);
  const [row] = toMatchRows([options], targets);
  return { row: row!, targets, bankRow: options.bankRow };
}

/** Belgenin ödeme menüsü: ödemeleri ve adayları, hareket künyeleriyle; puan sebepleri operatörün dilinde. */
export function toDocumentPaymentsView(options: DocumentPaymentOptions, accountNames: ReadonlyMap<string, string>): DocumentPaymentsView {
  const titleOf = (movement: MoneyMovement) => movement.description?.trim() || MOVEMENT_TYPE_LABEL[movement.type];
  return {
    openAmountCents: options.document.balance.openAmountCents,
    payments: options.payments.map(({ movement, amountCents }) => ({
      movementId: movement.id,
      title: titleOf(movement),
      valueDate: movement.valueDate,
      accountName: accountNames.get(movement.accountId) ?? '—',
      amountCents,
      movementAmountCents: movement.amountCents,
      // Ekstre satırının bağı "Eşleşmeyi geri al" ile çözülür: tek bağı sökmek satırı mutabık ama
      // bağsız bırakırdı (tipi ve adı belgeden gelmişti).
      removable: movement.source !== 'bank_import',
    })),
    candidates: options.candidates.map((candidate) => ({
      movementId: candidate.movement.id,
      title: titleOf(candidate.movement),
      valueDate: candidate.movement.valueDate,
      accountName: accountNames.get(candidate.movement.accountId) ?? '—',
      direction: candidate.movement.direction,
      remainingCents: candidate.remainingCents,
      score: candidate.score,
      reasons: reasonsOf(candidate.reasons),
    })),
  };
}
