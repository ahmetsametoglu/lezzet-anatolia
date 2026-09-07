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
import { toAiUsage } from './usage';
import type { AiResult, AiTask } from './types';

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
 * 3. **Loglamaz.** Ölçümü döndürür; kaydı çağıran tutar. Paketin logger'ı olsaydı ölçümün
 *    hangi işe ait olduğunu paket bilmek zorunda kalırdı.
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

/** İki fazın ölçümü TEK satırda toplanır — maliyet çağrı başına değil, GÖREV başına okunur. */
function sumUsage(a: Parameters<typeof toAiUsage>[0], b: Parameters<typeof toAiUsage>[0]): ReturnType<typeof toAiUsage> {
  const x = toAiUsage(a);
  const y = toAiUsage(b);
  const topla = (p: number | null, q: number | null) => (p === null && q === null ? null : (p ?? 0) + (q ?? 0));
  return {
    inputTokens: topla(x.inputTokens, y.inputTokens),
    outputTokens: topla(x.outputTokens, y.outputTokens),
    totalTokens: topla(x.totalTokens, y.totalTokens),
    cachedInputTokens: topla(x.cachedInputTokens, y.cachedInputTokens),
  };
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
      return {
        ok: true,
        data: res.object as TOutput,
        usage: sumUsage(gather.usage, res.usage),
        modelId,
        toolCalls: facts.names,
      };
    }

    const res = await generateObject({ ...ortak, schema: task.output });
    return { ok: true, data: res.object as TOutput, usage: toAiUsage(res.usage), modelId, toolCalls: [] };
  } catch (err) {
    // Şema ihlali ile ağ/kota hatasını ayırmak çağıranın DAVRANIŞINI değiştirir: birinde prompt
    // sorgulanır, ötekinde tekrar denenir. Tek 'hata' demek ikisini de teşhissiz bırakırdı.
    const sematik = NoObjectGeneratedError.isInstance(err) || TypeValidationError.isInstance(err);
    return {
      ok: false,
      reason: sematik ? 'invalid_output' : 'provider_error',
      // **Mesaj yalnız hatanın kendisidir** — girdi metni asla eklenmez: kullanıcı yorumu/talep
      // gövdesi log'a düşerdi (`CLAUDE §1` "log'a kimlik yazılır, içerik yazılmaz").
      message: `[${task.id}] ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
