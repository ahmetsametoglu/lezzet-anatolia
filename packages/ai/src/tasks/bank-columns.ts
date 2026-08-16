import { BankColumnSuggestionSchema, type BankColumnSuggestion } from '@lezzet/types';
import type { AiTask } from '../types';

/**
 * **BANKA EKSTRESİ SÜTUN TANIMA** (12.4 · sınıf 3) — "hangi sütun hangi alan?" sorusunun AI cevabı.
 *
 * `domain-core`daki `ColumnMapper` PORT'unun AI uygulamasının görev yarısı: girdi dosyanın küçük
 * bir örneği (başlıklar + ilk birkaç değer), çıktı eşleme önerisi. **Cevap her hâlükârda ONAYA
 * düşer** (port künyesi): yanlış eşlenen bir sütun — bakiyeyi tutar sanmak — bütün ekstreyi çöpe
 * çevirir; ne sezgisel kural ne model bunu tek başına üstlenir.
 *
 * Model başlıkları UYDURabilir — o yüzden fiziksel kapı görevde değil ÇAĞIRANDA: `analyzeFile`
 * dönen her başlığın örnekte gerçekten var olduğunu doğrular, uyduranı sezgisele düşürür.
 */

/** Modele giden örnek — kişisel veri taşıMAMALI diye kırpılmış: başlık + ilk birkaç değer. */
export interface BankColumnsInput {
  columns: Array<{ header: string; values: string[] }>;
}

const SYSTEM = `Bir banka ekstresi dosyasının sütunlarını tanıyorsun. Fransız bankaları öncelikli (FR); DE/EN/TR başlıklar da gelebilir.

KURALLAR:
1. **Yalnız verilen başlıkları kullan.** mapping alanlarına örnekteki başlıkların DIŞINDA bir dize yazma; emin olmadığın alanı null bırak ve güvenini düşük yaz.
2. İki kanıtı birleştir: başlığın ADI ve değerlerin BİÇİMİ. "Solde" başlıklı para sütunu TUTAR değil BAKİYEdir — bakiyeyi tutar sanmak en ağır hatadır; şüphede amount'u null bırak.
3. amountMode: tek işaretli tutar sütunu varsa "signed" (amount dolu, debit/credit null); ayrı borç/alacak sütunları varsa "debit_credit" (amount null).
4. decimalSeparator ve dateFormat'ı DEĞERLERDEN oku: "1 234,56" → ","; "12/03/2025" Fransız dosyada "dmy"dir, emin değilsen "dmy" (pazar Fransa).
5. confidence: alan başına 0–1. Kanıt tekse (yalnız başlık YA DA yalnız biçim) 0.5'i geçme. Eşlemediğin alanın güveni 0.
6. Cevabın yalnız şemaya uyan nesne — açıklama yazma.`;

export const bankColumnsTask: AiTask<BankColumnsInput, BankColumnSuggestion> = {
  id: 'bank.column-mapping',
  // Ucuz katman yeter: kapalı küçük bir sınıflandırma, metin üretimi değil.
  tier: 'cheap',
  output: BankColumnSuggestionSchema,
  system: SYSTEM,
  // 0: tek doğrusu olan bir iş — aynı dosya her seferinde aynı eşlemeyi vermeli.
  temperature: 0,
  buildPrompt: (input) =>
    [
      'Sütunlar (başlık + ilk değerler):',
      '',
      ...input.columns.map(
        (column) => `- "${column.header}": ${column.values.map((value) => JSON.stringify(value)).join(' · ') || '(boş)'}`,
      ),
    ].join('\n'),
};
