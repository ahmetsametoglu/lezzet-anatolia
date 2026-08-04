'use server';

import { runTask, suggestLocalizedTask, type SuggestLocalizedInput } from '@lezzet/ai';
import { LOCALIZED_TEXT_KEYS, type LocalizedText } from '@lezzet/types';
import { logger } from '@lezzet/observability';
import { requireStaff } from '@/lib/guard';

/**
 * AI çeviri önerisi — operatörün yazdığı dilden ötekileri ÖNERİR (05.8 · 09.4).
 *
 * **Yeri `lib/`, bir sayfa klasörü değil** (CLAUDE.md §2): ürün formu, katalog dialogu, paket
 * dialogu ve indirim dialogu — dördü de aynı öneriyi istiyor. Sayfa altında kalsaydı ikinci sayfa
 * ya import sınırını aşar ya kendi kopyasını yazardı.
 *
 * **Arka uç bağlandı** (`packages/ai`, 20.4) — `BEKLEYEN(09.4)` kapandı.
 *
 * **Hata hâlâ FIRLATIR ve bu bilinçli**: bu bir öneri akışıdır, mutasyon değil. Sessiz bir `{}`
 * dönseydi operatör düğmenin çalıştığını ama modelin cevap vermediğini sanırdı; şimdi çağıran
 * hatayı kendi yanında gösteriyor (`LocalizedTextField` amber not satırı).
 */
/**
 * Çevrilecek alanın TÜRÜ — ekran tarafının okuyacağı ad. Tip motorun kendi birliğinden TÜRER
 * (`packages/ai`), elle yeniden yazılmaz: yeni bir alan türü eklendiği gün ekran da derlemede görür.
 */
export type TranslateField = SuggestLocalizedInput['field'];

export async function suggestTranslationAction(
  text: LocalizedText,
  /**
   * Alanın türü — ton ve uzunluk buradan çıkar (ürün adı ile saklama talimatı aynı ölçüde
   * çevrilmez). Varsayılan `aciklama` KALIYOR ama artık bir "kimse geçmiyor" varsayılanı değil:
   * ürün/katalog/paket formları alanına göre geçiyor (04.08); varsayılan yalnız gerçekten
   * açıklama olan alanlar için.
   */
  field: TranslateField = 'aciklama',
): Promise<LocalizedText> {
  await requireStaff();

  // Kaynak dil: DOLU olan ilk dil (kanonik sıra TR → FR → DE, `resolveLocalizedText` ile aynı).
  // Formun hangi sekmede olduğunu sormuyoruz — boş bir sekmeden çeviri istemek anlamsız.
  const sourceLanguage = LOCALIZED_TEXT_KEYS.find((lang) => text[lang]?.trim());
  const kaynak = sourceLanguage ? text[sourceLanguage]?.trim() : undefined;
  if (!sourceLanguage || !kaynak) throw new Error('Çevrilecek metin yok — önce bir dilde yazın.');

  const res = await runTask(suggestLocalizedTask, { text: kaynak, sourceLanguage, field });
  if (!res.ok) {
    // Ölçüm ve sebep loga, METİN loga DEĞİL (`CLAUDE §1`).
    logger.warn({ task: 'suggest.localized-text', reason: res.reason, field }, 'AI çeviri önerisi alınamadı');
    throw new Error(
      res.reason === 'not_configured'
        ? 'AI çevirisi yapılandırılmamış — sağlayıcı anahtarı eksik.'
        : 'AI çevirisi şu an alınamadı, tekrar deneyin.',
    );
  }

  logger.info({ task: 'suggest.localized-text', field, model: res.modelId, tokens: res.usage.totalTokens }, 'AI çeviri önerisi');
  // **Operatörün yazdığı dil KORUNUR:** model o alanı da doldurur ama önerisi asıl metnin yerine
  // geçemez — yazanın cümlesini değiştirmek, istenmemiş bir düzeltmedir.
  return { ...res.data, [sourceLanguage]: kaynak };
}
