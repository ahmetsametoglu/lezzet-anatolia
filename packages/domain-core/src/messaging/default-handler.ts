import { TicketHandlerEnum, type TicketHandler } from '@lezzet/types';

/**
 * Yeni sohbetin yürütücüsü bir işletme tercihidir, bu yüzden koda değil `settings`e yazılır ve Ayarlar ile Sosyal Mesajlar aynı
 * satırı okur. Yalnız satır doğarken uygulanır, ki operatörün açık bir sohbet için verdiği karar genel ayarla sessizce ezilmesin.
 */

export const CONVERSATION_DEFAULT_HANDLER_KEY = 'conversation_default_handler';

/** Fabrika değeri — migration'ın yazdığı satırla AYNI (`settings-catalog.test.ts` doğrular). */
export const CONVERSATION_DEFAULT_HANDLER_FALLBACK: TicketHandler = 'ai';

/** Ayarın operatöre görünen açıklaması — sözlük ve sosyal ekranın yazdığı `description` aynı cümle. */
export const CONVERSATION_DEFAULT_HANDLER_HELP =
  'Müşteri İLK kez yazdığında sohbeti kim yürütsün: İnsan (operatör cevaplar), Hibrit (AI taslak yazar, operatör onaylar), AI (ajan onaysız cevaplar). Açık sohbetlerin modu değişmez — her sohbette anahtar ayrıca çevrilebilir.';

/** Ayar satırındaki ham değeri moda çevirir; tanınmayan değer fabrika değerine düşer. */
export function resolveDefaultHandler(raw: unknown): TicketHandler {
  const parsed = TicketHandlerEnum.safeParse(raw);
  return parsed.success ? parsed.data : CONVERSATION_DEFAULT_HANDLER_FALLBACK;
}
