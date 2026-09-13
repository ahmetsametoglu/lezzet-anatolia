'use server';

import { revalidatePath } from 'next/cache';
import { AccountService, serviceDb } from '@lezzet/database';
import type { AccountType, MovementDirection } from '@lezzet/types';
import { requireFinance } from '@/lib/guard';
import { withProposal } from '@/lib/assistant/handoff';
import { getErrorMessage, type ActionResult } from '@/lib/error';
import { recordAdvertisingExpense, recordExpense, recordMovement, transfer } from '@/lib/money/movement';
import { applyMatch, classifyRow, dismissRow, type ClassifyType, type MatchTarget } from '@/lib/bank/reconcile';
import { ADVERTISING_TAG, type DocumentKind, type MovementDirection as DocumentDirection } from '@lezzet/types';
import {
  addMovementTag,
  attachDocumentFile,
  createMoneyDocument,
  documentFileUrl,
  requestDocumentUploadUrl,
  setMovementTagActive,
  tagMovement,
} from '@lezzet/application';
import { DOCUMENT_REASON, TAG_REASON } from '@/app/(operations)/operations/finance/finance-labels';
import { INVALID_REASON, RECONCILE_REASON } from '@/app/(operations)/operations/finance/finance-labels';
import { FINANCE_PATH } from '@/app/(operations)/operations/finance/finance-url';
import type { ManualType } from '@/components/operation/form/movement-form/schema';

// Para ekranı server action'ları — 'use server' + guard ilk + kapıya devret + `{ data, error }`
// döner (throw yok) + `revalidatePath`.
//
// **Guard `requireFinance`, `requireAdmin` DEĞİL** (09.2'nin kapısı): kasa hareketi ve tedarikçi
// ödemesi muhasebecinin de işidir; ekranın rayda beyan ettiği rol de bu (`ops-nav`: FINANCE). Tek
// rollü `requireAdmin` konsaydı muhasebeci kendi ekranını açıp hiçbir şey yazamazdı.
//
// **İş kuralı burada YOK:** hangi hareketin geçerli olduğuna motor karar veriyor
// (`domain-core/money.validateMovement`, kapının içinden çağrılıyor); action'ın işi guard, çeviri
// ve tazeleme. Kuralı buraya da yazsaydık iki kopya bir gün ayrışırdı.

/** Motorun reddini operatörün diline çevirir; bilinmeyen sebep ham bırakılmaz, genel cümleye düşer. */
function invalidMessage(reason: string): string {
  return INVALID_REASON[reason as keyof typeof INVALID_REASON] ?? 'Bu hareket kaydedilemedi — alanları gözden geçirin.';
}

interface ManualMovementInput {
  accountId: string;
  type: ManualType;
  /** **Cent** (STACK §8) — işaretsiz; yönü tip belirler, `misc` dışında sorulmaz. */
  amountCents: number;
  /** Yalnız `misc` için anlamlı: sebebi bilinmeyen paranın yönü kullanıcıdan gelir. */
  direction: MovementDirection;
  /** Sözlükten etiket slug'ları (13.09) — giderde en az bir tane; `reklam` varsa kampanya sorulur. */
  tags: string[];
  /** Reklam giderinde kampanya künyesi (12.5) — analitiğin ROAS köprüsü. Boşsa yazılmaz. */
  campaign: string;
  valueDate: string;
  description: string;
  /** Dayanak belge (12.12): açık belgeden "Ödemesini yaz" ile gelindiyse dolu; ödeme belgeye bağlı doğar. */
  documentId?: string | null;
}

/**
 * **Elle hareket** — gider, sermaye ya da sınıflandırılmamış.
 *
 * Sipariş tahsilatı ve iade BİLEREK yok (tasarım §6): onlar kendi akışlarından düşer (online ödeme,
 * kapıda tahsilat, kurye gün kapanışı) ve elle girilseydi aynı para iki kez sayılırdı — bir kez
 * akıştan, bir kez elden. Stok alımı da yok: o `purchase` tipi mal kabule bağlıdır, motor bağsız
 * olanı zaten reddediyor (`supply_link_missing`).
 *
 * **Reklam gideri ayrı kapıdan geçer** çünkü etiket sabiti tek yerde yaşamalı: `reklam` dizesini
 * burada elle yazsaydık, sabit değişince rapor hata vermeden boşalırdı (12.5'in künyesi: *"sessiz
 * sıfır, yanlış cevabın en kötüsü"*).
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
      documentId: input.documentId ?? null,
    };

    /**
     * Öneriden gelindiyse kayıt ile kuyruk satırı BİRLİKTE koşar; sıra tek yerde (`withProposal`).
     *
     * **Motorun `invalid` cevabı FIRLATILIR, döndürülmez** — ve bu, sarmalın var olmasının doğrudan
     * sonucu: `invalid` hiçbir şey yazılmadı demek, ama `work()` sessizce dönseydi `withProposal`
     * satırı "uygulandı" diye damgalardı. Kuyruğun söyleyebileceği en kötü yalan bu olurdu.
     * Fırlatınca satır `failed`e park ediyor ve sebebi orada yazıyor.
     *
     * Elle giriş yolunda (öneri yok) davranış AYNI kalıyor: fırlatılan cümle dışarıdaki `catch`ten
     * geçip aynı metinle dönüyor.
     */
    const outcome = await withProposal(
      input.proposalId,
      staff.profileId,
      async () => {
        const tags = input.tags.map((tag) => tag.trim()).filter((tag) => tag !== '');
        const result =
          input.type === 'expense' && tags.includes(ADVERTISING_TAG)
            ? await recordAdvertisingExpense({ ...shared, tags, campaign: input.campaign })
            : input.type === 'expense'
              ? await recordExpense({ ...shared, tags })
              : await recordMovement({
                  ...shared,
                  type: input.type,
                  // Sermaye girişinin yönü sabit (`in`, motorun kuralı); `misc` serbest, çünkü banka
                  // "para girdi/çıktı" der, sebebini söylemez ve elle girilen karşılığı da öyledir.
                  direction: input.type === 'capital' ? 'in' : input.direction,
                  tags,
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
     * deseni. Transfer bir tur kuyruğun DIŞINDA bırakılmıştı ("kendi kapısı var") ama kuyruk yine
     * de boş bir form açıyordu: tutarsız, kaydedilemez ve dilekçeyi silinmiş gibi gösteren bir hâl.
     *
     * `invalid` FIRLATILIR, döndürülmez: hiçbir şey yazılmadı demektir ve sessizce dönseydi satır
     * "uygulandı" damgası yerdi (`recordManualMovementAction` künyesi).
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

/**
 * Banka satırını hedefin parası yapar — **operatörün onayıyla** (12.4 · 12.13): sipariş tahsilatı,
 * müşteri iadesi, açık belge, mal kabul, transfer ucu, başka hesap ya da zaten yazılmış hareket.
 *
 * Kapının kendisi hiçbir şeyi kendiliğinden uygulamıyor (*"öneri + elle onay, tam otomatik
 * değil"*); bu action o onayın taşıyıcısı. Yanlış eşleşmenin bedeli sessizdir: ödeyen müşteri
 * borçlu kalır, başka bir sipariş "ödendi" görünür ve kimse fark etmez. Hedefin yönü satıra
 * uymuyorsa kapı reddeder; ekran zaten uymayanı listelemiyor, kapı son emniyet.
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
 * Satırın ADI konur — gider (çıkış) ya da sermaye (giriş) — tipi ve etiketleri yazılır, kuyruktan
 * düşer. Hareket SİLİNMEZ. Etiket şart: adı konmuş ama etiketsiz satır izah kuyruğunda kalırdı ve
 * "sınıfladım" diyen operatör onu bir daha görürdü.
 */
export async function classifyRowAction(movementId: string, type: ClassifyType, tags: string[]): Promise<ActionResult<{ ok: true }>> {
  try {
    await requireFinance();
    const clean = tags.map((tag) => tag.trim()).filter((tag) => tag !== '');
    if (clean.length === 0 && type !== 'misc') {
      return { data: null, error: type === 'expense' ? 'Gidere en az bir etiket seçilmeli.' : 'Sermaye girişine en az bir etiket seçilmeli (ör. sermaye, ortak).' };
    }

    const outcome = await classifyRow(movementId, { type, tags: clean });
    if (outcome.status === 'invalid') return { data: null, error: RECONCILE_REASON[outcome.reason] };

    revalidatePath(FINANCE_PATH);
    return { data: { ok: true }, error: null };
  } catch (error) {
    return { data: null, error: getErrorMessage(error) };
  }
}

/**
 * "Bu satır bir şeye bağlanmıyor" — kuyruktan düşer, hareket kalır.
 *
 * Kapının künyesi sebebini yazıyor: bakiyede duran parayı kuyruğu temizlemek için silmek, kasayı
 * kaydırmak olurdu. Ekran da bu yüzden "Atla" diyor, "Sil" demiyor.
 */
export async function dismissMatchAction(movementId: string): Promise<ActionResult<{ ok: true }>> {
  try {
    await requireFinance();
    const outcome = await dismissRow(movementId);
    if (outcome.status === 'invalid') return { data: null, error: RECONCILE_REASON[outcome.reason] };

    revalidatePath(FINANCE_PATH);
    return { data: { ok: true }, error: null };
  } catch (error) {
    return { data: null, error: getErrorMessage(error) };
  }
}

// ── Belge (12.12) ─────────────────────────────────────────────────────────────

interface DocumentInput {
  kind: DocumentKind;
  number: string;
  issuedOn: string;
  counterparty: string;
  supplierId: string | null;
  direction: DocumentDirection;
  /** **Cent** (STACK §8) — KDV dâhil belge toplamı. */
  amountCents: number;
  /** **Cent**; `null` = belgede KDV yazmıyor (sıfır "KDV yok" demek olurdu). */
  vatAmountCents: number | null;
  tags: string[];
  note: string;
}

/**
 * **Belge girişi** — fatura gelince borç doğar; ödeme sonra hareket olarak gelip belgeye bağlanır.
 * Dosya AYRI adımda (`requestDocumentUploadAction` → istemci PUT → `attachDocumentFileAction`):
 * anahtar belge kimliğinden kurulduğu için belge önce doğmak zorunda.
 */
export async function createDocumentAction(input: DocumentInput): Promise<ActionResult<{ documentId: string }>> {
  try {
    await requireFinance();
    const outcome = await createMoneyDocument(serviceDb(), {
      kind: input.kind,
      number: input.number.trim() || null,
      issuedOn: input.issuedOn,
      counterparty: input.counterparty.trim() || null,
      supplierId: input.supplierId || null,
      direction: input.direction,
      amountCents: input.amountCents,
      vatAmountCents: input.vatAmountCents,
      tags: input.tags.map((tag) => tag.trim()).filter((tag) => tag !== ''),
      note: input.note.trim() || null,
    });
    if (outcome.status === 'invalid') return { data: null, error: DOCUMENT_REASON[outcome.reason] };

    revalidatePath(FINANCE_PATH);
    return { data: { documentId: outcome.document.id }, error: null };
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

// ── Etiket sözlüğü + izah (12.12) ─────────────────────────────────────────────

/** Sözlüğe etiket ekler; `partner` işaretlisi `ortak:<ad>` olur. */
export async function addTagAction(input: { label: string; partner: boolean }): Promise<ActionResult<{ slug: string }>> {
  try {
    await requireFinance();
    const outcome = await addMovementTag(serviceDb(), { label: input.label, partner: input.partner });
    if (outcome.status === 'invalid') return { data: null, error: TAG_REASON[outcome.reason] };

    revalidatePath(FINANCE_PATH);
    revalidatePath('/operations/assistant');
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

    revalidatePath(FINANCE_PATH);
    revalidatePath('/operations/assistant');
    return { data: { ok: true }, error: null };
  } catch (error) {
    return { data: null, error: getErrorMessage(error) };
  }
}

/**
 * Hareketi etiketler — izah kuyruğunu kapatan yol: bağı ve belgesi olmayan satır etiket alınca
 * izahlı olur. Liste YERİNE KONUR (eklenmez): ekranın gösterdiği çipler operatörün gönderdiği liste.
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

/**
 * Hesap ekleme — kurulum işi, nadir (tasarım §3).
 *
 * Ekranda duruyor çünkü hesabı olmayan bir kurulumda Para ekranının söyleyecek hiçbir şeyi yok:
 * "para bir hesapta durur" diyen bir yüzeyin ilk hesabı açacak yeri de kendisi olmalı. Ayarlara
 * konsaydı operatör boş ekrandan çıkıp aramak zorunda kalırdı.
 */
export async function createAccountAction(input: {
  name: string;
  /** `partner` da buradan açılır (13.09): ortak cari hesabı, hesap ekranının kendi işi. */
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
