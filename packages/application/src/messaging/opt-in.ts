import { ConversationService } from '@lezzet/database';
import type { SupabaseClient } from '@supabase/supabase-js';
import { updateCustomerPreferences } from '../customer/preferences';

/**
 * **SOHBETTE VERİLEN TİCARİ MESAJ İZNİ** (15.12 · DOMAIN §11) — operatör karar vermez, müşterinin
 * dediğini yazar.
 *
 * ── İKİ YERE BİRDEN YAZILIR VE İKİSİ AYRI SORUYU CEVAPLAR ───────────────────
 * `conversation.opt_in` BU SOHBETİN izni; `user_profiles.marketing_consent` MÜŞTERİNİN izni. Biri
 * ötekinin yerine geçmez: kimliksiz bir sohbette müşteri kaydı yoktur ama izin yine de
 * kaydedilmeli (kimlik sonra bağlanınca kaybolmasın), kimlikli müşterinin izni ise kanal boyunca
 * taşınır ve kampanya gönderiminin dayanağıdır.
 *
 * ── MÜŞTERİ KAYDINA YALNIZ WhatsApp YAZILIR ─────────────────────────────────
 * `marketing_consent` bugün yalnız `email` ve `whatsapp` anahtarlarını taşıyor (şemadan türer).
 * Messenger/Instagram izni Meta'nın kendi opt-in mekanizmasıyla gelecek; olmayan bir kanalı
 * kartın altına yazmak, dayanağı olmayan bir izin kaydı üretmekti — ve kampanya gönderimi bir gün
 * o kayda bakacak.
 *
 * ── NEDEN PAKETTE, ACTION'IN İÇİNDE DEĞİL (24.08) ───────────────────────────
 * Kural web action'ının gövdesinde yaşıyordu ve orada **sınanamıyordu**: action `requireAdmin`den
 * başlıyor, guard oturum istiyor, depoda ise taklit (mock) yok — testler gerçeğe vurur ya da
 * bağımlılığı enjekte eder. Kuralı buraya almak iki şeyi birden çözüyor: sınanabilir oluyor ve
 * mobil sosyal kutunun izin ucu açıldığı gün ikinci bir kopyası doğmuyor (`link.ts`in aynı
 * gerekçesi). Action'da kalan tek şey guard + zarf.
 */
export type ConversationOptInOutcome =
  | { status: 'recorded'; /** Müşteri kartına da yazıldı mı — çağıran ekranda bunu söyleyebilir. */ profileUpdated: boolean }
  | { status: 'refused'; reason: 'conversation_not_found' };

export async function recordConversationOptIn(
  db: SupabaseClient,
  input: { conversationId: string; granted: boolean },
): Promise<ConversationOptInOutcome> {
  const service = new ConversationService(db);
  const conversation = await service.getById(input.conversationId);
  if (!conversation) return { status: 'refused', reason: 'conversation_not_found' };

  // Sohbetin izni HER kanalda yazılır: izin bir kanıttır ve kanaldan bağımsız olarak sohbette
  // verilmiştir (`setOptIn` izni ve ANI birlikte yazar — GDPR'da tarihsiz izin, izin değildir).
  await service.setOptIn(input.conversationId, input.granted);

  const kartaYazilir = conversation.source === 'whatsapp' && conversation.customerId !== null;
  if (kartaYazilir) {
    // `source` İZNİN NEREDEN geldiğidir ve operatöre ham hâliyle görünür ("… · whatsapp") —
    // hesap sayfasından verilen izinle sohbette verilen izin ayırt edilebilmeli.
    await updateCustomerPreferences(db, {
      profileId: conversation.customerId!,
      source: 'whatsapp',
      marketingConsent: { whatsapp: input.granted },
    });
  }

  return { status: 'recorded', profileUpdated: kartaYazilir };
}
