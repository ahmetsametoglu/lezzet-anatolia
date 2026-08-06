import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

/**
 * `/api/v1` yanıt zarfı — apps/web server action sözleşmesiyle (`ActionResult`) AYNI şekil:
 * `{ data, error }`; başarıda `error: null`, hatada `data: null`. Expo istemcisi tek şekle
 * bakar, HTTP durum koduna ek olarak gövdeden de hatayı okuyabilir.
 *
 * `error` bir ANAHTAR taşır, cümle değil (`unauthorized` gibi): mobil müşteri yüzeyi i18n'li,
 * metin ekranın kendi sözlüğünde yaşar — apps/web müşteri kapısının (`customerErrorKey`) kararıyla
 * aynı gerekçe. Zarf tipinin `packages/types`'a terfisi Expo iskeleti (21.2) sözleşmeyi tüketmeye
 * başlayınca yapılacak (02-mimari §3.1 — terfi yöneticiye raporlandı).
 */
interface ApiEnvelope<T> {
  data: T | null;
  error: string | null;
}

/** Başarı zarfı — 200. */
export function ok<T>(c: Context, data: T): Response {
  return c.json({ data, error: null } satisfies ApiEnvelope<T>);
}

/** Hata zarfı — durum kodu çağırandan; gövde her zaman `{ data: null, error }`. */
export function fail(c: Context, message: string, status: ContentfulStatusCode): Response {
  return c.json({ data: null, error: message } satisfies ApiEnvelope<never>, status);
}
