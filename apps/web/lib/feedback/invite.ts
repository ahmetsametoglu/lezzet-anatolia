import 'server-only';
import { completeFeedbackInvite as completeInviteFor, openFeedbackInvite as openInviteFor } from '@lezzet/application';
import type { FeedbackCompletion, FeedbackInviteView } from '@lezzet/application';
import { serviceDb } from '@lezzet/database';
import type { Locale } from '@lezzet/i18n';

/**
 * **Geçiş köprüsü** — alım-sonrası davet akışının (17.2 · 17.6) gövdesi
 * `@lezzet/application/feedback/invite`ta (terfi aşama 2/3, 10.08 · denetim K5-1). Künyenin tamamı
 * orada: token'ın neden oturum yerine geçtiği, yarıda bırakılan akışın nasıl sürdüğü, tamamlama
 * puanının neden beğeniye değil tamamlamaya bağlı olduğu.
 *
 * **Neden köprüye indi.** Daveti artık iki yüzey açıyor — web `/feedback/[token]` sayfası ve mobil
 * vFb ekranının derin bağlantısı. İki nüshanın ikisi de canlıyken puan kuralı bir yerde düzeltilse
 * öteki yerinde kalırdı ve iki dosyanın da kendi testi yeşil görünürdü.
 *
 * **Bu köprü `serviceDb()`yi enjekte ediyor** (`lib/feedback/points.ts`in `rewardCompletedOrder`
 * köprüsüyle aynı desen): paket taşıma bilmez, `db`yi çağıranından alır; web tarafında o çağıran
 * burasıdır. Çağıran sayfa ve action'lar imzayı olduğu gibi kullanmayı sürdürüyor.
 *
 * **Tek şekil farkı kartın görselinde ve bilinçli:** paket `image: StorefrontImage` (`imageOf`)
 * dönüyor, çıplak URL değil — katalog/vitrin kartlarının indirgemesiyle aynı kapı. Oy kartı
 * `card.image.url` okuyor; ikinci bir görsel çözümü yaşamıyor.
 *
 * Testi de pakete bırakıldı (`packages/application/src/feedback/invite.test.ts`) — köprüyü test
 * eden bir test, kuralı test etmiş sayılmaz.
 */
export type { FeedbackCard, FeedbackCompletion, FeedbackInviteView } from '@lezzet/application';

/** **Davetin açılması** — bağlantıdaki token'la. Akışın tek giriş kapısı. */
export function openFeedbackInvite(locale: Locale, token: string): Promise<FeedbackInviteView | null> {
  return openInviteFor(serviceDb(), locale, token);
}

/** **Akışın tamamlanması** — puan burada verilir ve akış sonu belirlenir. */
export function completeFeedbackInvite(token: string): Promise<FeedbackCompletion | null> {
  return completeInviteFor(serviceDb(), token);
}
