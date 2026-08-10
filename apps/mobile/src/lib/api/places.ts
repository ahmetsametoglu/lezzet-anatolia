import type { Locale } from '@lezzet/i18n';
import type { z } from 'zod';
import {
  DeliveryAreaListSchema,
  PlaceNoticeResultSchema,
  PlaceResolutionSchema,
  PlaceOptionListSchema,
  type DeliveryAreaList,
  type PlaceNoticeBodySchema,
  type PlaceNoticeResult,
  type PlaceResolution,
  type PlaceOption,
} from '@lezzet/types';

import { maybeAuthorizedFetch } from '../auth/authorized-fetch';
import { apiFetch, type ApiResult } from './client';

/*
  `/api/v1/places/*` — yer uçları.

  ÇÖZÜM (`by-postal-code`) ÇIPLAK `apiFetch`, korunan çağrı DEĞİL: uç bilerek oturumsuz (hesap
  açılmadan önce sorulur — `places.ts` künyesi). Şema `@lezzet/types`tan; dört hâlin (resolved ·
  ambiguous · unknown · unresolved) anlamı ve "rota günleri neden yok" kararı sözleşme
  dosyasında yazılı.
*/

/* `PlaceNoticeResult` BİLEREK yeniden ihraç EDİLMEZ: adını yazan bir çağıran yok (bant
   `submitPlaceNotice`in sonucunu doğrudan okuyor) ve kullanılmayan bir dışa verim `knip`in ölü
   listesine düşer — `place-view.ts`teki `PlaceMode` kararının aynısı. */
export type { PlaceResolution, PlaceOption };

export function resolvePostalCode(code: string): Promise<ApiResult<PlaceResolution>> {
  return apiFetch(`/api/v1/places/by-postal-code?code=${encodeURIComponent(code)}`, PlaceResolutionSchema);
}

/**
 * POSTA KODU ÖNERİLERİ — `GET /api/v1/places/suggest?prefix=672` (21.28).
 *
 * Çözüm ucuyla aynı gerekçeyle ÇIPLAK `apiFetch`: adres formu doğrulama sonrası profil tamamlama
 * akışında da açılıyor ve orada henüz oturum yok.
 *
 * **Boş dizi geçerli bir cevaptır** (önek hiçbir koda düşmedi) ve kısa önek de boş döner — 400
 * DEĞİL: "6" geçersiz bir soru değil, henüz hiçbir yeri işaret etmeyen bir sorudur. Okuma düşerse
 * zarfın kendisi hata döner; ikisi karışmaz.
 */
export function suggestPostalCodes(prefix: string): Promise<ApiResult<PlaceOption[]>> {
  return apiFetch(`/api/v1/places/suggest?prefix=${encodeURIComponent(prefix)}`, PlaceOptionListSchema);
}

/**
 * TESLİMAT BÖLGELERİ — `GET /api/v1/places/zones` (kullanıcı kararı 10.08).
 *
 * ÇIPLAK `apiFetch`, çözüm ucuyla aynı gerekçe: liste herkese açıktır (bölge dışı ziyaretçi
 * "siz nereye gidiyorsunuz" diye soruyor, hesabı yok) ve kimliğe göre değişmez.
 *
 * DİL SORGUSU YOK: cevap ŞEHİR ADLARIDIR (`publicName`) — çevrilecek bir cümle değil, olduğu gibi
 * basılan özel adlar. Dili sorguya koymak, sunucuya tutamayacağı bir söz verdirirdi.
 *
 * **Boş dizi geçerli bir cevaptır** (sözleşme künyesi): ekran "henüz ilan edilmiş bölge yok" der;
 * okuma düşerse zarfın kendisi hata döner — ikisi karışmaz.
 */
export function fetchDeliveryAreas(): Promise<ApiResult<DeliveryAreaList>> {
  return apiFetch('/api/v1/places/zones', DeliveryAreaListSchema);
}

/**
 * "BURAYA DA GELİN" KAYDI — `POST /api/v1/places/notice` (21.20 · kullanıcı kararı 10.08).
 *
 * `maybeAuthorizedFetch`: ziyaretçiye AÇIK ama kimlikten YARARLANIR. Giriş duvarı yok (sözleşme
 * künyesi: "vazgeçmeye en yakın anda ikinci engel çıkarılmaz"); oturum varsa Bearer gider ve
 * e-postayı SUNUCU çözer — gövdeden gelen adres yok sayılır, yani başkasının yerine kayıt
 * bırakılamaz. Misafirde e-posta gövdeden gelir; verilmemişse uç `email_required` döner ve ekran
 * adresi sorar. Keşif turunun oy ucuyla aynı desen.
 *
 * Gövde tipi `z.input`: `email` şemada varsayılanlı (`.default(null)`), yani çağıran alanı hiç
 * yazmadan da geçebilir.
 *
 * ── `locale` ZORUNLU (ölçülmüş arıza 10.08) ─────────────────────────────────
 * Uç dili sorgudan okuyor ve dilsiz çağrıyı `400 invalid_locale` ile reddediyor — kaydı bir gün
 * yanlış dilde haber gitsin diye sessizce Türkçe'ye düşürmemek için (uç künyesi). Bu çağrı dili
 * hiç göndermiyordu: cihazda ölçüldü, "Kaydınızı alamadık — bağlantınızı kontrol edin" kırmızısı
 * TAŞIMA hatası değil, bizim eksik sorgumuzdu.
 *   POST /api/v1/places/notice → HTTP 400 {"error":"invalid_locale"}
 * Dil ekranın elinde (`useAppLocale`), o yüzden gövdeye değil imzaya kondu: gövdeye konsaydı
 * sözleşme yüzey diline bağlanırdı; ötekiler de (katalog · sepet · sipariş) dili sorguda taşıyor.
 */
export function submitPlaceNotice(
  locale: Locale,
  body: z.input<typeof PlaceNoticeBodySchema>,
): Promise<ApiResult<PlaceNoticeResult>> {
  return maybeAuthorizedFetch(`/api/v1/places/notice?locale=${encodeURIComponent(locale)}`, PlaceNoticeResultSchema, {
    method: 'POST',
    body,
  });
}
