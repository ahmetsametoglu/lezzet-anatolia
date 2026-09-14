import { acceptsNature, type MatchKind, type MatchSuggestion } from '@lezzet/domain-core';
import type { Account, AccountBalance, AccountLedgerRow, MoneyDocument, MoneyDocumentBalance, MoneyMovement, MovementType } from '@lezzet/types';
import { dayMonth, money } from '@/components/operation/ui/format';
import type { DocumentPaymentOptions, MatchOptions, MatchTargets } from '@/lib/bank/reconcile';
import {
  ACCOUNT_TONE,
  ACCOUNT_TYPE_LABEL,
  COUNTERPARTY_KIND_LABEL,
  DOCUMENT_KIND_LABEL,
  MATCH_EFFECT,
  MOVEMENT_TYPE_LABEL,
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

// Para ekranının SAF indirgemeleri — servis satırı → görünüm satırı.
//
// Sunucu bileşeninden ayrı bir dosyada duruyorlar çünkü **saf oldukları için test edilebilirler**
// (`finance-read.test.ts`): işaret, bağ ve tür kuralları burada; okuma (`page.tsx`) yalnız
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

/**
 * Belge satırları (12.12 · 12.17) — Belgeler sekmesi, sağ panelin belgesi ve "Ödemesini yaz" formunun
 * künyesi. Açık kalan GÖRÜNÜMDEN gelir, burada hesaplanmaz; künye belge numarasıyla başlar, numarasız
 * belgede türün adıyla (fiş, bordro).
 */
export function toDocumentRows(
  documents: ReadonlyArray<MoneyDocument & { balance: MoneyDocumentBalance }>,
  names: Pick<MovementReadContext, 'partyNames' | 'natureLabels'>,
): DocumentRowView[] {
  return documents.map((doc) => {
    const partyName = partyOf(doc, names.partyNames);
    return {
      id: doc.id,
      kind: doc.kind,
      number: doc.number,
      issuedOn: doc.issuedOn,
      direction: doc.direction,
      nature: doc.nature,
      counterpartyId: doc.counterpartyId,
      supplierId: doc.supplierId,
      tags: doc.tags,
      note: doc.note,
      amountCents: doc.amountCents,
      vatAmountCents: doc.vatAmountCents,
      kindLabel: DOCUMENT_KIND_LABEL[doc.kind],
      partyName,
      natureLabel: doc.nature ? (names.natureLabels.get(doc.nature) ?? doc.nature) : null,
      openAmountCents: doc.balance.openAmountCents,
      hasFile: doc.fileKey !== null,
      label: `${documentHead(doc)} · ${partyName ?? '—'} · açık ${money(doc.balance.openAmountCents)}`,
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
}

/**
 * Tür almayan tiplerin izahı BAĞIDIR (motor: `acceptsNature`) — izahsızsa eksik olan o bağdır ve
 * satırda tür menüsü yoktur. "Türünü seçin" demek, olmayan bir düğmeyi göstermek olurdu (ölçüldü
 * 13.09: kapı önü satışın tahsilat satırları siparişsiz yazılıyor ve bu cümleyi taşıyordu).
 */
const MISSING_LINK: Partial<Record<MovementType, string>> = {
  order_payment: 'siparişe bağlı değil',
  order_refund: 'siparişe bağlı değil',
  purchase: 'mal kabule bağlı değil',
  transfer: 'karşı hesabı yok',
};

/**
 * Hareketin NEYE bağlı olduğu — tek cümle + tonu.
 *
 * Sıra öncelik sırasıdır ve rastgele değil: bir satır hem tedarikçiye hem mal kabule bağlı olabilir,
 * ve o zaman okunmak istenen şey **en somut olandır**. Kampanya en başta çünkü reklam giderinin tek
 * ayırt edici bilgisi odur (`meta.campaign`).
 *
 * Eşleşmeyi bekleyen banka satırı `amber` döner — o bir bağ değil, bir SORU: "bu para neyin nesi".
 * Tür, cari ve belge bağı satırın kendi araçlarında okunur (13.09); burada tekrarlanmaz — kalan
 * cümle satırın HÂLİDİR: ekstre satırı cevap bekliyor mu, satır izahsız mı.
 */
function refOf(
  row: AccountLedgerRow,
  context: MovementReadContext,
  documents: ReadonlyArray<{ id: string; label: string }>,
): { ref: string | null; refTone: MovementRowView['refTone'] } {
  const campaign = typeof row.meta?.campaign === 'string' ? row.meta.campaign : null;
  if (campaign) return { ref: `kampanya: ${campaign}`, refTone: 'olive' };

  if (row.orderId) {
    // Referans numarası okunabildiyse o yazılır: "siparişe bağlı" doğru ama HANGİ sipariş sorusunu
    // cevapsız bırakır ve operatörü satırdan çıkıp aramaya iter.
    const reference = context.orderRefs.get(row.orderId);
    return { ref: reference ? `sipariş ${reference}` : 'siparişe bağlı', refTone: 'olive' };
  }
  if (row.stockIntakeId) return { ref: 'mal kabule bağlı', refTone: 'olive' };
  if (row.supplierId) {
    const supplier = context.partyNames.get(row.supplierId);
    return { ref: supplier ? `tedarikçi: ${supplier}` : 'tedarikçi ödemesi', refTone: 'olive' };
  }

  if (row.counterAccountId) {
    // Transferde okunmak istenen şey karşı taraftır; bu satırın kendi hesabı zaten sütunda yazıyor.
    const counter = context.accountNames.get(row.counterAccountId);
    return { ref: counter ? `karşı hesap: ${counter}` : 'transfer', refTone: 'neutral' };
  }

  if (row.source === 'bank_import' && !row.reconciled) {
    // Kısmen bağlı satır: belgesi var ama kalan henüz karşılanmadı — kuyrukta kalanıyla durur (13.09).
    if (documents.length > 0) return { ref: 'kısmen bağlı — kalanı eşleşme bekliyor', refTone: 'amber' };
    // "Öneri bekliyor" DEĞİL (kullanıcı bulgusu 13.09: "öneride nasıl bulunacağımı anlayamadım"):
    // cümle operatöre yapacağı işi söyler — satırın türünü koymak ya da onu bir kayda bağlamak.
    return { ref: 'eşleşme bekliyor — türünü seçin ya da bağlayın', refTone: 'amber' };
  }
  // Hiçbiri yok: satır izah bekliyor (13.09) — bu bir bilgi değil, bir SORU. Cümle satırın
  // araçlarına uyar: tür alan satıra tür, almayana eksik bağı söylenir.
  if (!row.explained) {
    const ref = acceptsNature(row.type)
      ? 'izah bekliyor — türünü seçin ya da belgeye bağlayın'
      : `izah bekliyor — ${MISSING_LINK[row.type] ?? 'bağı eksik'}`;
    return { ref, refTone: 'amber' };
  }
  return { ref: null, refTone: 'neutral' };
}

export function toMovementRows(rows: readonly AccountLedgerRow[], context: MovementReadContext): MovementRowView[] {
  return rows.map((row) => {
    const documents = context.documentsOf.get(row.id) ?? [];
    const { ref, refTone } = refOf(row, context, documents);
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
      // Açıklamasız satır boş hücre bırakmaz: bankadan gelen satırın açıklaması hep vardır, elle
      // girilende boş kalabilir — o zaman okunacak tek şey tipin adıdır.
      title: row.description?.trim() || MOVEMENT_TYPE_LABEL[row.type],
      ref,
      refTone,
      accountName: context.accountNames.get(row.ledgerAccountId) ?? '—',
      typeLabel: MOVEMENT_TYPE_LABEL[row.type],
      canClassify: acceptsNature(row.type),
      natureLabel: row.nature ? (context.natureLabels.get(row.nature) ?? row.nature) : null,
      counterpartyName: row.counterpartyId ? (context.partyNames.get(row.counterpartyId) ?? null) : null,
      documents,
      remainingCents: row.amountCents - documents.reduce((sum, document) => sum + document.amountCents, 0),
      fromBank,
      canUnmatch: fromBank && (row.reconciled || documents.length > 0 || row.counterpartyId !== null),
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
  remainingCents: number;
  suggestions: readonly { kind: MatchKind; id: string; score: number; reasons: readonly MatchReason[] }[];
  unambiguous: boolean;
}

type MatchReason = MatchSuggestion['reasons'][number];

/**
 * "Neden bu öneri" — motorun `reasons` dizisi operatörün diline çevrilir.
 *
 * Motorun künyesi bu alanı açıkça bunun için koymuş (*"operatör 'neden bu?' diye sormasın"*) ve
 * gösterilmeseydi alan ölü kalırdı. Sıra önem sırası: referans eşleşmesi en güçlü kanıttır (banka
 * açıklamasında bizim numaramız geçiyor), carinin eşleşme kelimesi ondan sonra (operatörün kendi
 * kuralı), tarih yakınlığı en zayıfı.
 */
const REASON_LABEL: Record<MatchReason, string> = {
  reference_in_label: 'referans açıklamada geçiyor',
  keyword_in_label: 'eşleşme kelimesi geçiyor',
  exact_amount: 'tutar birebir',
  close_amount: 'tutar yakın',
  same_day: 'aynı gün',
  near_date: 'tarih yakın',
  name_in_label: 'ad açıklamada geçiyor',
};

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
 * Seçim penceresinin hedef listesi (12.13 · 13.09) — kapının listelerinden görünüme.
 *
 * Her hedef iki satır okunur (`title` / `detail`) ve kararı hazır taşır (`target`): pencere
 * seçileni olduğu gibi action'a verir, kendi kimlik kurmaz. Yön hedefin üstünde durur; pencere
 * satırın yönüne uymayanı hiç listelemez (giren paraya fatura ödemesi teklif edilmez).
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
    // Cari (13.09): iki yöne de listelenir — varsayılan türü satırın yönüne uymuyorsa tür konmaz, cari yine yazılır.
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
 * Eşleştirme kuyruğu — üç hâl, üç ayrı eylem (tezgâh sözleşmesi).
 *
 * Güç sınıflandırması motorun cevabından TÜRETİLİR, ekranda yeniden karar verilmez: `unambiguous`
 * zaten "iki aday yakın mı" sorusunun cevabıdır (`isUnambiguous`) ve ekran kendi eşiğini koysaydı
 * aynı satır için motorla ayrı düşerdi — motor "belirsiz" derken ekran "onayla" teklif ederdi.
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

/**
 * Sağ panelin hareket seçicisi (12.17) — kuyruk kartıyla AYNI öneri görünümü (`toMatchRows`) ve
 * aynı hedef listesi (`toMatchTargets`): tek satır için ikinci bir öneri dili yazılmaz.
 */
export function toMatchOptionsView(options: MatchOptions, natureLabels: ReadonlyMap<string, string>): MatchOptionsView {
  const targets = toMatchTargets(options.targets, natureLabels);
  const [row] = toMatchRows([options], targets);
  return { row: row!, targets, bankRow: options.bankRow };
}

/** Belge panelinin ödemeleri ve adayları (12.17) — hareket künyeleriyle, puan sebepleri operatörün dilinde. */
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
