import type { SupabaseClient } from '@supabase/supabase-js';
import type { AiModel } from '@lezzet/ai';
import { TicketMessageService } from '@lezzet/database';
import { logger } from '@lezzet/observability';
import { translateUserText } from '../translate/user-text';

/*
  TALEP MESAJININ ÇEVİRİSİ — GÖNDERİM ANINDA (kullanıcı kararı 17.08).

  ── ÇÖZÜLEN ARIZA ───────────────────────────────────────────────────────────
  Operatör Türkçe yazıyordu, müşterinin dili Fransızcaydı: mesaj yazışmada önce TÜRKÇE beliriyor,
  müşteri ekrandan çıkıp girince Fransızcaya dönüyordu. Sebep bir hata değil, ZAMANLAMAYDI — çeviri
  yalnız kuyrukta koşuyor (`translate_user_text`, en fazla 20 satır/tur) ve okuma ondan önce
  yapılıyordu. Kullanıcı: *"biz bunun bu şekilde olmasını istemiyoruz."*

  ── NEDEN ZİLDEN ÖNCE ───────────────────────────────────────────────────────
  Karşı tarafın ekranını uyandıran şey zildir; zil çalmadan önce çeviri satıra yazılmışsa okuyan
  taraf mesajı İLK GÖRÜŞTE kendi dilinde görür. Sıra bu yüzden "yaz → çevir → haber ver"dir:
  zili öne almak, aynı kırpışmayı bir kez daha üretirdi.

  ── ÇEVİRİ DÜŞERSE MESAJ DÜŞMEZ ─────────────────────────────────────────────
  Bu kapı **fırlatmaz ve hiçbir şeyi geri almaz.** Kaydedilmiş bir cevabı, çevirisi yapılamadı diye
  reddetmek en kötü sonuçtur: operatör yazdığını göndermiş sanır, müşteri hiç görmez. Düşen turda
  satıra DAMGA DA ATILMAZ (`translatedAt` boş kalır) — böylece satır çeviri kuyruğunda durmaya devam
  eder ve arka plan işi telafi eder. Yani kötü hâlde davranış bugünküne geri döner, daha kötüsüne
  değil.
*/

/**
 * Az önce yazılmış bir talep mesajını **şimdi** çevirir.
 *
 * @returns `true` yalnız çeviri satıra yazıldıysa. `false` "olmadı" demektir ve çağıranın bir şey
 * yapmasını gerektirmez — satır kuyrukta kalır.
 */
export async function translateTicketMessageNow(
  db: SupabaseClient,
  message: { id: string; body: string },
  opts: { model?: AiModel } = {},
): Promise<boolean> {
  const text = message.body.trim();
  // Boş gövde uca zaten giremiyor; girseydi çevrilecek bir şey yok demektir.
  if (text.length === 0) return false;

  try {
    const res = await translateUserText(text, 'talep_mesaji', opts);
    if (!res.ok) {
      /* Uyarı, HATA değil: kuyruk telafi edeceği için sistemin sağlığı bozulmuş sayılmaz — ve
         `captureError`a gidemez, çünkü bu kapı üç ayrı süreçten çağrılıyor (web eylemi · mobil
         arka uç · cron) ve tek bir `source` etiketi hepsi için yanlış olurdu.
         Kimlik yazılır, İÇERİK yazılmaz (`CLAUDE §1`). */
      logger.warn(
        { context: 'application/ticket-translate', messageId: message.id, reason: res.reason },
        'talep mesajı gönderim anında çevrilemedi — kuyruğa bırakıldı',
      );
      return false;
    }

    await new TicketMessageService(db).update({
      id: message.id,
      language: res.data.language,
      translations: res.data.translations,
      translatedAt: new Date().toISOString(),
    });
    return true;
  } catch (err) {
    // Yazım da düşebilir (ağ, kısıt). Aynı gerekçe: mesajın kendisi kaydedilmiş durumda.
    logger.warn(
      { context: 'application/ticket-translate', messageId: message.id, err: (err as Error).message },
      'talep mesajının çevirisi yazılamadı — kuyruğa bırakıldı',
    );
    return false;
  }
}
