import { AnalyticsInsightSchema } from '@lezzet/types';
import type { z } from 'zod';
import type { AiTask } from '../types';

/**
 * **HAFTALIK ANALİTİK ANLATISI** (13.7) — toplu veriden okunabilir bir özet ve anormallik listesi.
 *
 * ── SÖZLEŞME MADDESİ: MODELE HAM SATIR GİTMEZ (`ANALYTICS §5`) ───────────────
 * Girdi tipi bunu **yapısal olarak** zorluyor: `AnalyticsInsightInput` yalnız toplanmış sayılar
 * taşıyor — olay satırı, oturum anahtarı, yol, müşteri kimliği geçemez. Serbest bir "veri" alanı
 * bıraksaydık kural bir cümle olurdu; şimdi derleme hatası.
 *
 * Bedeli de görünür olsun: haftada bir kez, birkaç yüz tokenlık bir çağrı. Ham defteri modele
 * vermek hem faturayı satır sayısıyla çarpardı hem anonimliği modelin bağlamına taşırdı.
 *
 * ── NEDEN "ANLATI + BULGULAR", TEK PARAGRAF DEĞİL ───────────────────────────
 * Tek paragraf ekranda güzel durur ama üzerine aksiyon kurulamaz. Bulgular ayrık ve **ağırlıklı**
 * geliyor (`good | watch | bad`) ki ekran onları sıralayabilsin ve yönetici "hangisine bugün
 * bakayım" diye sorabilsin.
 */

/**
 * Çıktı sözleşmesi `packages/types`'tan gelir — çünkü İKİ tarafı var: bu görev üretir, ekran
 * saklanmış hâlini okur. Burada ikinci bir tanım yazsaydık ikisi bir gün ayrışırdı ve ayrıştığında
 * hata vermezdi: model yeni alanı doldurur, ekran eski alanı okurdu. Emsal:
 * `SuggestLocalizedOutputSchema = LocalizedTextDraftSchema`.
 */
export const AnalyticsInsightOutputSchema = AnalyticsInsightSchema;
export type AnalyticsInsightOutput = z.infer<typeof AnalyticsInsightOutputSchema>;

/**
 * Modele giden ÖZET. Her alan `null` olabilir ve `null` "ölçülmedi" demektir — sıfır değil
 * (`CLAUDE §1`). Ayrım prompt'ta da yazılı: model ölçülmemiş bir şeyi "düştü" diye yorumlamamalı.
 */
export interface AnalyticsInsightInput {
  period: { from: string; to: string; days: number };
  /** Huni adımları, sırasıyla. Adım sayısı ölçülmüyorsa `count: null`. */
  funnel: Array<{ step: string; count: number | null }>;
  /** Terk sebepleri — huninin en değerli kırılımı. */
  blockedReasons: Array<{ reason: string; count: number }>;
  /** Trafik kaynakları; `source: null` doğrudan trafiktir. */
  sources: Array<{ source: string | null; sessions: number; conversion: number | null }>;
  /** Aranıp bulunamayanlar — çeşit sinyali. */
  zeroSearches: Array<{ query: string; kind: string | null; count: number }>;
  /** Çok bakılıp az alınanlar. `cartRate: null` = hiç satılabilir hâlde görünmedi. */
  products: Array<{ name: string; views: number; cartRate: number | null }>;
  segments: Array<{ segment: string; customers: number }>;
  /** Önceki dönemin aynı uzunluktaki karşılığı — kıyas cümleleri buradan çıkar. */
  previous?: { sessions: number | null; orders: number | null };
}

const SYSTEM = `Sen Strazburg'da faaliyet gösteren, Türk mutfağından donmuş gıda satan bir e-ticaret işletmesinin analitik verisini yöneticiye anlatıyorsun.

KURALLAR:

1. **Sana verilen sayıların DIŞINA çıkma.** Veride olmayan bir oran, tutar ya da kıyas uydurma. Emin olmadığın bir şeyi söyleme.
2. **\`null\` "sıfır" DEĞİL, "ölçülmedi" demektir.** Ölçülmemiş bir adım için "düştü", "kimse yapmadı" gibi cümleler kurma; gerekirse "bu adım henüz ölçülmüyor" de.
3. **Az veri varsa az konuş.** Bir haftada birkaç oturum varsa "trend" yoktur; öyle bir hafta için tek bir bulgu ya da hiç bulgu yeterlidir. Boş bir haftayı dolu göstermek en zararlı çıktıdır.
4. Sayıyı tekrar etmek yetmez, **ne anlama geldiğini** söyle: "sepette %40 düşüş" değil, "sepette düşenlerin çoğu asgari sepet tutarına takılıyor".
5. Ton: sade, kısa, Türkçe. Pazarlama dili yok, teknik jargon yok. Yöneticinin okuyup karar verebileceği cümleler.
6. \`tone\` alanı: \`good\` iyiye giden, \`watch\` izlenmesi gereken, \`bad\` bugün zarar eden bir şey.
7. \`nextStep\` yalnız veriden AÇIKÇA çıkan bir adım varsa dolsun; yoksa \`null\` bırak. Her hafta öneri üretme zorunluluğun yok.
8. Aranıp bulunamayan terimler bir TALEP sinyalidir: "şu ürün soruluyor, bizde yok" cümlesi bu listeden kurulur. Ama tek bir arama bir talep değildir.`;

export const analyticsInsightTask: AiTask<AnalyticsInsightInput, AnalyticsInsightOutput> = {
  id: 'analytics.weekly-insight',
  // Ucuz katman burada sayıları karıştırıyor: yorum işi, çeviri değil.
  tier: 'standard',
  output: AnalyticsInsightOutputSchema,
  system: SYSTEM,
  // Düşük: aynı veriden her hafta farklı bir hikâye çıkması güveni bitirir.
  temperature: 0.2,
  buildPrompt: (input) =>
    [
      `Dönem: ${input.period.from} → ${input.period.to} (${input.period.days} gün).`,
      '',
      'Verinin tamamı aşağıdadır. Başka veri yok; eksik olan ölçülmüyor demektir.',
      '',
      JSON.stringify(input, null, 2),
    ].join('\n'),
};
