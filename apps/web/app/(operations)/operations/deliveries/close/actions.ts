'use server';

import { revalidatePath } from 'next/cache';
import { closeCourierDay } from '@/lib/courier/day-close';
import { getErrorMessage, type ActionResult } from '@/lib/error';
import { requireCourier } from '@/lib/guard';

// Gün kapanışının tek yazma yolu (11.6) — guard ilk, kapıya devret, `{ data, error }` dön.

/**
 * **Günü kapat.** Kurye kimliği guard'dan geliyor; tarih de adresten DEĞİL, kapının kendi "bugün"ünden
 * — geçmiş bir günü adrese yazıp yeniden kapatmak diye bir yol açılmadı (tasarım §6: kapanmış gün
 * salt-okunur).
 *
 * `already_closed` bir hata değil bir GERÇEKTİR ama kullanıcıya yine de söylenir: ekran o an
 * tazelenir ve kapanmış hâli gösterir.
 */
export async function closeDayAction(input: {
  date: string;
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
          ? 'Bu gün zaten kapatılmış — kayıt ezilmedi. Ekranı tazeleyin.'
          : 'Gün kapatılamadı.',
      );
    }

    revalidatePath('/operations/deliveries/close');
    revalidatePath('/operations/deliveries');
    return { data: { reconciled: result.reconciled === true }, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}
