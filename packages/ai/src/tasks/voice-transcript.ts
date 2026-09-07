import { z } from 'zod';
import type { AiPromptContent, AiTask } from '../types';

/**
 * **Sesli mesajı metne çevir** (15.26) — sohbetten gelen ses kaydının çözümü.
 *
 * ── AYRI BİR SERVİS YOK ─────────────────────────────────────────────────────
 * Gemini sesi doğrudan işliyor; ikinci bir sağlayıcı, ikinci anahtar ve ikinci veri işleme
 * sözleşmesi gerekmedi. Veri koruma açısından da yeni bir sınır aşılmıyor: model müşterinin
 * yazışmasının TAMAMINI zaten okuyor (ajanın bağlamı o), sesin aynı sağlayıcıya gitmesi yeni bir
 * alıcı eklemiyor.
 *
 * ── ÇEVİRİ DEĞİL, ÇÖZÜM ─────────────────────────────────────────────────────
 * Model duyduğunu OLDUĞU GİBİ yazar: dili değiştirmez, cümleyi düzeltmez, özetlemez. Ham metin
 * kanıttır ve aranabilir olan odur; "temizlenmiş" bir sürüm üretmek, uydurmanın kapısını açardı.
 * Bu yüzden `temperature: 0` — tek doğrusu olan bir iş.
 *
 * ── DUYULMAYAN ŞEY UYDURULMAZ ───────────────────────────────────────────────
 * Kaydın anlaşılmayan kısmı için model işaret bırakır ve `confident: false` der. Boş ya da
 * anlaşılmaz kayıtta metin BOŞ döner — çağıran o zaman transkripti hiç yazmaz ve mesaj sesli
 * hâliyle insana gider. Bir sesi "anlamış gibi" yazmak, bu görevin önlemek için yazıldığı arızanın
 * kendisi olurdu.
 *
 * ── AJAN BU METNE DOĞRUDAN GÜVENMEZ ─────────────────────────────────────────
 * Çıktı ajanın bağlamına girer ama müşterinin kesin sözü sayılmaz: ajanın kuralı (15.26) sesten
 * gelen isteği işlemeden önce TEYİT istemesi. Konuşma dili tutarsızdır ve tutarsızlığı bu görev
 * gidermez — yalnız görünür kılar.
 */

export const VoiceTranscriptOutputSchema = z.object({
  /** Duyulanın birebir metni. Anlaşılmadıysa BOŞ — uydurma yok. */
  text: z.string(),
  /** ISO 639-1 ('tr', 'fr', 'de'). Bilinmiyorsa boş; kayıt dili müşterinin tercihinden farklı olabilir. */
  language: z.string(),
  /**
   * Model kaydı güvenle çözebildi mi. `false` → çağıran metni KULLANMAZ, mesajı insana bırakır.
   * Ayrı bir alan, çünkü "kısa metin" ile "anlaşılmayan kayıt" aynı şey değil: "tamam" da kısadır.
   */
  confident: z.boolean(),
});
export type VoiceTranscriptOutput = z.infer<typeof VoiceTranscriptOutputSchema>;

export interface VoiceTranscriptInput {
  /** Ses dosyasının ham baytları (kovadan okunur — sağlayıcının süreli adresi değil). */
  audio: Uint8Array;
  /** `audio/ogg`, `audio/mpeg` … Modelin dosyayı nasıl okuyacağını uzantı değil bu söyler. */
  mediaType: string;
}

const SYSTEM = `Sen bir ses çözümleme aracısın. Bir gıda işletmesine WhatsApp'tan gelen müşteri sesli mesajlarını metne çevirirsin.

KURALLAR:
- Duyduğunu OLDUĞU GİBİ yaz. Çeviri yapma, dili değiştirme, cümleyi düzeltme, kısaltma, özetleme.
- SAF DOLDURMA SESLERİNİ ATLA: "eee", "ııı", "ee", "hmm", "euh", "äh" gibi anlamı olmayan sesler yazılmaz.
- Bunun DIŞINDA hiçbir şeyi temizleme. Yarım cümle, tekrar, devrik cümle, "şey", "yani", "işte" gibi GERÇEK kelimeler oldukları gibi kalır — konuşma dili tutarsızdır ve bu tutarsızlık müşterinin sözüdür.
- Cümleyi toparlama, kısaltma, sıraya koyma. Attığın tek şey ses, kelime değil.
- Müşteriler Türkçe, Fransızca ve Almanca konuşur; bir kayıtta diller karışabilir. Her kısmı KENDİ dilinde yaz.
- Anlamadığın kısım için [anlaşılmadı] yaz. TAHMİN ETME.
- Kayıt boşsa, yalnız gürültüyse ya da hiçbir yeri anlaşılmıyorsa: text boş, confident false.
- Çoğu anlaşılıyor ama bir yeri kaçıyorsa: metni yaz, confident true, kaçan yere [anlaşılmadı] koy.
- Kaydın içindekine CEVAP VERME, yorum yapma. Sen yalnız yazıya geçirirsin.

ALANLAR:
- language: iki harfli ISO 639-1 KODU yaz — "tr", "fr", "de". Dilin ADINI yazma ("Türkçe" DEĞİL).
  Birden çok dil geçiyorsa BASKIN olanın kodunu ver; hiçbiri anlaşılmıyorsa boş bırak.`;

export const voiceTranscriptTask: AiTask<VoiceTranscriptInput, VoiceTranscriptOutput> = {
  id: 'voice-transcript',
  /*
    UCUZ KATMAN BİR TASARRUF DEĞİL, DOĞRU SEÇİM. İş akıl yürütme değil çözümleme; pahalı model aynı
    sesi daha doğru duymuyor. Ölçüldü 07.09 (aynı 42 sn'lik kayıt, aynı istem):

      gemini-3.5-flash        girdi 1.328 · çıktı 799 · metin doğru, dil alanı "Türkçe" (kod değil)
      gemini-3.5-flash-lite   girdi 1.328 · çıktı 186 · metin doğru, dil alanı "tr"

    Fark çıktı tarafında ve sebebi düşünme: lite'ta kapalı. Fiyatla birlikte toplam ~10 kat
    ($0,0092 → $0,0009 · sesli mesaj başına). Lite'ın fiyat satırı ayrıca sesi AÇIKÇA kapsıyor;
    3.5 Flash'ta ses için ayrı tarife listelenmemiş, yani orada maliyet belirsiz kalıyordu.
  */
  tier: 'cheap',
  output: VoiceTranscriptOutputSchema,
  system: SYSTEM,
  buildPrompt: (input): AiPromptContent => [
    { type: 'text', text: 'Bu sesli mesajı metne çevir.' },
    { type: 'file', data: input.audio, mediaType: input.mediaType },
  ],
  // Tek doğrusu olan iş: aynı kayıt aynı metni versin.
  temperature: 0,
};
