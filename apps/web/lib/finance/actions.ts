'use server';

import { revalidatePath } from 'next/cache';
import { AccountService, serviceDb } from '@lezzet/database';
import type { MovementDirection } from '@lezzet/types';
import { requireFinance } from '@/lib/guard';
import { withProposal } from '@/lib/assistant/handoff';
import { getErrorMessage, type ActionResult } from '@/lib/error';
import { recordAdvertisingExpense, recordExpense, recordMovement, transfer } from '@/lib/money/movement';
import { applyOrderMatch, classifyAsExpense, dismissRow } from '@/lib/bank/reconcile';
import { ADVERTISING_CATEGORY } from '@lezzet/types';
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
  category: string;
  /** Reklam giderinde kampanya etiketi (12.5) — analitiğin ROAS köprüsü. Boşsa yazılmaz. */
  campaign: string;
  valueDate: string;
  description: string;
}

/**
 * **Elle hareket** — gider, sermaye ya da sınıflandırılmamış.
 *
 * Sipariş tahsilatı ve iade BİLEREK yok (tasarım §6): onlar kendi akışlarından düşer (online ödeme,
 * kapıda tahsilat, kurye gün kapanışı) ve elle girilseydi aynı para iki kez sayılırdı — bir kez
 * akıştan, bir kez elden. Stok alımı da yok: o `purchase` tipi mal kabule bağlıdır, motor bağsız
 * olanı zaten reddediyor (`supply_link_missing`).
 *
 * **Reklam gideri ayrı kapıdan geçer** çünkü kategori sabiti tek yerde yaşamalı: `advertising`
 * dizesini burada elle yazsaydık, sabit değişince rapor hata vermeden boşalırdı (12.5'in künyesi:
 * *"sessiz sıfır, yanlış cevabın en kötüsü"*).
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
        const result =
          input.type === 'expense' && input.category === ADVERTISING_CATEGORY
            ? await recordAdvertisingExpense({ ...shared, campaign: input.campaign })
            : input.type === 'expense'
              ? await recordExpense({ ...shared, category: input.category.trim() })
              : await recordMovement({
                  ...shared,
                  type: input.type,
                  // Sermaye girişinin yönü sabit (`in`, motorun kuralı); `misc` serbest, çünkü banka
                  // "para girdi/çıktı" der, sebebini söylemez ve elle girilen karşılığı da öyledir.
                  direction: input.type === 'capital' ? 'in' : input.direction,
                  category: input.category.trim() || null,
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
 * Banka satırını bir siparişin tahsilatı yapar — **operatörün onayıyla**.
 *
 * Kapının kendisi hiçbir şeyi kendiliğinden uygulamıyor (12.4: *"öneri + elle onay, tam otomatik
 * değil"*); bu action o onayın taşıyıcısı. Yanlış eşleşmenin bedeli sessizdir: ödeyen müşteri
 * borçlu kalır, başka bir sipariş "ödendi" görünür ve kimse fark etmez.
 */
export async function applyMatchAction(movementId: string, orderId: string): Promise<ActionResult<{ ok: true }>> {
  try {
    await requireFinance();
    const outcome = await applyOrderMatch(movementId, orderId);
    if (outcome.status === 'invalid') return { data: null, error: RECONCILE_REASON[outcome.reason] };

    revalidatePath(FINANCE_PATH);
    return { data: { ok: true }, error: null };
  } catch (error) {
    return { data: null, error: getErrorMessage(error) };
  }
}

/** Satır bir giderdir — tipi/kategorisi yazılır, kuyruktan düşer. Hareket SİLİNMEZ, adı konur. */
export async function classifyExpenseAction(movementId: string, category: string): Promise<ActionResult<{ ok: true }>> {
  try {
    await requireFinance();
    const trimmed = category.trim();
    if (!trimmed) return { data: null, error: 'Gider kategorisi boş bırakılamaz.' };

    const outcome = await classifyAsExpense(movementId, trimmed);
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

/**
 * Hesap ekleme — kurulum işi, nadir (tasarım §3).
 *
 * Ekranda duruyor çünkü hesabı olmayan bir kurulumda Para ekranının söyleyecek hiçbir şeyi yok:
 * "para bir hesapta durur" diyen bir yüzeyin ilk hesabı açacak yeri de kendisi olmalı. Ayarlara
 * konsaydı operatör boş ekrandan çıkıp aramak zorunda kalırdı.
 */
export async function createAccountAction(input: {
  name: string;
  type: 'cash' | 'bank' | 'provider';
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
