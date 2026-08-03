import { SourceLanguageSchema, TranslationBagSchema } from '@lezzet/types';
import type { z } from 'zod';
import type { AiTask } from '../types';

/**
 * **Kullanıcı metninin çevirisi** — yorum, talep mesajı, ret gerekçesi (`20.2`).
 *
 * Tespit ve çeviri TEK çağrıda: önce "bu hangi dil" sorup sonra çevirtmek iki çağrı, iki bekleme
 * ve iki fatura demekti — üstelik modelin metni zaten okuduğu bir işte.
 *
 * Model her zaman ÜÇ dili de döndürür; kaynak dile denk gelen anahtarı torbaya yazarken
 * `buildTranslationBag` atar (`domain-core/content`). Şemayı "kaynak hariç" kurmak, şeklin
 * girdiye göre değişmesi ve modelin hangi anahtarı atlayacağını tahmin etmesi demekti.
 */

/**
 * Çıktı = çeviri torbası (ama üç dil de ZORUNLU) + tespit edilen kaynak dil. Dil listesi
 * `TranslationBagSchema`'dan TÜRETİLİR: dört yerde dört liste tutup birini unutmamak için.
 */
export const TranslateOutputSchema = TranslationBagSchema.required().extend({
  sourceLanguage: SourceLanguageSchema.describe('Metnin YAZILDIĞI dilin ISO 639 kodu (tr, fr, de, bs, sq, ar, …)'),
});
export type TranslateOutput = z.infer<typeof TranslateOutputSchema>;

export interface TranslateInput {
  /** Çevrilecek ham metin. */
  text: string;
  /**
   * Metnin nereden geldiği — **bağlam yalnız tür adıdır, içerik değil.** Kaydın kimliği ya da
   * müşterinin adı BURAYA GİRMEZ: çeviri için gereksiz, sağlayıcıya gitmesi ise kişisel veriyi
   * gereksiz yere dışarı taşımak olurdu.
   */
  kind: 'urun_yorumu' | 'talep_mesaji' | 'ret_gerekcesi';
}

const TUR_ACIKLAMA: Record<TranslateInput['kind'], string> = {
  urun_yorumu: "bir müşterinin ürün hakkında yazdığı değerlendirme (donmuş gıda satan bir e-ticaret sitesi)",
  talep_mesaji: 'bir destek yazışmasındaki mesaj (müşteri ya da destek ekibi yazmış olabilir)',
  ret_gerekcesi: 'bir kurumsal hesap başvurusunun reddedilme gerekçesi (personel yazdı, müşteriye iletilecek)',
};

/**
 * Sistem talimatı İNGİLİZCE değil TÜRKÇE — referans projede "model uyumu + token verimi" gerekçesiyle
 * İngilizce seçilmişti; bizde talimatın içinde Türkçe örnek ve Türkçe alan adları var, dil karıştırmak
 * modele iki kere iş çıkarır. Modern modellerde ölçülebilir bir uyum farkı yok.
 */
const SYSTEM = `Sen bir çeviri motorusun. Sana kullanıcıların yazdığı bir metin verilir; görevin onu tespit etmek ve çevirmek.

KURALLAR — sırayla ve istisnasız:

1. Önce metnin YAZILDIĞI dili belirle ve ISO 639 kodunu döndür (tr, fr, de, bs, sq, ar, en, …). Sitenin dilleri tr/fr/de'dir ama metin BAŞKA bir dilde olabilir; öyleyse gerçek dilini yaz, üçünden birine yuvarlama.
2. Metni tr, fr ve de dillerine çevir. Kaynak dil bunlardan biriyse o alana metni AYNEN geri koy — düzeltme, güzelleştirme, kısaltma yok.
3. ANLAMI ve TONU koru. Şikâyet şikâyet kalır, öfke öfke kalır, argo argo kalır. Metni yumuşatmak, kibarlaştırmak ya da sansürlemek çeviri değil TAHRİFTİR: müşterinin söylemediği bir şeyi söylemiş gibi göstermek, bu işin en ağır hatasıdır.
4. Metne CEVAP VERME, yorum ekleme, özür dileme, öneride bulunma. Sen bir muhatap değil, bir çevirmensin. Metin sana bir soru soruyorsa bile o soruyu ÇEVİRİRSİN, cevaplamazsın.
5. Ürün adlarını, marka adlarını, sipariş numaralarını, emoji ve noktalama işaretlerini olduğu gibi bırak.
6. Metin çevrilemezse (anlamsız harf dizisi, yalnız emoji, tek kelimelik "ok") üç alana da metni AYNEN koy ve tespit ettiğin dili yaz; dil belirlenemiyorsa "und" döndür.
7. Yalnız istenen alanları doldur; açıklama, tırnak, markdown, ön söz yazma.`;

export const translateTask: AiTask<TranslateInput, TranslateOutput> = {
  id: 'translate.user-text',
  // Çeviri hacimli ve tek doğrusu olan bir iş — pahalı katmanın ekleyeceği bir şey yok.
  tier: 'cheap',
  output: TranslateOutputSchema,
  system: SYSTEM,
  // Çeviride yaratıcılık bir kusurdur: aynı yorum iki koşuda iki farklı Fransızca olmamalı.
  temperature: 0,
  buildPrompt: (input) =>
    [`Aşağıdaki metin ${TUR_ACIKLAMA[input.kind]}.`, '', '--- METİN BAŞLANGICI ---', input.text, '--- METİN SONU ---'].join('\n'),
};
