'use server';

import { revalidatePath } from 'next/cache';
import { DEFAULT_PAGE_SIZE, type KeysetCursor, type Page, type PointsEntry, type ReviewStatus } from '@lezzet/types';
import { requireAdmin } from '@/lib/guard';
import { getErrorMessage, type ActionResult } from '@/lib/error';
import { agoShort } from '@/components/operation/ui/format';
import { listModerationQueue } from '@/lib/feedback/moderation-read';
import { moderateReview } from '@/lib/feedback/product-feedback';
import { adjustPointsManually, listPointsHistory } from '@/lib/feedback/points';
import { toModerationCards } from './feedback-read';
import type { ModerationCardView } from './feedback-types';
import { FEEDBACK_PATH } from './feedback-url';

// Geri Bildirim ekranının yazma ve devam-okuma kapıları (17.1 · 17.4) — guard ilk, kapıya devret,
// `{ data, error }` DÖNER (CLAUDE.md §2).
//
// **Hepsi `requireAdmin`** (`admin-geri-bildirim.md §1`): yayına çıkacak metne karar vermek ve bir
// müşterinin puanını elle oynatmak yönetim işidir. Kapı burada durur — düğmeyi çizmemek bir güvence
// değildir, action doğrudan da çağrılabilir.
//
// **İş kuralı burada YOK.** Hangi geçişin geçerli olduğunu motor söylüyor (`canModerate`:
// metinsiz kayıt moderasyona girmez, aynı hâle ikinci kez geçilmez); puan tavanları ve defterin
// işareti `lib/feedback/points`'te. Buradaki tek çeviri, kapının reddini operatörün cümlesine
// döndürmek.

/**
 * Kapı reddinin OPERATÖRE söylenecek hâli. Ham anahtar ("nothing_to_read") ekranda gösterilirse
 * operatör ne yapacağını bilemez. Tanınmayan anahtar için ham hâli gösterilir — sessiz boş bir
 * uyarıdansa anlaşılmaz ama GÖRÜNÜR bir işaret yeğdir.
 */
const REJECTION: Record<string, string> = {
  not_found: 'Yorum bulunamadı — bu sırada silinmiş olabilir. Ekranı tazeleyin.',
  nothing_to_read: 'Bu kayıtta okunacak metin yok; yalnız puan/beğeni moderasyona girmez.',
  already_in_status: 'Bu yorum zaten bu durumda.',
  // Puan kapısının kendi redleri (`adjustPointsManually`). İkisi de formda önden eleniyor ama
  // sözlükte durmaları şart: action doğrudan da çağrılabilir ve o zaman ham anahtar dönerdi.
  zero_points: 'Değişim sıfır olamaz — puan eklenecekse artı, düşülecekse eksi yazın.',
  note_required: 'Sebep yazılmadan puan düzeltilemez; iz kaydına o cümle yazılıyor.',
};

function rejectionText(reason: string): string {
  return REJECTION[reason] ?? reason;
}

/**
 * Yorumu onayla / reddet / geri çek.
 *
 * Tek action üç işi de görüyor çünkü üçü de AYNI geçiş: hedef durum parametre. Ayrı action'lar
 * yazılsaydı üçü de aynı guard'ı, aynı reddi ve aynı tazelemeyi kopyalardı.
 */
export async function moderateReviewAction(reviewId: string, to: Exclude<ReviewStatus, 'pending'>): Promise<ActionResult<null>> {
  try {
    const staff = await requireAdmin();
    const result = await moderateReview({ reviewId, to, moderatorId: staff.id });
    if (!result.ok) return { data: null, error: rejectionText(result.reason) };

    // Sayfa tazelenir çünkü karar İKİ yeri birden değiştirir: kart kuyruktan düşer ve sekme rozeti
    // (bekleyen sayısı) azalır. Yalnız satırı istemcide silmek rozeti bayat bırakırdı.
    revalidatePath(FEEDBACK_PATH);
    return { data: null, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

/**
 * Elle puan düzeltme — jest ya da düzeltme, **iz kaydıyla**.
 *
 * Sebep ZORUNLU ve bu bir form nezaketi değil: defterde sebepsiz bir düzeltme, altı ay sonra
 * "bu 50 puan neden verilmiş" sorusuna cevapsız kalır. Kapı sebebi kaydın kendisine yazıyor.
 */
export async function adjustPointsAction(input: { customerId: string; delta: number; reason: string }): Promise<ActionResult<null>> {
  const reason = input.reason.trim();
  if (!reason) return { data: null, error: 'Sebep yazılmadan puan düzeltilemez — iz kaydına o cümle yazılıyor.' };
  if (!Number.isInteger(input.delta) || input.delta === 0) {
    return { data: null, error: 'Değişim sıfırdan farklı bir tam sayı olmalı.' };
  }

  try {
    const staff = await requireAdmin();
    const result = await adjustPointsManually({ customerId: input.customerId, points: input.delta, note: reason, staffId: staff.id });
    if (!result.ok) return { data: null, error: rejectionText(result.reason) };

    revalidatePath(FEEDBACK_PATH);
    return { data: null, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

/**
 * Moderasyon kuyruğunun SONRAKİ sayfası (keyset).
 *
 * İmleç adrese yazılmaz (CLAUDE.md §1), o yüzden devam okuması bir action: istemci elindeki son
 * imleci geri verir. `now` burada alınır — kuyruk saatlerce açık kalabilir ve ilk sayfanın `now`'u
 * ile devam sayfasınınki arasındaki fark yaş etiketlerinde birikirdi.
 */
export async function loadMoreReviewsAction(
  status: ReviewStatus,
  cursor: KeysetCursor,
): Promise<ActionResult<Page<ModerationCardView>>> {
  try {
    await requireAdmin();
    const page = await listModerationQueue(status, cursor, DEFAULT_PAGE_SIZE);
    return { data: { rows: toModerationCards(page.rows, Date.now(), agoShort), nextCursor: page.nextCursor }, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

/**
 * Bir müşterinin puan GEÇMİŞİ — defterin kendisi.
 *
 * Tablo yalnız özet gösteriyor (bakiye · çevrilen toplam · son hareketin zamanı); "nereden geldi,
 * ne zaman çevirdi" sorusunun cevabı burada. Elle düzeltme penceresi bunu üstte gösteriyor çünkü
 * karar sırası öyle: operatör önce neyin üstüne yazdığını görmeli.
 *
 * İlk sayfa yeter (`DEFAULT_PAGE_SIZE`): pencere bir inceleme yüzeyi değil, bir karar yüzeyi. Daha
 * derin geçmiş gerekiyorsa o, müşteri detayının işi.
 */
export async function loadPointsHistoryAction(customerId: string): Promise<ActionResult<PointsEntry[]>> {
  try {
    await requireAdmin();
    const page = await listPointsHistory(customerId, undefined, DEFAULT_PAGE_SIZE);
    return { data: page.rows, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}
