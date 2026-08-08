import type { z } from 'zod';
import {
  type CloseCourierDayRequest,
  type ConfirmDoorDeliveryRequest,
  ConfirmDoorDeliveryResponseSchema,
  CourierDayCloseResultSchema,
  CourierDayResponseSchema,
  DayCloseDraftSchema,
  type DeliveryProofUploadRequest,
  DeliveryProofUploadResponseSchema,
  type MarkUndeliveredRequest,
  MarkUndeliveredResponseSchema,
} from '@lezzet/types';

import { authorizedFetch } from '../auth/authorized-fetch';
import { CLIENT_ERROR, type ApiResult } from './client';

/*
  KURYE UÇLARI — `/api/v1/courier/*` (21.10).

  ŞEMA BURADA YAZILMAZ: gövde sözleşmesi `@lezzet/types`ın (`contracts/courier-api.schema.ts`) ve
  uç DA aynı şemayla üretiyor (02-mimari §3.2 "sözleşme tek kaynak") — alan adı değişirse üreten
  ve tüketen aynı anda derlemede kırılır. Katalog emsali (`lib/api/catalog.ts`) ile aynı düzen.

  HEPSİ KORUNAN ÇAĞRI (`authorizedFetch`, çıplak `apiFetch` değil): uçlar Bearer'ın arkasında ve
  ayrıca `courier|admin` rol kapısı var. Oturum yoksa çağrı ağa hiç çıkmaz.

  ── OLUMSUZ SONUÇ BİR HATA DEĞİL, CEVABIN KENDİSİDİR ────────────────────────
  `stale` · `proof_required` · `forbidden` · `not_found` · `already_closed` uçtan **200** ile ve
  GÖVDEDE gelir (uç künyesi: "HTTP durumu ile kapı kararı ayrı sorulardır"). Yani bu dosyanın
  `ApiResult`u başarı döner ve KARARI ekran okur — burada hiçbiri hataya çevrilmez. Çevirseydik
  `currentStatus` gibi taşıdıkları bilgi bir anahtara indirgenip kaybolurdu ve kurye "teslim ettim"
  sanırken sistemin ne dediğini göremezdi (doc 04: *"app bu reddi YUTMAZ"*).

  Telin gerçek hataları (401 · 400 `note_required` · 500 · ağ) ise `ApiFail` olarak döner.
*/

/** `undefined` parametre YAZILMAZ (katalog emsali): boş dize meşru bir değerdir, yokluk değil. */
function queryOf(params: Record<string, string | undefined>): string {
  const pairs = Object.entries(params)
    .filter((entry): entry is [string, string] => entry[1] !== undefined)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
  return pairs.length === 0 ? '' : `?${pairs.join('&')}`;
}

/**
 * **Günün rotası** (K1). Gün verilmezse uç bugüne düşer ve GÜNÜ CEVAPTA döndürür — istemci
 * "hangi günü gösteriyorum" sorusunu kendi kendine sormaz, o yüzden burada bir varsayılan
 * hesaplanmıyor (ikinci bir hesap, gece yarısı geçişinde cevapla çelişirdi).
 */
export function fetchCourierDay(date?: string): Promise<ApiResult<z.infer<typeof CourierDayResponseSchema>>> {
  return authorizedFetch(`/api/v1/courier/day${queryOf({ date })}`, CourierDayResponseSchema);
}

/**
 * **Kapıda teslim** (K3 + K4) — kanıt, eksik kalem ve tahsilat TEK istekte. Ekran adımlara bölse
 * de isteği BÖLMEZ: sıra (kanıt → mal → teslim → para) kapının içindedir ve ağın koptuğu an
 * yarısı yazılmış bir teslimat bırakmamanın tek yolu budur.
 */
export function submitDoorDelivery(
  orderId: string,
  body: ConfirmDoorDeliveryRequest,
): Promise<ApiResult<z.infer<typeof ConfirmDoorDeliveryResponseSchema>>> {
  return authorizedFetch(`/api/v1/courier/stops/${orderId}/deliver`, ConfirmDoorDeliveryResponseSchema, {
    method: 'POST',
    body,
  });
}

/**
 * **Ulaşılamadı / kabul etmedi** (K5). Not UÇTA ZORUNLUDUR (sözleşmede `nullish`, uç `.extend`
 * ile daraltıyor) ve eksikse `400 note_required` döner — ekran onu bir ALAN hatası olarak
 * gösterir, genel bir "istek geçersiz" cümlesi değil.
 */
export function submitUndelivered(
  orderId: string,
  body: MarkUndeliveredRequest,
): Promise<ApiResult<z.infer<typeof MarkUndeliveredResponseSchema>>> {
  return authorizedFetch(`/api/v1/courier/stops/${orderId}/undelivered`, MarkUndeliveredResponseSchema, {
    method: 'POST',
    body,
  });
}

/**
 * **Kanıt yükleme izni** (K3). Dosya sunucudan GEÇMEZ: cihaz doğrudan kovaya yükler
 * (`uploadProofImage`), sunucu yalnız yetkiyi doğrulayıp kısa ömürlü bir izin yazar ve anahtarı
 * KENDİ seçer.
 */
export function requestProofUpload(
  orderId: string,
  body: DeliveryProofUploadRequest,
): Promise<ApiResult<z.infer<typeof DeliveryProofUploadResponseSchema>>> {
  return authorizedFetch(`/api/v1/courier/stops/${orderId}/proof-upload`, DeliveryProofUploadResponseSchema, {
    method: 'POST',
    body,
  });
}

/** **Gün kapanışı taslağı** (K7) — günün resmi + beklenen tahsilat; `closed` doluysa salt-okunur. */
export function fetchDayCloseDraft(date?: string): Promise<ApiResult<z.infer<typeof DayCloseDraftSchema>>> {
  return authorizedFetch(`/api/v1/courier/day-close${queryOf({ date })}`, DayCloseDraftSchema);
}

/**
 * **Günü kapat** (K7). `ok:false` + `already_closed` bir HATA DEĞİL bir gerçektir ve 200 ile
 * gelir — ekran onu "gün zaten kapalı" diye okur, kırmızı bir arıza gibi değil.
 */
export function submitDayClose(
  body: CloseCourierDayRequest,
): Promise<ApiResult<z.infer<typeof CourierDayCloseResultSchema>>> {
  return authorizedFetch('/api/v1/courier/day-close', CourierDayCloseResultSchema, { method: 'POST', body });
}

/**
 * **Kanıt görselini DOĞRUDAN kovaya yükler.**
 *
 * `authorizedFetch` KULLANILMAZ ve kullanılamaz: adres bizim ucumuz değil, R2'nin imzalı adresidir
 * — oraya Bearer jetonu göndermek, kendi oturum anahtarımızı üçüncü bir alan adına yollamak olurdu.
 * Zarf da yok: kova `{data, error}` döndürmez, çıplak HTTP durumu döndürür.
 *
 * İçerik türü İMZAYA BAĞLIDIR (kapı `filename` uzantısından türetip imzaya gömüyor); uyuşmayan
 * bir `Content-Type` ile yükleme R2 tarafında reddedilir, o yüzden çağıran ikisini TEK yerden
 * türetir (`proofFileName`).
 */
export async function uploadProofImage(
  uploadUrl: string,
  contentType: string,
  bytes: Uint8Array,
): Promise<{ ok: true } | { ok: false; error: string }> {
  let response: Response;
  try {
    response = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': contentType },
      // RN'in `fetch`i tipli diziyi taşır: `convertRequestBody` onu base64'e çevirip yerel
      // katmana verir (ölçüldü — react-native/Libraries/Network/convertRequestBody.js).
      body: bytes as unknown as BodyInit,
    });
  } catch {
    return { ok: false, error: CLIENT_ERROR.network };
  }

  // Kova "yüklendi" demediyse SESSİZ kalınmaz: kanıtsız kapanan bir teslimat, ihtilafın tek
  // sigortasının boş çıkması demektir (`courier/proof.ts` künyesi, aynı gerekçe).
  return response.ok ? { ok: true } : { ok: false, error: `upload_failed_${response.status}` };
}
