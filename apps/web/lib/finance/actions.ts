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
  type CounterpartyKind,
  type DocumentKind,
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

// Para ekranı server action'ları — 'use server' + guard ilk + kapıya devret + `{ data, error }`
// döner (throw yok) + `revalidatePath`.
//
// **Guard `requireFinance`, `requireAdmin` DEĞİL** (09.2'nin kapısı): kasa hareketi ve tedarikçi
// ödemesi muhasebecinin de işidir; ekranın rayda beyan ettiği rol de bu (`ops-nav`: FINANCE). Tek
// rollü `requireAdmin` konsaydı muhasebeci kendi ekranını açıp hiçbir şey yazamazdı.
//
// **İş kuralı burada YOK:** hangi hareketin geçerli olduğuna motor ve uygulama kapıları karar veriyor;
// action'ın işi guard, çeviri ve tazeleme. Kuralı buraya da yazsaydık iki kopya bir gün ayrışırdı.

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
  /** TÜR (13.09) — "bu para neyin parası"; `reklam` ise kampanya sorulur. Boşsa hareket izah bekler. */
  nature: string | null;
  /** Kime ödendi / kimden geldi (13.09). */
  counterpartyId: string | null;
  /** Serbest etiketler. */
  tags: string[];
  /** Reklam giderinde kampanya künyesi (12.5) — analitiğin ROAS köprüsü. Boşsa yazılmaz. */
  campaign: string;
  valueDate: string;
  description: string;
  /** Dayanak belge (12.12): açık belgeden "Ödemesini yaz" ile gelindiyse dolu; ödeme belgeye bağlanır. */
  documentId?: string | null;
}

/**
 * **Elle hareket** — gider, sermaye ya da sınıflandırılmamış.
 *
 * Sipariş tahsilatı ve iade BİLEREK yok (tasarım §6): onlar kendi akışlarından düşer (online ödeme,
 * kapıda tahsilat, kurye gün kapanışı) ve elle girilseydi aynı para iki kez sayılırdı — bir kez
 * akıştan, bir kez elden. Stok alımı da yok: o `purchase` tipi mal kabule ya da tedarikçiye bağlıdır,
 * motor bağsız olanı zaten reddediyor (`supply_link_missing`). **Tek kapı tedarikçinin belgesidir**
 * (12.26): belgeden "Ödemesini yaz" ile gelinen ödenecek tedarikçi belgesinde ödeme ALIM olarak yazılır
 * (`recordSupplierPayment`; tedarikçi ve belgenin kabulü bağlı) — tedarikçi borcu o belgeden türüyor ve
 * gider diye yazılan ödeme borcu hiç kapatmazdı.
 *
 * **Reklam gideri ayrı kapıdan geçer** çünkü tür sabiti tek yerde yaşamalı: `reklam` dizesini burada
 * elle yazsaydık, sabit değişince rapor hata vermeden boşalırdı (12.5'in künyesi: *"sessiz sıfır,
 * yanlış cevabın en kötüsü"*).
 *
 * **Belgeden gelindiyse** ödeme yazıldıktan sonra belgeye bağlanır (13.09: bağ tutarıyla). Bağ
 * düşerse hareket yine yazılmıştır ve cevap bunu SÖYLER — "olmadı" deseydik operatör tekrar girip
 * parayı iki kez yazardı.
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
     * Öneriden gelindiyse kayıt ile kuyruk satırı BİRLİKTE koşar; sıra tek yerde (`withProposal`).
     *
     * **Motorun `invalid` cevabı FIRLATILIR, döndürülmez** — ve bu, sarmalın var olmasının doğrudan
     * sonucu: `invalid` hiçbir şey yazılmadı demek, ama `work()` sessizce dönseydi `withProposal`
     * satırı "uygulandı" diye damgalardı. Kuyruğun söyleyebileceği en kötü yalan bu olurdu.
     * Fırlatınca satır `failed`e park ediyor ve sebebi orada yazıyor.
     */
    const outcome = await withProposal(
      input.proposalId,
      staff.profileId,
      async () => {
        // TEDARİKÇİ FATURASININ ÖDEMESİ (12.26): mal bedelidir — tedarikçiye bağlı ALIM (`purchase`),
        // gider değil. Bir tur "Ödemesini yaz" onu gider olarak yazıyordu: hareket tedarikçi bağı
        // taşımadığı için tedarikçi borcunu hiç kapatmıyordu ve muhasebeci dökümünde mal alımı gider
        // görünüyordu. Faturanın kabul bağı da ödemeye geçer (hangi kabulün parası olduğu görünsün).
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
 * **Transfer** — hesaptan hesaba. TEK satır yazılır; para karşı hesaba ters işaretle yansır
 * (`account_movement` görünümü).
 *
 * Operatöre "gelir mi gider mi" diye sorulmaz ve tasarımın kendi gerekçesi bu: *"tek işlem, iki
 * hesapta simetrik hareket; kullanıcı 'gelir/gider' diye düşünmek zorunda kalmaz"*. Nakit bankaya
 * yatırıldığında işletme ne kazandı ne kaybetti — iki kutu arasında yer değiştirdi.
 */
export async function recordTransferAction(input: TransferInput, proposalId?: string): Promise<ActionResult<{ movementId: string }>> {
  try {
    const staff = await requireFinance();

    /**
     * Öneriden gelindiyse kayıt ile kuyruk satırı BİRLİKTE koşar (22.22) — elle hareketin aynı
     * deseni. `invalid` FIRLATILIR, döndürülmez: hiçbir şey yazılmadı demektir ve sessizce dönseydi
     * satır "uygulandı" damgası yerdi (`recordManualMovementAction` künyesi).
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

    revalidatePath(FINANCE_PATH);
    revalidatePath('/operations/assistant');
    return { data: { movementId: outcome.movement.id }, error: null };
  } catch (error) {
    return { data: null, error: getErrorMessage(error) };
  }
}

// ── Banka satırı: bağla · adını koy · geri al ─────────────────────────────────

/**
 * Banka satırını hedefin parası yapar — **operatörün onayıyla** (12.4 · 12.13): sipariş tahsilatı,
 * müşteri iadesi, açık belge (tutarıyla), mal kabul, transfer ucu, başka hesap, zaten yazılmış
 * hareket ya da cari.
 *
 * Kapının kendisi hiçbir şeyi kendiliğinden uygulamıyor (*"öneri + elle onay, tam otomatik
 * değil"*); bu action o onayın taşıyıcısı. Hedefin yönü satıra uymuyorsa kapı reddeder; ekran zaten
 * uymayanı listelemiyor, kapı son emniyet.
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
 * Hareketin TÜRÜNÜ koyar ya da kaldırır (`nature: null`) — satırdaki tür seçici, kuyruğun "Gider"
 * menüsü ve seçim penceresinin "adını koy" bölümü (13.09 · ikinci karar). Banka satırında tür
 * koymak satırı mutabık yapar; kaldırmak, başka açıklaması yoksa satırı kuyruğa döndürür.
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

/** Hareketin CARİSİNİ koyar ya da kaldırır; carinin varsayılan türü boş türe geçer (13.09). */
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
 * Ekstre satırının eşleşmesini GERİ ALIR (13.09 · kullanıcı bulgusu) — satır ekstreden geldiği hâle
 * döner ve kuyruğa geri gelir; "zaten yazmıştım" birleşmesiyse elle yazılan satır geri kurulur.
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

// ── Liste devamı · sağ panel (12.17) ──────────────────────────────────────────

/**
 * Listenin SONRAKİ sayfası. Süzgeçler adresten okunur (`search`), böylece devam eden sayfa ilk
 * sayfayla aynı ölçüte uyar (müşteri ekranının deseni); sayfayı kuran okuma sayfanınkiyle aynıdır
 * (`finance-data.ts`). İmleç istemcide JSON metni olarak durur.
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
 * Tek hareketin satırları (12.17) — "devamını yükle" ile gelmiş satır yazımdan sonra kendisi
 * tazelenir; listenin tamamı baştan istenmez (operatörün kaydırdığı yer kaybolmasın).
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
 * Sağ panelin hareket seçicisi (12.17 · muhasebeci deseni) — satırın önerileri ve hedefleri, menü
 * açılınca istenir. Hesap seçili olmasa da ("Tümü") aynı öneri: kuyruğun hesabına bağlı değil.
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

/** Hareketi belgeye bağlar — hareket panelinin "Bağla"sı ve belge panelinin "Ödeme bağla"sı (12.17). */
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

/** Belge panelinin ödemeleri ve ödeme adayları (12.17) — panel açılınca istenir. */
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

// ── Belge (12.12) ─────────────────────────────────────────────────────────────

interface DocumentInput {
  kind: DocumentKind;
  number: string;
  issuedOn: string;
  /** Vade (12.26) — belgede yazmıyorsa `null`. */
  dueOn: string | null;
  /** Karşı taraf (13.09): cari YA DA tedarikçi — ikisinden en çok biri. */
  counterpartyId: string | null;
  supplierId: string | null;
  /** Neyin faturası (12.26): mal kabul YA DA tedarik siparişi — yalnız tedarikçinin belgesinde; borç bu belgeden türer. */
  stockIntakeId: string | null;
  purchaseOrderId: string | null;
  direction: MovementDirection;
  /** Belgenin türü — ödemesi bağlanınca harekete de geçer. */
  nature: string | null;
  /** **Cent** (STACK §8) — KDV dâhil belge toplamı. */
  amountCents: number;
  /** **Cent**; `null` = belgede KDV yazmıyor (sıfır "KDV yok" demek olurdu). */
  vatAmountCents: number | null;
  /** KDV rejimi (12.26) — ters yüklemede ve muafiyette belgede KDV olamaz. */
  vatRegime: DocumentVatRegime;
  tags: string[];
  note: string;
}

/**
 * **Belge girişi** — fatura gelince borç doğar; ödeme sonra hareket olarak gelip belgeye bağlanır.
 * Dosya AYRI adımda (`requestDocumentUploadAction` → istemci PUT → `attachDocumentFileAction`):
 * anahtar belge kimliğinden kurulduğu için belge önce doğmak zorunda.
 *
 * **Asistanın belge önerisi de bu kapıdan yazar** (22.44 · `proposalId`): kayıt ile kuyruk satırı
 * BİRLİKTE koşar (`withProposal`) ve kuyruk ikinci bir yazma yolu açmaz. Öneriden gelindiyse kapının
 * reddi FIRLATILIR — hiçbir şey yazılmadı demektir; sessizce dönseydi satır "uygulandı" damgası yerdi
 * (`recordManualMovementAction` künyesi). Ekranın kendi yolunda ret okunur bir cümle olarak döner.
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
        stockIntakeId: input.stockIntakeId || null,
        purchaseOrderId: input.purchaseOrderId || null,
        direction: input.direction,
        nature: input.nature || null,
        amountCents: input.amountCents,
        vatAmountCents: input.vatAmountCents,
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
 * "Neyin faturası" seçenekleri (12.26) — seçili tedarikçinin FATURASI GİRİLMEMİŞ kabulleri ve açık
 * siparişleri. Faturası girilmiş olan (belgesi kabulün kendisine ya da siparişine bağlı) listeye
 * girmez: ikinci bir bağ aynı alımın borcunu iki kez yazardı — kapı da reddeder (`link_has_document`).
 * Tutarı sıfır görünen kabul BİLEREK listede: sahadan maliyetsiz yapılan kabuldür ve borcu ancak
 * faturasıyla doğar.
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

// ── Sözlük: tür · cari · etiket (13.09) ───────────────────────────────────────

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
 * Hareketin etiketlerini yazar — menü her dokunuşta listenin yeni hâlini gönderir (Kaydet yok,
 * kullanıcı isteği 13.09). Etiket izah değildir: satırın izahı değişmez.
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
  note: string;
}

/** Cari ekler — eşleşme kelimeleri ve varsayılan türüyle. */
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
 * Hesap ekleme — kurulum işi, nadir (tasarım §3).
 *
 * Ekranda duruyor çünkü hesabı olmayan bir kurulumda Para ekranının söyleyecek hiçbir şeyi yok:
 * "para bir hesapta durur" diyen bir yüzeyin ilk hesabı açacak yeri de kendisi olmalı. Ayarlara
 * konsaydı operatör boş ekrandan çıkıp aramak zorunda kalırdı.
 */
export async function createAccountAction(input: {
  name: string;
  /** `partner` da buradan açılır (13.09): ortak cari hesabı — ortağın tek kaydı. */
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

// ── Banka dosyası (12.10) ─────────────────────────────────────────────────────

/**
 * Yükleme penceresinin ilk sorusu: bu hesabın kayıtlı şablonu bu dosyaya uyuyor mu, uymuyorsa
 * dosya nasıl okunmalı? Satırlar TARAYICIDA çözülmüş gelir (dosya değil); sunucu yalnız sütunları
 * tanır. Şablon "uyar" = eşlediği her başlık dosyada var — banka dışa aktarımını değiştirmişse
 * şablon sessizce boş kolon okutmasın, yeni öneri sunulsun.
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
): Promise<ActionResult<{ inserted: number; duplicates: number; failures: RowParseFailure[] }>> {
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
    revalidatePath(FINANCE_PATH);
    return { data: { inserted: outcome.inserted, duplicates: outcome.duplicates, failures: outcome.failures }, error: null };
  } catch (error) {
    return { data: null, error: getErrorMessage(error) };
  }
}
