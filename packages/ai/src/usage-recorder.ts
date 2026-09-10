import type { AiFailureReason, AiUsage } from './types';

/**
 * **AI KULLANIM KANCASI** (15.27 · kullanıcı kararı 10.09: "tek kanca") — her koşunun ölçümü TEK
 * noktadan dışarı verilir; kaydı uygulama tutar.
 *
 * ── NEDEN KANCA, NEDEN ÇAĞIRANLAR DEĞİL ─────────────────────────────────────
 * `runTask`ı çağıran on yer var (ajan, taslak, çeviri, ses, banka, B2B özeti, analitik…). Kaydı her
 * çağırana yazdırmak on kopya demekti ve on birinci çağıran onu unuturdu — unutulan koşu bedava
 * görünürdü (`CLAUDE §1`: ölçülemeyen değer sıfır değildir). Koşucu tektir; kanca oraya takılır.
 *
 * ── PAKET YİNE LOGLAMAZ, DB BİLMEZ ───────────────────────────────────────────
 * `run.ts`in üçüncü değişmezi duruyor: paket ölçümü VERİR, yazmaz. Kaydedici süreç başında uygulamadan
 * takılır (web `instrumentation-node.ts`, backend `index.ts`); takılmamışsa (test, betik) hiçbir şey olmaz.
 *
 * ── `globalThis`, MODÜL DEĞİŞKENİ DEĞİL ─────────────────────────────────────
 * Next sunucu kodunu birden çok modül grafiğinde derliyor: `instrumentation`ın yüklediği paket örneği
 * ile bir server action'ın yüklediği örnek AYNI modül olmayabilir. Modül değişkenine takılan kaydedici
 * öteki grafikte boş görünür ve kayıt sessizce düşerdi. `Symbol.for` anahtarı süreç genelinde tektir.
 */

/** Koşunun iş bağlamı — kayıt satırında kolon olur; çağıran verir, paket bilmez. */
export interface AiUsageContext {
  conversationId?: string | null;
  ticketId?: string | null;
}

export interface AiUsageRecord {
  /** Görev adı (`AiTask.id`). */
  task: string;
  /** Çağrının GERÇEKTEN gittiği model — maliyet bununla eşleşir. */
  modelId: string;
  ok: boolean;
  /** Başarısızlıkta sebep, başarıda `null`. `not_configured` kayda GİRMEZ — modele hiç gidilmedi. */
  failureReason: Exclude<AiFailureReason, 'not_configured'> | null;
  usage: AiUsage;
  context: AiUsageContext;
}

export type AiUsageRecorder = (record: AiUsageRecord) => Promise<void>;

const SLOT = Symbol.for('lezzet.ai.usage-recorder');
type Slot = { [SLOT]?: AiUsageRecorder };

/** Süreç başında BİR KEZ takılır; `null` söker (testte önceki hâli geri koymak için). */
export function setAiUsageRecorder(recorder: AiUsageRecorder | null): void {
  (globalThis as Slot)[SLOT] = recorder ?? undefined;
}

/**
 * Ölçümü kaydediciye verir — **beklemez ve koşuyu düşürmez.** Kayıt bir yan iştir: kaydedicinin hatası
 * (DB kesintisi) müşterinin cevabını geciktirmemeli ya da düşürmemeli. Kaydedici kendi hatasını kendisi
 * izler (`captureError`); aşağıdaki iki `catch` onun da düştüğü hâl içindir ve bilerek sessiz — paketin
 * logger'ı yok (`run.ts` 3. değişmez), izi kaydedici bırakır.
 */
export function reportAiUsage(record: AiUsageRecord): void {
  const recorder = (globalThis as Slot)[SLOT];
  if (!recorder) return;
  try {
    void recorder(record).catch(() => {
      // Reddeden kaydedici: izini kendisi bıraktı (künye); koşu etkilenmez.
    });
  } catch {
    // Senkron fırlatan kaydedici — aynı gerekçe: koşu düşmez, iz kaydedicinin işi.
  }
}
