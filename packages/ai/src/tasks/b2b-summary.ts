import { B2bAiSummarySchema, type B2bAiSummary } from '@lezzet/types';
import type { AiTask } from '../types';

/**
 * **B2B BAŞVURU ÖZETİ** (09.11c · sınıf 3) — kontrol kartındaki tek cümlelik okuma yardımı.
 *
 * Sınıf 3'ün kırmızı çizgisi: ticari değeri UYDURMAZ, verilenden türetir. Girdi zaten motorun
 * ürettiği sinyallerdir (`b2bSignals` — aktiflik, VIES, rota uyumu, mükerrer); model onları tek
 * cümleye indirir ve KARAR VERMEZ — kartın kendi başlığı da bunu yazıyor ("okuma yardımı, karar
 * değil"). "Onaylayın/reddedin" diyen bir özet, operatörün kararını modele devretmek olurdu.
 */

export interface B2bSummaryInput {
  /** Resmî ad — kişisel değil ticari kimlik; başvurunun kendisi zaten operatör ekranında. */
  legalName: string | null;
  country: string;
  /** Motorun sinyal ızgarası olduğu gibi: etiket + değer + ton. Model bunun dışına çıkamaz. */
  signals: Array<{ label: string; value: string; tone: 'ok' | 'warn' | 'bad' }>;
  duplicateCount: number;
}

const SYSTEM = `Bir B2B (restoran/dükkân) başvurusunun kontrol sinyallerini yöneticiye TEK cümlede özetliyorsun.

KURALLAR:
1. Yalnız verilen sinyalleri kullan — sinyallerde olmayan hiçbir bilgi, oran ya da tahmin ekleme.
2. KARAR VERME: "onaylanabilir", "reddedin", "güvenilir" yazma. Senin işin sinyalleri okumak, tartmak değil.
3. YALNIZ dikkat isteyenleri (\`bad\` ve \`warn\`) adıyla söyle. Olumlu sinyalleri TEK TEK SAYMA — hepsini "diğerleri olumlu" gibi tek bir öbekte topla. Sıra: \`bad\` önce, sonra \`warn\`.
4. Her şey \`ok\` ise tek cümlede bunu söyle ("altı sinyalin hepsi olumlu" gibi); listeleme.
5. Türkçe, tek cümle, en fazla ~25 kelime. Teknik kod adı yazma ("VIES" yerine "AB vergi no doğrulaması" gibi sinyalin kendi etiketi neyse onu kullan).

ÖRNEK — sinyaller: Mükerrer=2 olası eşleşme[bad], KDV=Sorulmadı[warn], kalan dördü ok
İYİ  : "2 olası mükerrer kayıt var ve AB vergi no doğrulaması sorulmadı; diğer sinyaller olumlu."
KÖTÜ : "2 olası mükerrer var, KDV sorulmadı, resmî kayıt aktif, faaliyet uyumlu, kuruluş 2017, adres rota içi."`;

export const b2bSummaryTask: AiTask<B2bSummaryInput, B2bAiSummary> = {
  id: 'b2b.approval-summary',
  // Ucuz katman yeter: altı sinyali tek cümleye indirme, yorum derinliği istemiyor.
  tier: 'cheap',
  output: B2bAiSummarySchema,
  system: SYSTEM,
  // Düşük: aynı sinyaller her açılışta aynı cümleye inmeli — sayfayı yenileyince fikir değiştiren
  // bir özet güveni bitirir (haftalık içgörüyle aynı gerekçe).
  temperature: 0.1,
  buildPrompt: (input) =>
    [
      `Başvuru: ${input.legalName ?? 'resmî ad okunamadı'} (${input.country}).`,
      `Olası mükerrer kayıt sayısı: ${input.duplicateCount}.`,
      '',
      'Sinyaller:',
      ...input.signals.map((signal) => `- ${signal.label}: ${signal.value} [${signal.tone}]`),
    ].join('\n'),
};
