'use server';

import { revalidatePath } from 'next/cache';
import {
  AccountService,
  BankImportProfileService,
  MoneyDocumentService,
  MovementNatureService,
  PurchaseOrderService,
  StockIntakeBalanceService,
  serviceDb,
} from '@lezzet/database';
import { dictionarySlugOf, parseBankRows, type MappingSuggestion, type ParseProfile, type RowParseFailure } from '@lezzet/domain-core';
import {
  ADVERTISING_NATURE,
  type AccountType,
  type BankImportProfile,
  type Business,
  type CounterpartyKind,
  type DocumentKind,
  type DocumentVatLine,
  type DocumentVatRegime,
  type KeysetCursor,
  type MovementDirection,
  type RawBankRow,
} from '@lezzet/types';
import { requireFinance } from '@/lib/guard';
import { withProposal } from '@/lib/assistant/handoff';
import { getErrorMessage, type ActionResult } from '@/lib/error';
import { recordAdvertisingExpense, recordExpense, recordMovement, recordSupplierPayment, transfer } from '@/lib/money/movement';
import { dayMonth, money } from '@/components/operation/ui/format';
import type { StockLinkOption } from '@/components/operation/form/document-form/schema';
import { applyMatch, documentPaymentOptions, linkDocument, matchOptions, unmatchRow, type MatchTarget } from '@/lib/bank/reconcile';
import { analyzeFile, importBankRows, profileFor, saveProfile } from '@/lib/bank/import';
import {
  addCounterparty,
  addMovementNature,
  addMovementTag,
  allocateToDocument,
  attachDocumentFile,
  createMoneyDocument,
  documentFileUrl,
  linkAwaitingTransfers,
  removeAllocation,
  requestDocumentUploadUrl,
  setMovementCounterparty,
  setMovementNature,
  setMovementTagActive,
  tagMovement,
  updateCounterparty,
  updateMovementNature,
} from '@lezzet/application';
import {
  ALLOCATION_REASON,
  COUNTERPARTY_REASON,
  DOCUMENT_REASON,
  INVALID_REASON,
  NATURE_REASON,
  RECONCILE_REASON,
  TAG_REASON,
} from '@/app/(operations)/operations/finance/finance-labels';
import { FINANCE_PATH, parseFinanceUrl } from '@/app/(operations)/operations/finance/finance-url';
import {
  namesOf,
  readDictionaries,
  readDocumentRow,
  readDocumentsPage,
  readLedgerPage,
  readLedgerRows,
  withResolvedAccount,
} from '@/app/(operations)/operations/finance/finance-data';
import { toDocumentPaymentsView, toMatchOptionsView } from '@/app/(operations)/operations/finance/finance-read';
import type {
  DocumentListView,
  DocumentPaymentsView,
  DocumentRowView,
  LedgerView,
  MatchOptionsView,
  MovementRowView,
} from '@/app/(operations)/operations/finance/finance-types';
import type { ManualType } from '@/components/operation/form/movement-form/schema';

// Para ekranı server action'ları: guard, kapıya devir, `{ data, error }` dönüşü ve tazeleme; iş kuralı motorda ve uygulama
// kapılarındadır. Guard `requireFinance`tır, çünkü kasa hareketi ve tedarikçi ödemesi muhasebecinin de işidir.

/** Motorun reddini operatörün diline çevirir; bilinmeyen sebep ham bırakılmaz, genel cümleye düşer. */
function invalidMessage(reason: string): string {
  return INVALID_REASON[reason as keyof typeof INVALID_REASON] ?? 'Bu hareket kaydedilemedi — alanları gözden geçirin.';
}

/** Sözlük değişince asistanın formu da yeni listeyi görsün (tür, etiket, cari aynı listeleri okur). */
function revalidateMoney(): void {
  revalidatePath(FINANCE_PATH);
  revalidatePath('/operations/assistant');
}

interface ManualMovementInput {
  accountId: string;
  type: ManualType;
  /** **Cent** (STACK §8) — işaretsiz; yönü tip belirler, `misc` dışında sorulmaz. */
  amountCents: number;
  /** Yalnız `misc` için anlamlı: sebebi bilinmeyen paranın yönü kullanıcıdan gelir. */
  direction: MovementDirection;
  /** Tür, "bu para neyin parası"; `reklam` ise kampanya sorulur. Boşsa hareket izah bekler. */
  nature: string | null;
  /** Kime ödendi ya da kimden geldi. */
  counterpartyId: string | null;
  /** Serbest etiketler. */
  tags: string[];
  /** Reklam giderinde kampanya künyesi, analitiğin ROAS köprüsü; boşsa yazılmaz. */
  campaign: string;
  valueDate: string;
  description: string;
  /** Dayanak belge: açık belgeden "Ödemesini yaz" ile gelindiyse dolu; ödeme belgeye bağlanır. */
  documentId?: string | null;
}

/**
 * Elle hareket: gider, sermaye ya da sınıflandırılmamış; sipariş tahsilatı, iade ve stok alımı kendi akışlarından yazılır, elle
 * girilseydi aynı para iki kez sayılırdı. Belgeden gelindiyse ödeme yazıldıktan sonra belgeye bağlanır; bağ düşerse cevap hareketin
 * yazıldığını söyler ki operatör parayı ikinci kez girmesin.
 */
export async function recordManualMovementAction(
  input: ManualMovementInput & { proposalId?: string | null },
): Promise<ActionResult<{ movementId: string }>> {
  try {
    const staff = await requireFinance();

    const shared = {
      accountId: input.accountId,
      amountCents: input.amountCents,
      valueDate: input.valueDate || undefined,
      description: input.description.trim() || null,
      counterpartyId: input.counterpartyId || null,
      tags: input.tags.map((tag) => tag.trim()).filter((tag) => tag !== ''),
    };

    /**
     * Öneriden gelindiyse kayıt ile kuyruk satırı birlikte koşar (`withProposal`). Motorun `invalid` cevabı fırlatılır, çünkü sessizce
     * dönseydi satır "uygulandı" damgası yerdi; fırlatılınca satır sebebiyle `failed`e park eder.
     */
    const outcome = await withProposal(
      input.proposalId,
      staff.profileId,
      async () => {
        // Tedarikçi faturasının ödemesi mal bedelidir: tedarikçiye bağlı alım (`purchase`) olarak yazılır ki tedarikçi borcunu
        // kapatsın; faturanın kabul bağı da ödemeye geçer.
        const document = input.documentId ? await new MoneyDocumentService(serviceDb()).getById(input.documentId) : null;
        if (document?.supplierId && document.direction === 'out') {
          const payment = await recordSupplierPayment({
            supplierId: document.supplierId,
            accountId: shared.accountId,
            amountCents: shared.amountCents,
            stockIntakeId: document.stockIntakeId,
            valueDate: shared.valueDate,
            description: shared.description,
          });
          if (payment.status === 'invalid') throw new Error(invalidMessage(payment.reason));
          return payment;
        }

        const nature = input.nature || null;
        const result =
          input.type === 'expense' && nature === ADVERTISING_NATURE
            ? await recordAdvertisingExpense({ ...shared, campaign: input.campaign })
            : input.type === 'expense'
              ? await recordExpense({ ...shared, nature })
              : await recordMovement({
                  ...shared,
                  type: input.type,
                  // Sermaye girişinin yönü sabit (`in`, motorun kuralı); `misc` serbest, çünkü banka
                  // "para girdi/çıktı" der, sebebini söylemez ve elle girilen karşılığı da öyledir.
                  direction: input.type === 'capital' ? 'in' : input.direction,
                  nature,
                });
        if (result.status === 'invalid') throw new Error(invalidMessage(result.reason));
        return result;
      },
      (result) => ({ moneyMovementId: result.movement.id }),
    );

    revalidateMoney();
    if (input.documentId) {
      const allocated = await allocateToDocument(serviceDb(), { movementId: outcome.movement.id, documentId: input.documentId });
      if (allocated.status === 'invalid') {
        return { data: null, error: `Hareket kaydedildi ama belgeye bağlanamadı: ${ALLOCATION_REASON[allocated.reason]}` };
      }
    }
    return { data: { movementId: outcome.movement.id }, error: null };
  } catch (error) {
    return { data: null, error: getErrorMessage(error) };
  }
}

interface TransferInput {
  fromAccountId: string;
  toAccountId: string;
  /** **Cent** (STACK §8). */
  amountCents: number;
  valueDate: string;
  description: string;
}

/**
 * Transfer: hesaptan hesaba tek satır yazılır, para karşı hesaba ters işaretle yansır (`account_movement`). Operatöre "gelir mi
 * gider mi" sorulmaz, çünkü nakdin bankaya yatırılması iki kutu arasında yer değiştirmedir.
 */
export async function recordTransferAction(input: TransferInput, proposalId?: string): Promise<ActionResult<{ movementId: string }>> {
  try {
    const staff = await requireFinance();

    /**
     * Öneriden gelindiyse kayıt ile kuyruk satırı birlikte koşar; `invalid` fırlatılır, çünkü sessizce dönseydi satır "uygulandı"
     * damgası yerdi (`recordManualMovementAction` künyesi).
     */
    const outcome = await withProposal(
      proposalId,
      staff.profileId,
      async () => {
        const result = await transfer({
          fromAccountId: input.fromAccountId,
          toAccountId: input.toAccountId,
          amountCents: input.amountCents,
          valueDate: input.valueDate || undefined,
          description: input.description.trim() || null,
        });
        if (result.status === 'invalid') throw new Error(invalidMessage(result.reason));
        return result;
      },
      (result) => ({ moneyMovementId: result.movement.id }),
    );
    // Yatırmanın banka satırı transferden önce gelmiş olabilir; bekliyorsa şimdi bağlanır.
    await linkAwaitingTransfers(serviceDb(), input.toAccountId);

    revalidatePath(FINANCE_PATH);
    revalidatePath('/operations/assistant');
    return { data: { movementId: outcome.movement.id }, error: null };
  } catch (error) {
    return { data: null, error: getErrorMessage(error) };
  }
}

// ── Banka satırı: bağla · adını koy · geri al ─────────────────────────────────

/**
 * Banka satırını hedefin parası yapar, operatörün onayıyla: sipariş tahsilatı, müşteri iadesi, açık belge (tutarıyla), mal kabul,
 * transfer ucu, başka hesap, zaten yazılmış hareket ya da cari. Hedefin yönü satıra uymuyorsa kapı reddeder; ekran uymayanı listelemez.
 */
export async function applyMatchAction(movementId: string, target: MatchTarget): Promise<ActionResult<{ ok: true }>> {
  try {
    await requireFinance();
    const outcome = await applyMatch(movementId, target);
    if (outcome.status === 'invalid') return { data: null, error: RECONCILE_REASON[outcome.reason] };

    revalidatePath(FINANCE_PATH);
    return { data: { ok: true }, error: null };
  } catch (error) {
    return { data: null, error: getErrorMessage(error) };
  }
}

/**
 * Hareketin türünü koyar ya da kaldırır (`nature: null`): satırdaki tür seçici, kuyruğun "Gider" menüsü ve seçim penceresinin "adını
 * koy" bölümü. Banka satırında tür koymak satırı mutabık yapar; kaldırmak, başka açıklaması yoksa satırı kuyruğa döndürür.
 */
export async function setMovementNatureAction(movementId: string, nature: string | null): Promise<ActionResult<{ ok: true }>> {
  try {
    await requireFinance();
    const outcome = await setMovementNature(serviceDb(), { movementId, nature });
    if (outcome.status === 'invalid') return { data: null, error: NATURE_REASON[outcome.reason] };

    revalidatePath(FINANCE_PATH);
    return { data: { ok: true }, error: null };
  } catch (error) {
    return { data: null, error: getErrorMessage(error) };
  }
}

/** Hareketin carisini koyar ya da kaldırır; carinin varsayılan türü boş türe geçer. */
export async function setMovementCounterpartyAction(movementId: string, counterpartyId: string | null): Promise<ActionResult<{ ok: true }>> {
  try {
    await requireFinance();
    const outcome = await setMovementCounterparty(serviceDb(), { movementId, counterpartyId });
    if (outcome.status === 'invalid') return { data: null, error: COUNTERPARTY_REASON[outcome.reason] };

    revalidatePath(FINANCE_PATH);
    return { data: { ok: true }, error: null };
  } catch (error) {
    return { data: null, error: getErrorMessage(error) };
  }
}

/**
 * Ekstre satırının eşleşmesini geri alır: satır ekstreden geldiği hâle döner ve kuyruğa gelir; "zaten yazmıştım" birleşmesiyse elle
 * yazılan satır geri kurulur.
 */
export async function unmatchRowAction(movementId: string): Promise<ActionResult<{ ok: true }>> {
  try {
    await requireFinance();
    const outcome = await unmatchRow(movementId);
    if (outcome.status === 'invalid') return { data: null, error: RECONCILE_REASON[outcome.reason] };

    revalidatePath(FINANCE_PATH);
    return { data: { ok: true }, error: null };
  } catch (error) {
    return { data: null, error: getErrorMessage(error) };
  }
}

/** Elle yazılmış hareketin belge bağını kaldırır — hareket ve belge kalır, belgenin açık kalanı geri gelir. */
export async function removeAllocationAction(movementId: string, documentId: string): Promise<ActionResult<{ ok: true }>> {
  try {
    await requireFinance();
    const outcome = await removeAllocation(serviceDb(), { movementId, documentId });
    if (outcome.status === 'invalid') return { data: null, error: ALLOCATION_REASON[outcome.reason] };

    revalidatePath(FINANCE_PATH);
    return { data: { ok: true }, error: null };
  } catch (error) {
    return { data: null, error: getErrorMessage(error) };
  }
}

// ── Liste devamı · sağ panel ──────────────────────────────────────────────────

/**
 * Listenin sonraki sayfası: süzgeçler adresten okunur ki devam eden sayfa ilk sayfayla aynı ölçüte uysun; sayfayı kuran okuma
 * sayfanınkiyle aynıdır (`finance-data.ts`). İmleç istemcide JSON metni olarak durur.
 */
export async function loadMoreLedgerAction(search: string, cursor: string): Promise<ActionResult<Pick<LedgerView, 'rows' | 'nextCursor'>>> {
  try {
    await requireFinance();
    const db = serviceDb();
    const dictionaries = await readDictionaries(db);
    const urlState = withResolvedAccount(parseFinanceUrl(Object.fromEntries(new URLSearchParams(search))), dictionaries.accounts);
    const page = await readLedgerPage(db, urlState, namesOf(dictionaries), JSON.parse(cursor) as KeysetCursor);
    return { data: { rows: page.rows, nextCursor: page.nextCursor }, error: null };
  } catch (error) {
    return { data: null, error: getErrorMessage(error) };
  }
}

/** Belgeler sekmesinin sonraki sayfası — aynı sözleşme. */
export async function loadMoreDocumentsAction(search: string, cursor: string): Promise<ActionResult<Pick<DocumentListView, 'rows' | 'nextCursor'>>> {
  try {
    await requireFinance();
    const db = serviceDb();
    const dictionaries = await readDictionaries(db);
    const urlState = parseFinanceUrl(Object.fromEntries(new URLSearchParams(search)));
    const page = await readDocumentsPage(db, urlState, namesOf(dictionaries), JSON.parse(cursor) as KeysetCursor);
    return { data: { rows: page.rows, nextCursor: page.nextCursor }, error: null };
  } catch (error) {
    return { data: null, error: getErrorMessage(error) };
  }
}

/**
 * Tek hareketin satırları: "devamını yükle" ile gelmiş satır yazımdan sonra kendisi tazelenir, liste baştan istenmez ki operatörün
 * kaydırdığı yer kaybolmasın.
 */
export async function ledgerRowsAction(movementId: string): Promise<ActionResult<MovementRowView[]>> {
  try {
    await requireFinance();
    const db = serviceDb();
    return { data: await readLedgerRows(db, movementId, namesOf(await readDictionaries(db))), error: null };
  } catch (error) {
    return { data: null, error: getErrorMessage(error) };
  }
}

/** Tek belgenin satırı — aynı gerekçe (bağ yazımı belgenin açık kalanını değiştirir). */
export async function documentRowAction(documentId: string): Promise<ActionResult<DocumentRowView | null>> {
  try {
    await requireFinance();
    const db = serviceDb();
    return { data: await readDocumentRow(db, documentId, namesOf(await readDictionaries(db))), error: null };
  } catch (error) {
    return { data: null, error: getErrorMessage(error) };
  }
}

/**
 * Sağ panelin hareket seçicisi: satırın önerileri ve hedefleri menü açılınca istenir. Hesap seçili olmasa da ("Tümü") öneri aynıdır,
 * çünkü kuyruğun hesabına bağlı değildir.
 */
export async function matchOptionsAction(movementId: string): Promise<ActionResult<MatchOptionsView>> {
  try {
    await requireFinance();
    const options = await matchOptions(movementId);
    if (!options) return { data: null, error: RECONCILE_REASON.not_found };
    const natures = await new MovementNatureService(serviceDb()).list();
    return { data: toMatchOptionsView(options, new Map(natures.map((nature) => [nature.slug, nature.label] as const))), error: null };
  } catch (error) {
    return { data: null, error: getErrorMessage(error) };
  }
}

/** Hareketi belgeye bağlar: hareket panelinin "Bağla"sı ve belge panelinin "Ödeme bağla"sı. */
export async function linkDocumentAction(movementId: string, documentId: string): Promise<ActionResult<{ ok: true }>> {
  try {
    await requireFinance();
    const outcome = await linkDocument(movementId, documentId);
    if (outcome.status === 'invalid') return { data: null, error: RECONCILE_REASON[outcome.reason] };

    revalidatePath(FINANCE_PATH);
    return { data: { ok: true }, error: null };
  } catch (error) {
    return { data: null, error: getErrorMessage(error) };
  }
}

/** Belge panelinin ödemeleri ve ödeme adayları; panel açılınca istenir. */
export async function documentPaymentsAction(documentId: string): Promise<ActionResult<DocumentPaymentsView>> {
  try {
    await requireFinance();
    const [options, accounts] = await Promise.all([documentPaymentOptions(documentId), new AccountService(serviceDb()).list()]);
    if (!options) return { data: null, error: DOCUMENT_REASON.not_found };
    return { data: toDocumentPaymentsView(options, new Map(accounts.map((account) => [account.id, account.name] as const))), error: null };
  } catch (error) {
    return { data: null, error: getErrorMessage(error) };
  }
}

// ── Belge ─────────────────────────────────────────────────────────────────────

interface DocumentInput {
  kind: DocumentKind;
  number: string;
  issuedOn: string;
  /** Vade; belgede yazmıyorsa `null`. */
  dueOn: string | null;
  /** Karşı taraf: cari ya da tedarikçi, ikisinden en çok biri. */
  counterpartyId: string | null;
  supplierId: string | null;
  /** Belgenin işi; boşsa kapı karşı tarafın varsayılanından kurar. */
  business: Business | null;
  /** Neyin faturası: mal kabul ya da tedarik siparişi; yalnız tedarikçinin belgesinde, borç bu belgeden türer. */
  stockIntakeId: string | null;
  purchaseOrderId: string | null;
  direction: MovementDirection;
  /** Belgenin türü — ödemesi bağlanınca harekete de geçer. */
  nature: string | null;
  /** **Cent** (STACK §8) — KDV dâhil belge toplamı. */
  amountCents: number;
  /** KDV kırılımı (**cent**); boş dizi = belgede KDV yazmıyor. */
  vatLines: DocumentVatLine[];
  /** KDV rejimi; ters yüklemede satırın KDV'si sıfır, muaf belgede kırılım yok. */
  vatRegime: DocumentVatRegime;
  tags: string[];
  note: string;
}

/**
 * Belge girişi: fatura gelince borç doğar, ödeme sonra hareket olarak gelip bağlanır; dosya ayrı adımda bağlanır, çünkü anahtar
 * belge kimliğinden kurulur. Asistanın önerisi de bu kapıdan yazar (`withProposal`): öneriden gelindiyse ret fırlatılır ki satır
 * "uygulandı" damgası yemesin, ekranın kendi yolunda ret okunur bir cümle olarak döner.
 */
export async function createDocumentAction(input: DocumentInput, proposalId?: string | null): Promise<ActionResult<{ documentId: string }>> {
  try {
    const staff = await requireFinance();
    const db = serviceDb();
    const write = () =>
      createMoneyDocument(db, {
        kind: input.kind,
        number: input.number.trim() || null,
        issuedOn: input.issuedOn,
        dueOn: input.dueOn || null,
        counterpartyId: input.counterpartyId || null,
        supplierId: input.supplierId || null,
        business: input.business,
        stockIntakeId: input.stockIntakeId || null,
        purchaseOrderId: input.purchaseOrderId || null,
        direction: input.direction,
        nature: input.nature || null,
        amountCents: input.amountCents,
        vatLines: input.vatLines,
        vatRegime: input.vatRegime,
        tags: input.tags.map((tag) => tag.trim()).filter((tag) => tag !== ''),
        note: input.note.trim() || null,
      });

    if (!proposalId) {
      const outcome = await write();
      if (outcome.status === 'invalid') return { data: null, error: DOCUMENT_REASON[outcome.reason] };
      revalidatePath(FINANCE_PATH);
      return { data: { documentId: outcome.document.id }, error: null };
    }

    const document = await withProposal(
      proposalId,
      staff.profileId,
      async () => {
        const outcome = await write();
        if (outcome.status === 'invalid') throw new Error(DOCUMENT_REASON[outcome.reason]);
        return outcome.document;
      },
      (written) => ({ moneyDocumentId: written.id }),
    );
    revalidatePath(FINANCE_PATH);
    revalidatePath('/operations/assistant');
    return { data: { documentId: document.id }, error: null };
  } catch (error) {
    return { data: null, error: getErrorMessage(error) };
  }
}

/**
 * "Neyin faturası" seçenekleri: seçili tedarikçinin faturası girilmemiş kabulleri ve açık siparişleri; faturası girilmiş olan
 * girmez, çünkü ikinci bağ aynı alımın borcunu iki kez yazardı (`link_has_document`). Tutarı sıfır görünen kabul listede kalır:
 * sahadan maliyetsiz yapılan kabulün borcu ancak faturasıyla doğar.
 */
export async function documentStockLinksAction(supplierId: string): Promise<ActionResult<StockLinkOption[]>> {
  try {
    await requireFinance();
    const db = serviceDb();
    const [intakes, orders] = await Promise.all([
      new StockIntakeBalanceService(db).listWithoutDocument(supplierId),
      new PurchaseOrderService(db).listOpenBySupplier(supplierId),
    ]);
    const invoiced = new Set((await new MoneyDocumentService(db).listByPurchaseOrders(orders.map((order) => order.id))).map((d) => d.purchaseOrderId));
    return {
      data: [
        ...intakes.map((intake) => ({
          value: `intake:${intake.stockIntakeId}`,
          label: `Mal kabul · ${dayMonth(intake.date)}${intake.note ? ` · ${intake.note}` : ''} · ${money(intake.amountCents)}`,
        })),
        ...orders
          .filter((order) => !invoiced.has(order.id))
          .map((order) => ({
            value: `order:${order.id}`,
            label: `Sipariş · ${order.referenceNo ?? 'numarasız taslak'} · ${dayMonth(order.createdAt.slice(0, 10))}`,
          })),
      ],
      error: null,
    };
  } catch (error) {
    return { data: null, error: getErrorMessage(error) };
  }
}

/** Dosya için kısa ömürlü yükleme izni — tür motordan, anahtar belgeden (istemci ikisini de seçmez). */
export async function requestDocumentUploadAction(
  documentId: string,
  filename: string,
): Promise<ActionResult<{ key: string; uploadUrl: string; contentType: string }>> {
  try {
    await requireFinance();
    const outcome = await requestDocumentUploadUrl(serviceDb(), { documentId, filename });
    if (!outcome.ok) return { data: null, error: DOCUMENT_REASON[outcome.reason] };
    return { data: { key: outcome.key, uploadUrl: outcome.uploadUrl, contentType: outcome.contentType }, error: null };
  } catch (error) {
    return { data: null, error: getErrorMessage(error) };
  }
}

/** Yüklenen dosyayı belgeye bağlar — anahtarın o belgeye ait olduğu biçimden doğrulanır. */
export async function attachDocumentFileAction(documentId: string, key: string): Promise<ActionResult<{ ok: true }>> {
  try {
    await requireFinance();
    const outcome = await attachDocumentFile(serviceDb(), { documentId, key });
    if (outcome.status === 'invalid') return { data: null, error: DOCUMENT_REASON[outcome.reason] };

    revalidatePath(FINANCE_PATH);
    return { data: { ok: true }, error: null };
  } catch (error) {
    return { data: null, error: getErrorMessage(error) };
  }
}

/** Belge dosyasının kısa ömürlü okuma adresi — tıklanınca istenir, listeyle birlikte üretilmez (süresi dolar). */
export async function documentFileUrlAction(documentId: string): Promise<ActionResult<{ url: string }>> {
  try {
    await requireFinance();
    const url = await documentFileUrl(serviceDb(), documentId);
    if (!url) return { data: null, error: DOCUMENT_REASON.storage_unavailable };
    return { data: { url }, error: null };
  } catch (error) {
    return { data: null, error: getErrorMessage(error) };
  }
}

// ── Sözlük: tür · cari · etiket ───────────────────────────────────────────────

/**
 * Sözlüğe etiket ekler. Aynı ad zaten varsa YENİSİ açılmaz, var olanın anahtarı döner: etiket
 * menüsündeki "yeni etiket" operatörün yazdığını satıra koymak ister — ad sözlükte varsa istenen
 * zaten o etikettir.
 */
export async function addTagAction(input: { label: string }): Promise<ActionResult<{ slug: string }>> {
  try {
    await requireFinance();
    const outcome = await addMovementTag(serviceDb(), { label: input.label });
    if (outcome.status === 'invalid') {
      const existing = outcome.reason === 'exists' ? dictionarySlugOf(input.label) : null;
      if (existing) return { data: { slug: existing }, error: null };
      return { data: null, error: TAG_REASON[outcome.reason] };
    }

    revalidateMoney();
    return { data: { slug: outcome.tag.slug }, error: null };
  } catch (error) {
    return { data: null, error: getErrorMessage(error) };
  }
}

/** Etiket silinmez, pasifleşir — eski hareketler onu taşımaya devam eder. */
export async function setTagActiveAction(slug: string, isActive: boolean): Promise<ActionResult<{ ok: true }>> {
  try {
    await requireFinance();
    const outcome = await setMovementTagActive(serviceDb(), slug, isActive);
    if (outcome.status === 'invalid') return { data: null, error: TAG_REASON[outcome.reason] };

    revalidateMoney();
    return { data: { ok: true }, error: null };
  } catch (error) {
    return { data: null, error: getErrorMessage(error) };
  }
}

/**
 * Hareketin etiketlerini yazar: menü her dokunuşta listenin yeni hâlini gönderir, Kaydet düğmesi yoktur. Etiket izah değildir, satırın
 * izahı değişmez.
 */
export async function tagMovementAction(movementId: string, tags: string[]): Promise<ActionResult<{ ok: true }>> {
  try {
    await requireFinance();
    const outcome = await tagMovement(serviceDb(), { movementId, tags: tags.map((tag) => tag.trim()).filter((tag) => tag !== '') });
    if (outcome.status === 'invalid') return { data: null, error: TAG_REASON[outcome.reason] };

    revalidatePath(FINANCE_PATH);
    return { data: { ok: true }, error: null };
  } catch (error) {
    return { data: null, error: getErrorMessage(error) };
  }
}

/** Sözlüğe tür ekler — ad, yön, isteğe bağlı hesap kodu. */
export async function addNatureAction(input: {
  label: string;
  direction: MovementDirection | null;
  accountCode: string;
}): Promise<ActionResult<{ slug: string }>> {
  try {
    await requireFinance();
    const outcome = await addMovementNature(serviceDb(), input);
    if (outcome.status === 'invalid') return { data: null, error: NATURE_REASON[outcome.reason] };

    revalidateMoney();
    return { data: { slug: outcome.nature.slug }, error: null };
  } catch (error) {
    return { data: null, error: getErrorMessage(error) };
  }
}

/** Türün adı, yönü, hesap kodu ya da etkinliği — slug değişmez. */
export async function updateNatureAction(
  slug: string,
  patch: { label?: string; direction?: MovementDirection | null; accountCode?: string | null; isActive?: boolean },
): Promise<ActionResult<{ ok: true }>> {
  try {
    await requireFinance();
    const outcome = await updateMovementNature(serviceDb(), slug, patch);
    if (outcome.status === 'invalid') return { data: null, error: NATURE_REASON[outcome.reason] };

    revalidateMoney();
    return { data: { ok: true }, error: null };
  } catch (error) {
    return { data: null, error: getErrorMessage(error) };
  }
}

interface CounterpartyInput {
  name: string;
  kind: CounterpartyKind;
  keywords: string[];
  defaultNature: string | null;
  /** Boş = iki işle de çalışıyor; belge girişi o zaman işi sorar. */
  defaultBusiness: Business | null;
  note: string;
}

/** Cari ekler — eşleşme kelimeleri, varsayılan türü ve işiyle. */
export async function addCounterpartyAction(input: CounterpartyInput): Promise<ActionResult<{ counterpartyId: string }>> {
  try {
    await requireFinance();
    const outcome = await addCounterparty(serviceDb(), input);
    if (outcome.status === 'invalid') return { data: null, error: COUNTERPARTY_REASON[outcome.reason] };

    revalidateMoney();
    return { data: { counterpartyId: outcome.counterparty.id }, error: null };
  } catch (error) {
    return { data: null, error: getErrorMessage(error) };
  }
}

/** Carinin alanları ya da etkinliği — silinmez, pasifleşir. */
export async function updateCounterpartyAction(
  id: string,
  patch: Partial<CounterpartyInput> & { isActive?: boolean },
): Promise<ActionResult<{ ok: true }>> {
  try {
    await requireFinance();
    const outcome = await updateCounterparty(serviceDb(), id, patch);
    if (outcome.status === 'invalid') return { data: null, error: COUNTERPARTY_REASON[outcome.reason] };

    revalidateMoney();
    return { data: { ok: true }, error: null };
  } catch (error) {
    return { data: null, error: getErrorMessage(error) };
  }
}

/**
 * Hesap ekleme, kurulum işi: Para ekranında durur, çünkü hesabı olmayan kurulumda ekranın söyleyecek bir şeyi yok ve ilk hesabı
 * açacak yer de kendisi olmalı.
 */
export async function createAccountAction(input: {
  name: string;
  /** `partner` da buradan açılır: ortak cari hesabı, ortağın tek kaydı. */
  type: AccountType;
}): Promise<ActionResult<{ accountId: string }>> {
  try {
    await requireFinance();
    const name = input.name.trim();
    if (!name) return { data: null, error: 'Hesap adı boş bırakılamaz.' };

    const account = await new AccountService(serviceDb()).insert({ name, type: input.type });
    revalidatePath(FINANCE_PATH);
    return { data: { accountId: account.id }, error: null };
  } catch (error) {
    return { data: null, error: getErrorMessage(error) };
  }
}

// ── Banka dosyası ─────────────────────────────────────────────────────────────

/**
 * Yükleme penceresinin ilk sorusu: bu hesabın kayıtlı şablonu dosyaya uyuyor mu, uymuyorsa dosya nasıl okunmalı; satırlar tarayıcıda
 * çözülmüş gelir, sunucu yalnız sütunları tanır. Şablon eşlediği her başlık dosyada varsa uyar, yoksa yeni öneri sunulur ki boş kolon
 * okunmasın.
 */
export async function analyzeBankFileAction(
  accountId: string,
  rows: RawBankRow[],
): Promise<ActionResult<{ profile: BankImportProfile | null; suggestion: MappingSuggestion | null }>> {
  try {
    await requireFinance();
    if (rows.length === 0) return { data: null, error: 'Dosyada okunacak satır yok.' };

    const headers = new Set(rows.flatMap((row) => Object.keys(row)));
    const saved = await profileFor(accountId);
    const mapped = saved
      ? [saved.mapping.date, saved.mapping.label, saved.mapping.amount, saved.mapping.debit, saved.mapping.credit].filter((header): header is string => !!header)
      : [];
    if (saved && mapped.every((header) => headers.has(header))) return { data: { profile: saved, suggestion: null }, error: null };
    return { data: { profile: null, suggestion: await analyzeFile(rows) }, error: null };
  } catch (error) {
    return { data: null, error: getErrorMessage(error) };
  }
}

interface BankFileInput {
  accountId: string;
  fileName: string;
  rows: RawBankRow[];
  /** Kayıtlı şablon DEĞİŞMEDEN kullanılıyorsa kimliği; yoksa onaylanan eşleme yeni şablon olur. */
  profileId: string | null;
  profileName: string;
  profile: ParseProfile;
}

/**
 * Dosyayı hesaba yazar: şablon (kayıtlı ya da yeni) + satırlar → hareketler (`importBankRows`,
 * mükerrer koruması veritabanında). Hiçbir satır okunamıyorsa yazım BAŞLAMAZ — boş bir yükleme
 * kaydı, "yükledim" diyen operatörü yanıltırdı.
 */
export async function importBankFileAction(
  input: BankFileInput,
): Promise<ActionResult<{ inserted: number; duplicates: number; linked: number; failures: RowParseFailure[] }>> {
  try {
    await requireFinance();
    const { mapping, amountMode } = input.profile;
    if (!mapping.date || !mapping.label || (amountMode === 'signed' ? !mapping.amount : !(mapping.debit && mapping.credit))) {
      return { data: null, error: 'Tarih, açıklama ve tutar sütunları seçilmeli.' };
    }
    if (parseBankRows(input.rows, input.profile).rows.length === 0) {
      return { data: null, error: 'Bu eşlemeyle hiçbir satır okunamıyor — sütunları kontrol edin.' };
    }

    const profile = input.profileId
      ? await new BankImportProfileService(serviceDb()).getById(input.profileId)
      : await saveProfile({ accountId: input.accountId, name: input.profileName.trim() || 'Banka dosyası', suggestion: input.profile });
    if (!profile || profile.accountId !== input.accountId) return { data: null, error: 'Şablon bulunamadı — sayfayı tazeleyin.' };

    const outcome = await importBankRows({ accountId: input.accountId, profile, fileName: input.fileName, rows: input.rows });
    if (outcome.status === 'pennylane_feed') {
      return {
        data: null,
        error: `Bu hesabın ${outcome.from} ve sonraki hareketleri Pennylane'den geliyor; dosyadan yalnız o günden önceki satırlar yüklenebilir.`,
      };
    }
    revalidatePath(FINANCE_PATH);
    return {
      data: { inserted: outcome.inserted, duplicates: outcome.duplicates, linked: outcome.linked, failures: outcome.failures },
      error: null,
    };
  } catch (error) {
    return { data: null, error: getErrorMessage(error) };
  }
}
