import { LocalizedTextDraftSchema } from '@lezzet/types';
import type { z } from 'zod';
import type { AiTask } from '../types';

/**
 * **Katalog metninin öteki dilleri** (05.8 · 09.4) — operatör bir dilde yazar, model ötekileri
 * ÖNERİR. Kabul etmek operatörün elindedir; bu görev hiçbir şeyi kaydetmez.
 *
 * `translateTask` ile karıştırılmamalı ve ayrı olmaları bilinçli — iki farklı iş:
 *
 * | | `translate.user-text` | buradaki |
 * |---|---|---|
 * | Metnin sahibi | müşteri/personel, kendi cümlesi | markanın kendisi |
 * | Sonuç | orijinalin YANINA yazılır | forma ÖNERİ olarak düşer |
 * | Ton | olduğu gibi korunur | pazarlama dili, satır uzunluğu gözetilir |
 * | Kaydeden | çeviri işi (otomatik) | operatör (elle) |
 *
 * Tek görevde birleştirmek, "müşterinin öfkeli cümlesini yumuşatma" kuralıyla "ürün adını satılır
 * yaz" kuralını aynı prompt'a koymak olurdu; ikisi birbirini bozar.
 */

/** Çıktı = `LocalizedText` taslağı. Şema TEK kaynaktan gelir; ayrı bir dil listesi tutulmuyor. */
export const SuggestLocalizedOutputSchema = LocalizedTextDraftSchema;
export type SuggestLocalizedOutput = z.infer<typeof SuggestLocalizedOutputSchema>;

export interface SuggestLocalizedInput {
  /** Operatörün yazdığı metin. */
  text: string;
  /** Yazıldığı dil — burada BİLİNİR (form hangi sekmede yazıldığını söyler), tespite gerek yok. */
  sourceLanguage: 'tr' | 'fr' | 'de';
  /**
   * Alanın ne olduğu — ton ve uzunluk buradan çıkar. Ürün ADI ile SAKLAMA TALİMATI aynı ölçüde
   * çevrilmez: biri iki kelimelik bir vitrin metni, öteki bir kullanım yönergesidir.
   */
  field: 'ad' | 'aciklama' | 'gorsel_alt' | 'icindekiler' | 'saklama';
}

const ALAN_ACIKLAMA: Record<SuggestLocalizedInput['field'], string> = {
  ad: 'bir ÜRÜN/KATEGORİ ADI — kısa, vitrinde okunur, cümle değil',
  aciklama: 'bir ÜRÜN AÇIKLAMASI — iştah açan ama abartısız, 1-3 cümle',
  gorsel_alt: 'bir GÖRSEL ALT METNİ — görme engelli okuyucu ve arama motoru için, görüntüyü tarif eder',
  icindekiler: 'bir İÇİNDEKİLER listesi — gıda mevzuatı metni, sıra ve terimler korunur',
  saklama: 'bir SAKLAMA/HAZIRLAMA talimatı — yönerge dili, sıcaklık ve süreler aynen kalır',
};

const DIL_ADI: Record<string, string> = { tr: 'Türkçe', fr: 'Fransızca', de: 'Almanca' };

const SYSTEM = `Sen Fransa'da (Strazburg) faaliyet gösteren, Türk mutfağından donmuş gıda satan bir e-ticaret markasının katalog metinlerini çeviriyorsun.

KURALLAR:

1. Verilen metni istenen dillere çevir. Kaynak dilin alanını da AYNEN doldur (metni değiştirme).
2. Bu bir katalog metnidir, edebi bir metin değil: kısa olan kısa kalır. Ürün adını cümleye çevirme, açıklamayı uzatma.
3. **Yemek adları çevrilmez, aktarılır:** "baklava", "künefe", "lahmacun", "börek" gibi adlar hedef dilde de aynı kalır — gerekirse yanına kısa bir tanım eklenir ("börek (feuilleté salé)"), ama ad Fransızcalaştırılmaz.
4. **Alerjen ve mevzuat terimleri birebir:** "buğday unu" → "farine de blé" / "Weizenmehl". Bu kelimelerde yaratıcılık bir yasal risktir.
5. Vurgu işaretlerini (**şöyle**) olduğu gibi taşı — kaç tane varsa o kadar, aynı kelimenin üzerinde.
6. Sayı, birim, sıcaklık ve süreleri DEĞİŞTİRME (200 g, -18 °C, 20 dk). Yalnız yerel yazım kuralına uydur.
7. Gerçek aksanlı harfleri kullan (é, è, à, ç, ö, ü, ß) — HTML kaçışı ya da ASCII karşılığı YAZMA.
8. Fiyat, teslimat süresi, indirim gibi metinde OLMAYAN bir vaat ekleme.`;

export const suggestLocalizedTask: AiTask<SuggestLocalizedInput, SuggestLocalizedOutput> = {
  id: 'suggest.localized-text',
  // Marka sesi ve mevzuat terimleri söz konusu; ucuz katmanın hatası burada rafa çıkar.
  tier: 'standard',
  output: SuggestLocalizedOutputSchema,
  system: SYSTEM,
  // Sıfır değil: katalog metninde birebir çeviri kulağı tırmalar, biraz esneklik gerekiyor.
  // Yüksek de değil: aynı ürünü iki kez çevirtip iki farklı ad almak operatörü şaşırtır.
  temperature: 0.3,
  buildPrompt: (input) =>
    [
      `Aşağıdaki metin ${ALAN_ACIKLAMA[input.field]} ve ${DIL_ADI[input.sourceLanguage]} yazılmış.`,
      'Üç dilin (tr, fr, de) hepsini doldur.',
      '',
      '--- METİN BAŞLANGICI ---',
      input.text,
      '--- METİN SONU ---',
    ].join('\n'),
};
