import type { z } from 'zod';
import {
  type CloseDeliveryRunRequest,
  CloseDeliveryRunResultSchema,
  type ConfirmDoorDeliveryRequest,
  ConfirmDoorDeliveryResponseSchema,
  CourierDayResponseSchema,
  CourierRoutesResponseSchema,
  DayCloseDraftSchema,
  type DeliveryProofUploadRequest,
  DeliveryProofUploadResponseSchema,
  type MarkUndeliveredRequest,
  MarkUndeliveredResponseSchema,
  type StartCourierDayRequest,
  StartCourierDayResponseSchema,
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
  `stale` · `proof_required` · `forbidden` · `not_found` · `already_closed` · `already_started` ·
  `route_required` · `no_route` uçtan **200** ile ve
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
 *
 * Cevabın `run` alanı SEFERİN künyesidir (18.08): `null` = kurye o gün henüz rota almadı. "Gün
 * başladı mı" sorusunun cevabı artık burada — istemcide tutulan bir bayrak değil.
 */
export function fetchCourierDay(date?: string): Promise<ApiResult<z.infer<typeof CourierDayResponseSchema>>> {
  return authorizedFetch(`/api/v1/courier/day${queryOf({ date })}`, CourierDayResponseSchema);
}

/**
 * **O gün koşan rotalar** (K1 rota seçimi · 18.08). Kurye seferi hangi rotada süreceğini buradan
 * seçer — "arayüzden atama saçma, kurye rotayı alır ve sürer" (kullanıcı kararı 17.08).
 *
 * Rotanın `run`u doluysa o rota bugün BAŞLATILMIŞTIR: rota+gün başına tek sefer (K3) olduğu için
 * ikinci bir sefer açılamaz ve ekran rotayı pasif gösterip kimin sürdüğünü söyler.
 */
export function fetchCourierRoutes(date?: string): Promise<ApiResult<z.infer<typeof CourierRoutesResponseSchema>>> {
  return authorizedFetch(`/api/v1/courier/routes${queryOf({ date })}`, CourierRoutesResponseSchema);
}

/**
 * **"Seferi başlat"** (K1 · 18.08 — eski "yola çıktım"ın sefer bilinçli hâli). Sefer kaydını DOĞURAN
 * çağrı: rotanın hazır duraklarını yola çıkarır ve siparişlerin kuryesi bu seferden gelir.
 *
 * Cevap dört dallı bir birleşimdir ve dördü de **200** ile gelir; hiçbiri hataya çevrilmez:
 * · `ok` — sefer açıldı; içinde seferin künyesi + dört liste (`started` · `alreadyOut` · `stale` ·
 *   `skipped`). Bu ucun "yarısı oldu" hâli normaldir, o yüzden tek bir sayıya indirilmedi.
 * · `already_started` — rota+gün başına TEK sefer (K3): rota bugün açılmış. `mine` başlatanın bu
 *   kurye olup olmadığını söyler; ikisi ekranda AYRI cümledir.
 * · `route_required` / `no_route` — seçilecek rota belirsiz ya da yok.
 *
 * Gün gönderilir çünkü ekranın gösterdiği gün ile başlatılan gün AYNI olmak zorunda: liste gece
 * yarısından önce okunmuş ve düğmeye sonra basılmışsa, günsüz bir istek YARININ rotasını başlatıp
 * ekranda duran bugünkü listeyi kilitli bırakırdı. Bu ikinci bir hesap değil, cevabın kendi
 * `date`inin geri gönderilmesidir. `zoneId` de aynı sebeple gönderilir: seçilen rota ekranda
 * görünendir, ucun kendi çözümü değil (uç yine tek adayda otomatik seçer — biz seçimi biliyorsak
 * ona bırakmayız).
 */
export function startCourierDay(
  body: StartCourierDayRequest = {},
): Promise<ApiResult<z.infer<typeof StartCourierDayResponseSchema>>> {
  return authorizedFetch('/api/v1/courier/day/start', StartCourierDayResponseSchema, { method: 'POST', body });
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

/**
 * **Sefer kapanışı taslağı** (K7 · 18.08) — seferin resmi + beklenen tahsilat; `closed` doluysa
 * ekran salt-okunur. `run: null` = o gün sürülmüş sefer yok, kapanacak bir şey de yok.
 *
 * `runId` verilmezse uç kuryenin o günkü seferini kendi bulur (kapanmamış olan öncelikli) —
 * `/courier/day` ile AYNI çözümü kullanır, yani iki okuma aynı sefere bakar. Verildiğinde ise
 * özne kesindir: ekranın gösterdiği sefer ile kapatılan sefer ayrışamaz.
 */
export function fetchDayCloseDraft(
  params: { date?: string; runId?: string } = {},
): Promise<ApiResult<z.infer<typeof DayCloseDraftSchema>>> {
  return authorizedFetch(
    `/api/v1/courier/day-close${queryOf({ date: params.date, runId: params.runId })}`,
    DayCloseDraftSchema,
  );
}

/**
 * **Seferi kapat** (K7 · 18.08). `runId` ZORUNLU: kapanışın öznesi gün değil SEFER — iki sefer
 * sürmüş kurye ikisini ayrı kapatır.
 *
 * `ok:false` + `already_closed` bir HATA DEĞİL bir gerçektir ve 200 ile gelir — ekran onu "sefer
 * zaten kapalı" diye okur, kırmızı bir arıza gibi değil.
 */
export function submitDayClose(
  body: CloseDeliveryRunRequest,
): Promise<ApiResult<z.infer<typeof CloseDeliveryRunResultSchema>>> {
  return authorizedFetch('/api/v1/courier/day-close', CloseDeliveryRunResultSchema, { method: 'POST', body });
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
