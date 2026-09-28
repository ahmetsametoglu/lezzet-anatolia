import { TicketHandlerEnum, type TicketHandler } from '@lezzet/types';

/**
 * Yeni sohbetin ve yeni talebin yürütücüsü bir işletme tercihidir, bu yüzden koda değil `settings`e yazılır ve Ayarlar ile kendi
 * ekranı aynı satırı okur. Yalnız satır doğarken uygulanır, ki operatörün açık bir kayıt için verdiği karar genel ayarla ezilmesin.
 */

export const CONVERSATION_DEFAULT_HANDLER_KEY = 'conversation_default_handler';

/** Fabrika değeri — migration'ın yazdığı satırla AYNI (`settings-catalog.test.ts` doğrular). */
export const CONVERSATION_DEFAULT_HANDLER_FALLBACK: TicketHandler = 'ai';

/** Ayarın operatöre görünen açıklaması — sözlük ve sosyal ekranın yazdığı `description` aynı cümle. */
export const CONVERSATION_DEFAULT_HANDLER_HELP =
  'Müşteri İLK kez yazdığında sohbeti kim yürütsün: İnsan (operatör cevaplar), Hibrit (AI taslak yazar, operatör onaylar), AI (ajan onaysız cevaplar). Açık sohbetlerin modu değişmez — her sohbette anahtar ayrıca çevrilebilir.';

export const TICKET_DEFAULT_HANDLER_KEY = 'ticket_default_handler';

/** Fabrika değeri hibrit: talep çoğu zaman şikâyet taşır ve AI modunda cevap müşteriye onaysız gider. */
export const TICKET_DEFAULT_HANDLER_FALLBACK: TicketHandler = 'hybrid';

/** Ayarın operatöre görünen açıklaması — sözlük ve Talepler ekranının yazdığı `description` aynı cümle. */
export const TICKET_DEFAULT_HANDLER_HELP =
  'Yeni talep açıldığında onu kim yürütsün: İnsan (operatör cevaplar), Hibrit (AI taslak yazar, operatör onaylar), AI (ajan onaysız cevaplar). Açık taleplerin modu değişmez — her talepte anahtar ayrıca çevrilebilir.';

/** Ayar satırındaki ham değeri moda çevirir; tanınmayan değer o ayarın fabrika değerine düşer. */
export function resolveDefaultHandler(raw: unknown, fallback: TicketHandler): TicketHandler {
  const parsed = TicketHandlerEnum.safeParse(raw);
  return parsed.success ? parsed.data : fallback;
}
