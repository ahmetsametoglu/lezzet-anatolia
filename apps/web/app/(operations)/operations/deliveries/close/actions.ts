'use server';

import { revalidatePath } from 'next/cache';
import { closeCourierDay } from '@/lib/courier/day-close';
import { getErrorMessage, type ActionResult } from '@/lib/error';
import { requireCourier } from '@/lib/guard';

// Sefer kapanışının tek yazma yolu (11.7 · 18.08) — guard ilk, kapıya devret, `{ data, error }` dön.

/**
 * **Seferi kapat.** Kurye kimliği guard'dan geliyor; kapanışın öznesi taslağın getirdiği SEFER —
 * adresten sefer kimliği yazıp başkasının seferini kapatmak diye bir yol yok: kapı sahipliği run
 * kaydından doğrular ("yok" ile "senin değil" aynı cevap).
 *
 * `already_closed` bir hata değil bir GERÇEKTİR ama kullanıcıya yine de söylenir: ekran o an
 * tazelenir ve kapanmış hâli gösterir.
 */
export async function closeDayAction(input: {
  runId: string;
  countedCashCents: number;
  countedCardCents: number;
  countedChequeCents: number;
  note: string | null;
}): Promise<ActionResult<{ reconciled: boolean }>> {
  try {
    const courier = await requireCourier();

    const result = await closeCourierDay({ courierId: courier.profileId, ...input });
    if (!result.ok) {
      throw new Error(
        result.reason === 'already_closed'
          ? 'Bu sefer zaten kapatılmış — kayıt ezilmedi. Ekranı tazeleyin.'
          : 'Sefer kapatılamadı.',
      );
    }

    revalidatePath('/operations/deliveries/close');
    revalidatePath('/operations/deliveries');
    return { data: { reconciled: result.reconciled === true }, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}
