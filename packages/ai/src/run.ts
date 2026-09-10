import {
  NoObjectGeneratedError,
  TypeValidationError,
  generateObject,
  generateText,
  stepCountIs,
  type LanguageModel,
  type ToolSet,
} from 'ai';
import { resolveModel } from './provider';
import { EMPTY_USAGE, addUsage, toAiUsage } from './usage';
import { reportAiUsage, type AiUsageContext, type AiUsageRecord } from './usage-recorder';
import type { AiResult, AiTask, AiUsage } from './types';

/**
 * Bir görevi koşturur — paketin TEK giriş kapısı.
 *
 * **Üç değişmez:**
 *
 * 1. **Fırlatmaz.** AI daima isteğe bağlıdır: yapılandırılmamışsa, sağlayıcı düşmüşse ya da model
 *    saçmalamışsa özellik AI'sız çalışmaya devam etmeli. Hata bir DEĞER olarak döner ki çağıran
 *    onu görmezden gelmek zorunda kalmasın (`CLAUDE §1` "sessiz catch yok").
 * 2. **Çıktı yapısaldır.** `generateObject` şemayı modele dayatır ve doğrular; serbest metin
 *    ayrıştırmak (referans projedeki `parseJsonLoose`) tahmindir, tahmin de bir gün yanılır.
 * 3. **Loglamaz.** Ölçümü döndürür ve kullanım kancasına verir (`usage-recorder.ts`, 15.27); kaydı
 *    uygulama tutar. Paketin logger'ı olsaydı ölçümün hangi işe ait olduğunu paket bilmek zorunda kalırdı.
 *
 * ── ARAÇLI KOŞU (16.9) ──────────────────────────────────────────────────────
 * `opts.tools` verilirse model **veriye kendisi bakabilir**: `generateObject` araç kabul etmediği
 * için `generateText` + `Output.object` yoluna geçilir — çıktı sözleşmesi aynen dayatılmaya devam
 * eder, değişen yalnız modelin arada araç çağırabilmesidir.
 *
 * **Araçları BU PAKET TANIMLAMAZ ve tanımlamamalı** (`ai-scope`): aracın gövdesi veritabanına
 * bakar, bu paket ise yalnız `@lezzet/types` bilir. Araç, kimliği ÇAĞIRAN tarafından kapatılmış
 * (closure) hâlde gelir — modelin "kimin verisi" diye bir argümanı olmaz. Bu, uydurma bir kimlikle
 * başkasının verisinin okunmasını olanaksız kılar; kural veride değil İMZADA durur.
 *
 * **Adım tavanı zorunlu:** araç çağıran model kendi kendine döngüye girebilir. `maxSteps` (görevin
 * kendi sözleşmesi) aşılınca koşu biter — tavana çarpan koşu cevapsız döner, uydurma cevapla değil.
 */
/**
 * Araç sonuçlarını ikinci faza taşınacak METNE çevirir.
 *
 * **Sonuç olduğu gibi (JSON) yazılıyor, özetlenmiyor:** özetleyen bir ara katman, aracın söylediği
 * ile modelin okuduğu arasında ikinci bir yorum yeri açardı — ve uydurma tam oradan girer.
 */
function toolFacts(steps: ReadonlyArray<{ content: ReadonlyArray<{ type: string }> }>): { text: string; names: string[] } {
  const names: string[] = [];
  const lines: string[] = [];
  for (const step of steps) {
    for (const part of step.content) {
      if (part.type !== 'tool-result') continue;
      const { toolName, output } = part as unknown as { toolName: string; output: unknown };
      names.push(toolName);
      lines.push(`- ${toolName}: ${JSON.stringify(output)}`);
    }
  }
  return { text: lines.join('\n'), names };
}

export async function runTask<TInput, TOutput>(
  task: AiTask<TInput, TOutput>,
  input: TInput,
  opts: {
    /** Modeli doğrudan verir — env'i atlar. Test için (`ai/test` sahte modeli) ve devir için. */
    model?: LanguageModel;
    modelId?: string;
    signal?: AbortSignal;
    /**
     * Modelin bakabileceği araçlar — kimliği ÇAĞIRAN kapatır (yukarıdaki künye). Verilmezse görev
     * bugünkü gibi kapalı girdiyle koşar: aracın olmadığı yerde modelin arayacağı bir şey de yoktur.
     */
    tools?: ToolSet;
    /**
     * Koşunun iş bağlamı (15.27) — kullanım kaydında hangi sohbete/talebe ait olduğu. Verilmezse kayıt
     * yine düşer, bağlamsız: maliyet görevden okunur.
     */
    usageContext?: AiUsageContext;
  } = {},
): Promise<AiResult<TOutput>> {
  let model: LanguageModel;
  let modelId: string;
  if (opts.model) {
    model = opts.model;
    modelId = opts.modelId ?? 'injected';
  } else {
    const resolved = resolveModel(task.tier);
    if (!resolved.ok) return resolved;
    model = resolved.model;
    modelId = resolved.modelId;
  }

  /*
    İSTEM İKİ BİÇİMDE GELEBİLİR (15.26). Dize dönen görevler `prompt` alanına düşüyor — bugüne
    kadarki davranış aynen. Parça dizisi dönen görev (sesli mesaj çözümü) tek kullanıcı mesajına
    çevriliyor: SDK dosyayı `messages` içinde taşıyor, `prompt` alanı dosya kabul etmiyor.

    İki alan aynı anda VERİLMEZ — SDK ikisini birden gördüğünde hangisini kullanacağı belirsizdir
    ve sessizce biri yok sayılırdı.
  */
  const istem = task.buildPrompt(input);
  // `prompt: undefined` / `messages: undefined` AÇIKÇA yazılıyor: SDK'nın tipi ikisinden yalnız
  // birinin var olmasını şart koşuyor ve alanı hiç yazmamak, yayılan (spread) nesnede belirsizlik
  // bırakıyor.
  const govde = Array.isArray(istem)
    ? { messages: [{ role: 'user' as const, content: istem }], prompt: undefined }
    : { prompt: istem, messages: undefined };

  const ortak = {
    model,
    system: task.system,
    ...govde,
    temperature: task.temperature,
    ...(opts.signal ? { abortSignal: opts.signal } : {}),
  };

  /* KULLANIM KAYDI (15.27) — başarılı ya da değil, modele giden HER koşu. Yapılandırma yoksa (yukarıda
     `not_configured`) modele hiç gidilmedi, kayıt da yok. Kanca takılı değilse hiçbir şey olmaz. */
  const kaydet = (usage: AiUsage, failureReason: AiUsageRecord['failureReason']) =>
    reportAiUsage({ task: task.id, modelId, ok: failureReason === null, failureReason, usage, context: opts.usageContext ?? {} });
  // Araçlı koşuda birinci fazın harcaması ikinci faz düşse de YAPILDI — hata dalında kaybolmasın.
  let ilkFaz: AiUsage | null = null;

  try {
    if (opts.tools) {
      // FAZ 1 — GERÇEKLERİ TOPLA. Şema DAYATILMAZ ve dayatılamaz: Google "araç çağrısı + JSON çıktı
      // kipi" bileşimini reddediyor (ölçüldü 16.08: "Function calling with a response mime type:
      // 'application/json' is unsupported"). Bu fazın metni ZATEN kullanılmıyor; işi araçları
      // çağırtmak ve dönen gerçekleri toplamak.
      const gather = await generateText({
        ...ortak,
        tools: opts.tools,
        // Tavan görevin sözleşmesinden; yoksa 4 — bir arama, bir doğrulama, bir cevap için yeter.
        stopWhen: stepCountIs(task.maxSteps ?? 4),
      });
      ilkFaz = toAiUsage(gather.usage);
      const facts = toolFacts(gather.steps);

      // FAZ 2 — ŞEMAYA BAĞLA. Araç sonuçları prompt'a EK olarak giriyor, yani ikinci çağrı
      // gerçekleri "hatırlamak" zorunda değil; önünde yazılı. Sözleşme yine `generateObject`
      // tarafından dayatılıyor — serbest metin ayrıştırmıyoruz (bu dosyanın 2. değişmezi).
      /*
        Gerçekler istemin SONUNA ekleniyor. Dize hâlinde düz birleştirme; parça dizisinde yeni bir
        metin parçası olarak — base64 bir dosyanın peşine metin yapıştırmak parçayı bozardı.
      */
      const gercekli = !facts.text
        ? govde
        : Array.isArray(istem)
          ? {
              messages: [
                {
                  role: 'user' as const,
                  content: [...istem, { type: 'text' as const, text: `\n\nARAÇLARDAN GELEN DOĞRULANMIŞ GERÇEKLER:\n${facts.text}` }],
                },
              ],
              prompt: undefined,
            }
          : { prompt: `${istem}\n\nARAÇLARDAN GELEN DOĞRULANMIŞ GERÇEKLER:\n${facts.text}`, messages: undefined };

      const res = await generateObject({
        ...ortak,
        ...gercekli,
        schema: task.output,
      });
      // İki fazın ölçümü TEK satırda toplanır — maliyet çağrı başına değil, GÖREV başına okunur.
      const usage = addUsage(ilkFaz, toAiUsage(res.usage));
      kaydet(usage, null);
      return {
        ok: true,
        data: res.object as TOutput,
        usage,
        modelId,
        toolCalls: facts.names,
      };
    }

    const res = await generateObject({ ...ortak, schema: task.output });
    const usage = toAiUsage(res.usage);
    kaydet(usage, null);
    return { ok: true, data: res.object as TOutput, usage, modelId, toolCalls: [] };
  } catch (err) {
    // Şema ihlali ile ağ/kota hatasını ayırmak çağıranın DAVRANIŞINI değiştirir: birinde prompt
    // sorgulanır, ötekinde tekrar denenir. Tek 'hata' demek ikisini de teşhissiz bırakırdı.
    const sematik = NoObjectGeneratedError.isInstance(err) || TypeValidationError.isInstance(err);
    const reason = sematik ? 'invalid_output' : 'provider_error';
    /* Şema ihlalinde model ÇALIŞTI ve jeton yaktı — hata ölçümü taşıyor (`NoObjectGeneratedError.usage`).
       Sağlayıcı hatasında ölçüm yok: alanlar `null` kalır, sıfır yazılmaz (`AiUsage` künyesi). */
    const hataOlcumu = NoObjectGeneratedError.isInstance(err) ? toAiUsage(err.usage) : EMPTY_USAGE;
    kaydet(ilkFaz ? addUsage(ilkFaz, hataOlcumu) : hataOlcumu, reason);
    return {
      ok: false,
      reason,
      // **Mesaj yalnız hatanın kendisidir** — girdi metni asla eklenmez: kullanıcı yorumu/talep
      // gövdesi log'a düşerdi (`CLAUDE §1` "log'a kimlik yazılır, içerik yazılmaz").
      message: `[${task.id}] ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
