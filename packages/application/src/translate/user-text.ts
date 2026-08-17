import { runTask, translateTask, type AiFailureReason, type AiModel, type TranslateInput } from '@lezzet/ai';
import { buildTranslationBag } from '@lezzet/domain-core';
import type { PreferredLanguage, TranslationBag } from '@lezzet/types';

/*
  TEK METNİN ÇEVİRİSİ — **kuyruğun da, gönderim anının da tek kapısı** (17.08).

  Kaynağı `apps/backend`in çeviri kuyruğuydu (`translate-user-text`, 20.2) ve orada gömülü
  duruyordu: modeli çağır → `sourceLanguage`ı ayır → torbayı kur. Gönderim anında çeviri
  (kullanıcı kararı 17.08) aynı üç adımı ikinci kez isteyince buraya TERFİ etti — ikinci nüsha,
  bir gün birinin torbayı başka kurup ötekini unutması demekti (`CLAUDE §1`).

  **Yazma yok, karar yok.** Burası yalnız "bu metnin çevirisi nedir" sorusunu yanıtlar; hangi
  satıra yazılacağı, düşerse damga atılıp atılmayacağı çağıranın kararıdır — ve o karar iki
  çağıranda GERÇEKTEN farklı (kuyruk damgalayıp sırayı açar, gönderim anı damgalamaz ki satır
  kuyrukta kalsın).
*/

/** Çevirinin sonucu — orijinalin dili + öteki dillerin torbası. */
export interface TranslatedUserText {
  /** Modelin okuduğu kaynak dil; torbada bu dil bulunmaz (orijinal zaten odur). */
  language: string;
  /** Öteki dillerin metinleri; model hiçbir şey üretmediyse `null`. */
  translations: TranslationBag | null;
}

export type TranslateUserTextResult =
  | { ok: true; data: TranslatedUserText }
  | { ok: false; reason: AiFailureReason; message: string };

/**
 * Bir kullanıcı metnini çevirir. **Fırlatmaz** — sağlayıcı hatası da, yapılandırma eksikliği de
 * adlı bir ret olarak döner (`runTask`ın sözleşmesi). Sebebi ayrık tutmak çağıranın işine yarıyor:
 * `not_configured` "hiç denenmedi" demektir ve damgalanmamalı, ötekiler "denendi olmadı"dır.
 */
export async function translateUserText(
  text: string,
  kind: TranslateInput['kind'],
  opts: { model?: AiModel } = {},
): Promise<TranslateUserTextResult> {
  const res = await runTask(translateTask, { text, kind }, opts.model ? { model: opts.model } : {});
  if (!res.ok) return { ok: false, reason: res.reason, message: res.message };

  const { sourceLanguage, ...ceviriler } = res.data;
  return {
    ok: true,
    data: {
      language: sourceLanguage,
      translations: buildTranslationBag(sourceLanguage, ceviriler as Record<PreferredLanguage, string>),
    },
  };
}
