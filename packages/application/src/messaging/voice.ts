import { runTask, voiceTranscriptTask } from '@lezzet/ai';
import { captureError, logger, SOURCES } from '@lezzet/observability';
import { getR2Private } from '@lezzet/storage';

// Kaynak kendi kovamızdaki dosya: sağlayıcının adresi dakikalarda ölür ve gecikmeli çözümde geçersiz olurdu.

// Her hata yolu `null` döner ve ajan sesi "duyamadım" diye karşılar. Model güvenmiyorsa transkript yazılmaz: yarım anlaşılmış kayıt
// ajanın önüne yanlışlığı bilinmeyen bir cümle koyardı.

/**
 * Müşteriyi değil belleği korur: uzun kayıt transkripsiyonun en çok işe yaradığı yerdir, ajana verilişi ayrıca kırpılır
 * (`TRANSCRIPT_CONTEXT_LIMIT`). Bayt sürenin vekilidir (gövdede süre yok); opus sesli notta 8 MB bir saati aşar.
 */
const MAX_BYTES = 8 * 1024 * 1024;

export async function transcribeConversationAudio(
  mediaKey: string,
  mediaMime: string,
  ctx: { conversationId: string },
): Promise<string | null> {
  const r2 = getR2Private();
  // Yerelde R2'siz çalışmak mümkün olmalı: kova yoksa çözüm de yok, sohbet sürer.
  if (!r2) return null;

  try {
    // Süreli okuma adresi kendi kovamızın imzası.
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
    // İçerik loglanmaz, yalnız ölçü: transkript müşterinin kendi cümlesidir.
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
