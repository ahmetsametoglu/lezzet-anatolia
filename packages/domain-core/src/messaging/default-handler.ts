import { TicketHandlerEnum, type TicketHandler } from '@lezzet/types';

/**
 * **Yeni sohbetin VARSAYILAN yürütücüsü** (15.30 · kullanıcı kararı 07.09) — anahtar, fabrika
 * değeri ve çözücü tek yerde.
 *
 * ── NEDEN BİR AYAR ──────────────────────────────────────────────────────────
 * Sohbetin modu (`conversation.handled_by`) tabloda `human` varsayılanıyla doğuyordu: her yeni
 * müşteri operatörün elini bekliyordu, ajan ancak operatör anahtarı çevirince konuşuyordu.
 * Kullanıcı kararı: *"varsayılan olarak AI modunda açılsın; ayarlardan seçilebilsin; sosyal
 * mesajlar sayfasından da değiştirilebilsin."* Karar bir İŞLETME TERCİHİDİR (bugün AI, yarın
 * hibrit olabilir) — koda gömülmez, `settings`te durur ve iki yüzey (Ayarlar · Sosyal Mesajlar)
 * aynı satırı okur/yazar.
 *
 * ── YALNIZ YENİ SOHBET ──────────────────────────────────────────────────────
 * Açık bir sohbetin modu bu ayarla DEĞİŞMEZ: `open_conversation` değeri yalnız satır doğarken
 * yazar, çakışmada dokunmaz. Operatörün "Devral"ı ya da hibrite çevirdiği sohbet, ayar sonradan
 * oynasa da yerinde kalır — tersi, bir operatör kararını genel bir ayarla sessizce ezmek olurdu.
 *
 * ── ÇÖZÜCÜ SAF ──────────────────────────────────────────────────────────────
 * Ayar tablosu `jsonb` tutar; satır bozuk ya da eski bir değer taşıyorsa (`"robot"`) sohbet modsuz
 * doğamaz. Tanınmayan değer fabrika değerine düşer — ve bu SESSİZ bir düşüş değil, çağıranın
 * loglayabileceği bir karardır (`resolveDefaultHandler` saf, DB'siz, testli).
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
