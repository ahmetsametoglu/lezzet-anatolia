import type { z } from 'zod';
import {
  B2bApplicantSchema,
  B2bApplicationResultSchema,
  B2bCompanyLookupSchema,
  B2bVatCheckSchema,
  type B2bApplicant,
  type B2bApplicationBodySchema,
} from '@lezzet/types';
import type { Locale } from '@lezzet/i18n';

import { authorizedFetch } from '../auth/authorized-fetch';
import { apiFetch, type ApiResult } from './client';

/*
  B2B BAŞVURUSU (21.31) — dört kapı: resmî kayıt oku · vergi numarası doğrula · durumu oku ·
  başvuruyu yaz.

  ŞEMA BURADA YAZILMAZ (`tickets.ts` · `recipe.ts` ile aynı gerekçe): sözleşme `@lezzet/types`ta ve
  UÇ DA aynı şemayla üretiyor (02-mimari §3.2) — alan adı değişirse üreten ve tüketen aynı anda
  DERLEMEDE kırılır.

  İKİ FARKLI KORUMA ve fark ucun kendi kararından geliyor:
  · OKUMALAR `apiFetch`: form kimlik sorulmadan doldurulur, aday numarasını yazıp künyesini görmeden
    hesap açmaya ikna olmaz. `authorizedFetch` kullansaydık misafirin "Bul" düğmesi ağa hiç çıkmaz,
    ekran boşuna "bağlantı kurulamadı" derdi (keşif turunun aynı ölçümü).
  · DURUM ve YAZMA `authorizedFetch`: başvuru bir müşteri kaydının hâli, sahibi olmalı. Oturumsuz
    çağrı ağa hiç çıkmadan `401 unauthorized` döner ve ekran bunu "önce kimlik" diye okur —
    yönlendirmeyi veri katmanı yapmaz (02-mimari §4).
*/

/** Kayıt okumasının üç sonucu — `not_found` ve `unavailable` HTTP hatası değil, cevabın kendisi. */
export type B2bCompanyLookup = z.infer<typeof B2bCompanyLookupSchema>;
/** Yazımın sonucu — başarı güncel durumu, ret eksik ALANLARI taşır. */
export type B2bApplicationResult = z.infer<typeof B2bApplicationResultSchema>;
/**
 * Yazma gövdesi — `z.input`: derleme kilidi şemanın GİRDİ şeklinden gelir (`discover.ts` deseni).
 * İhraç EDİLMİYOR: çağıran hook gövdeyi nesne değişmeziyle kuruyor, adı dışarıda geçmiyor.
 */
type B2bApplicationBody = z.input<typeof B2bApplicationBodySchema>;
export type { B2bApplicant };

/** Resmî işletme kaydı — ekranın "Bul" düğmesi; biçimi tutmayan numara uçta zaten `not_found`. */
export function lookupB2bCompany(siret: string): Promise<ApiResult<B2bCompanyLookup>> {
  return apiFetch(`/api/v1/b2b/company/${encodeURIComponent(siret)}`, B2bCompanyLookupSchema);
}

/**
 * AB vergi numarası doğrulaması. `valid: null` = SORULAMADI ve bu bir hata değil: üye ülkelerin
 * sunucuları düzenli olarak cevap vermiyor, meşru başvuruyu bunun için kesmek servisin arızasını
 * müşterinin kusuru gibi göstermek olurdu (kapının künyesi).
 */
export function checkB2bVatNumber(vatNumber: string): Promise<ApiResult<z.infer<typeof B2bVatCheckSchema>>> {
  return apiFetch(`/api/v1/b2b/vat/${encodeURIComponent(vatNumber)}`, B2bVatCheckSchema);
}

/**
 * Başvuru durumu + form ön dolgusu. `locale` ZORUNLU: ret gerekçesi başvuranın dilinde çözülür
 * (20.2) ve uç dilsiz çağrıyı `400 invalid_locale` ile reddediyor.
 */
export function fetchB2bApplicant(locale: Locale): Promise<ApiResult<B2bApplicant>> {
  return authorizedFetch(`/api/v1/me/b2b?locale=${encodeURIComponent(locale)}`, B2bApplicantSchema);
}

/** Başvurunun yazımı — kuyruğa koyar, onay VERMEZ; cevap güncel durumu ya da eksik alanları taşır. */
export function submitB2bApplicationRequest(
  body: B2bApplicationBody,
  locale: Locale,
): Promise<ApiResult<B2bApplicationResult>> {
  return authorizedFetch(`/api/v1/me/b2b/application?locale=${encodeURIComponent(locale)}`, B2bApplicationResultSchema, {
    method: 'POST',
    body,
  });
}
