import { NoObjectGeneratedError, TypeValidationError, generateObject, type LanguageModel } from 'ai';
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
 */
export async function runTask<TInput, TOutput>(
  task: AiTask<TInput, TOutput>,
  input: TInput,
  opts: {
    /** Modeli doğrudan verir — env'i atlar. Test için (`ai/test` sahte modeli) ve devir için. */
    model?: LanguageModel;
    modelId?: string;
    signal?: AbortSignal;
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

  try {
    const res = await generateObject({
      model,
      schema: task.output,
      system: task.system,
      prompt: task.buildPrompt(input),
      temperature: task.temperature,
      ...(opts.signal ? { abortSignal: opts.signal } : {}),
    });
    return { ok: true, data: res.object as TOutput, usage: toAiUsage(res.usage), modelId };
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
