import { runTask, voiceTranscriptTask } from '@lezzet/ai';
import { captureError, logger, SOURCES } from '@lezzet/observability';
import { getR2Private } from '@lezzet/storage';

/**
 * Sesli mesajı metne çevirir (15.26) — kovadaki dosyadan, Gemini ile.
 *
 * ── AYRI SAĞLAYICI YOK ──────────────────────────────────────────────────────
 * Gemini sesi doğrudan işliyor (`gemini-2.5-flash-lite`, ucuz katman): ikinci bir anahtar, ikinci
 * bir sözleşme, ikinci bir veri işleyen gerekmedi. Veri koruma açısından da yeni bir sınır
 * aşılmıyor — model müşterinin yazışmasının tamamını zaten okuyor.
 *
 * ── SES DEĞİL, KOVADAKİ DOSYA OKUNUYOR ──────────────────────────────────────
 * Sağlayıcının indirme adresi dakikalar içinde ölüyor; çözüm gecikirse (kuyruk, tekrar deneme) o
 * adres çoktan geçersiz olurdu. Kaynak bu yüzden bizim kovamız: dosya orada duruyor ve yarın da
 * duracak.
 *
 * ── DÜŞERSE MESAJ YİNE YAZILIR ──────────────────────────────────────────────
 * Her hata yolu `null` döner, hiçbiri fırlatmaz — medya indirmesiyle aynı kural. Çözülemeyen ses,
 * çözülmemiş hâliyle deftere düşer ve ajan onu "duyamadım" diye karşılar (`mediaPlaceholder`).
 * Sessiz de düşmez: beklenmedik hata `captureError`la iz bırakır.
 *
 * ── "ANLAMADIM" BİR CEVAPTIR, BOŞLUK DEĞİL ──────────────────────────────────
 * Model güvenmiyorsa (`confident: false`) ya da metin boşsa transkript YAZILMAZ. Yarım anlaşılmış
 * bir kaydı yazıya geçirmek, ajanın önüne güvenilecek bir cümle koymak olurdu — oysa o cümlenin
 * yanlış olduğunu kimse bilemezdi. Yokluk burada dürüst olan hâl.
 */

/**
 * Çözüm denenecek en büyük ses — **müşteriyi denetlemek için DEĞİL**, bozuk/devasa dosya bizi
 * düşürmesin diye (07.09, kullanıcı itirazıyla düzeltildi).
 *
 * ── ÖNCEKİ TASARIM YANLIŞTI ─────────────────────────────────────────────────
 * Bir tur "2 dakikayı aşan kayıt çözülmez, insana gider" denmişti. Kullanıcı çürüttü: müşteri iki
 * dakika anlatıp talebi SONDA söylerse, o kayıt çözülmediği için operatör baştan sona DİNLEMEK
 * zorunda kalır. Yani sınır, transkripsiyonun en çok işe yaradığı durumu tam da kesiyordu — uzun
 * kayıt, insanın en pahalı olduğu yerdir ve metne çevrilmesi gereken asıl kayıttır.
 *
 * ── SINIRI BELİRLEYEN ŞEY MALİYET DEĞİL ─────────────────────────────────────
 * Ölçüldü 07.09: 42 saniyelik kayıt `gemini-3.5-flash-lite`ta 1.328 girdi + 186 çıktı jetonu ≈
 * $0,0009. Bir dakikalık sesli mesaj yaklaşık **0,1 sent**. Google'ın kendi tavanı istek başına
 * 9,5 saat; yani teknik sınır da uzakta.
 *
 * Kalan tek kısıt ajanın bağlam penceresiydi ve o, kaydı ÇÖZMEMEKLE değil ajana VERİLİŞİNİ
 * kırpmakla çözülüyor (`ai.ts`, `TRANSCRIPT_CONTEXT_LIMIT`).
 *
 * ── SAYIYI NEDEN BAYT CİNSİNDEN TUTUYORUZ ───────────────────────────────────
 * Süreyi ölçemiyoruz: Meta'nın gövdesinde kaydın uzunluğu YOK ve dosyayı çözmeden süre bilinmiyor.
 * Bayt bir VEKİLDİR. WhatsApp sesli notu opus ~16 kbps → 1 dakika ≈ 120 KB, yani 8 MB kabaca bir
 * SAATİN üstü. Başka bir kodekle (mp3 128 kbps) aynı bayt ~8 dakikaya denk gelir. Vekil olduğu için
 * cömert seçildi: amacı bir politika uygulamak değil, belleği ve tek bir çağrıyı korumak.
 */
const MAX_BYTES = 8 * 1024 * 1024;

export async function transcribeConversationAudio(
  mediaKey: string,
  mediaMime: string,
  ctx: { conversationId: string },
): Promise<string | null> {
  const r2 = getR2Private();
  // Yerelde R2'siz çalışmak mümkün olmalı: kova yoksa çözüm de yok, sohbet çalışmaya devam eder.
  if (!r2) return null;

  try {
    // Süreli okuma adresi kendi kovamızın imzası — sağlayıcının ölmüş adresi değil.
    const url = await r2.getSignedReadUrl(mediaKey, 300);
    const res = await fetch(url);
    if (!res.ok) {
      logger.info(
        { context: 'messaging/voice', conversationId: ctx.conversationId, status: res.status },
        'ses dosyası kovadan okunamadı — mesaj çözümsüz kalır',
      );
      return null;
    }

    const audio = new Uint8Array(await res.arrayBuffer());
    if (audio.byteLength === 0 || audio.byteLength > MAX_BYTES) {
      logger.warn(
        { context: 'messaging/voice', conversationId: ctx.conversationId, bytes: audio.byteLength },
        'ses dosyası boş ya da sınırı aştı — çözüm denenmedi',
      );
      return null;
    }

    const sonuc = await runTask(voiceTranscriptTask, { audio, mediaType: mediaMime }, { usageContext: { conversationId: ctx.conversationId } });
    if (!sonuc.ok) {
      // Yapılandırma eksikliği ile model arızası ayrı okunur; ikisinde de mesaj kaybolmaz.
      logger.warn(
        { context: 'messaging/voice', conversationId: ctx.conversationId, reason: sonuc.reason },
        'ses çözümü koşamadı — mesaj çözümsüz kalır',
      );
      return null;
    }

    const metin = sonuc.data.text.trim();
    // İÇERİK LOGLANMAZ, yalnız ölçü (`CLAUDE §1`): transkript müşterinin kendi cümlesidir.
    if (!sonuc.data.confident || !metin) {
      logger.info(
        { context: 'messaging/voice', conversationId: ctx.conversationId, confident: sonuc.data.confident, length: metin.length },
        'ses güvenle çözülemedi — transkript yazılmıyor',
      );
      return null;
    }

    logger.info(
      { context: 'messaging/voice', conversationId: ctx.conversationId, language: sonuc.data.language, length: metin.length },
      'sesli mesaj metne çevrildi',
    );
    return metin;
  } catch (err) {
    captureError(err, { source: SOURCES.webhook, context: { step: 'voice-transcript', conversationId: ctx.conversationId } });
    return null;
  }
}
