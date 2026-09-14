import { z } from 'zod';
import { MeSchema, type MePreferencesSchema, type MeUpdateSchema } from '@lezzet/types';

import { authorizedFetch } from '../auth/authorized-fetch';
import type { ApiResult } from './client';

/*
  `/api/v1/me` — kimliği doğrulanmış kullanıcının profili.

  ŞEMA BURADA YAZILMAZ: `MeSchema` `@lezzet/types`ta yaşıyor ve UÇ DA onunla üretiyor (02-mimari
  §3.2 "sözleşme tek kaynak") — alan adı değişirse üreten ve tüketen aynı anda derlemede kırılır.
  Şemanın kendi künyesi `roles` alanının neden kümede olduğunu da yazıyor: uygulama kökü hangi
  kabuğu açacağına bu alanla karar verir.

  KORUNAN ÇAĞRI (`authorizedFetch`), çıplak `apiFetch` değil: uç Bearer'ın arkasında ve 401'de
  oturum bir kez tazelenip bir kez yeniden denenir. Oturum YOKSA çağrı ağa hiç çıkmaz, yerel
  kısa devreyle `401 unauthorized` döner — "oturumsuz kullanım = müşteri" kararının okunacağı yer
  burasıdır (02-mimari §4), veri katmanı yönlendirme YAPMAZ.

  TİP `z.infer` ile TÜRETİLİYOR: `Me` tipi `packages/types`tan bilerek ihraç edilmemişti ("ilk tip
  tüketicisi uygulama kabuğuyla gelecek, o gün tek satırla eklenir" — `me-api.schema.ts`). O gün
  BUGÜN, ama `packages/*` bu şeridin yazma alanı değil: tip şimdilik şemadan türetiliyor (aynı tek
  kaynak, sıfır duplikasyon) ve terfi ihtiyacı olarak raporlandı.
*/

/** Kabuğun okuduğu profil — alan kümesi `MeSchema`nın kendisi. */
export type Me = z.infer<typeof MeSchema>;

export function fetchMe(): Promise<ApiResult<Me>> {
  return authorizedFetch('/api/v1/me', MeSchema);
}

/**
 * Profil güncellemesi (21.14c) — ad + telefon; gövde `MeUpdateSchema`nın kendisi (`z.input`:
 * gönderilmeyen alana dokunulmaz, `phone: null` numarayı siler). Adlı retler zarfta anahtar
 * olarak döner (`name_required` · `phone_invalid` · `phone_taken`); cümleyi ekran kurar.
 */
export function updateMe(input: z.input<typeof MeUpdateSchema>): Promise<ApiResult<Me>> {
  return authorizedFetch('/api/v1/me', MeSchema, { method: 'PATCH', body: input });
}

/**
 * Tercihler (21.16) — dil + kampanya izinleri; profil güncellemesinden AYRI uç (sözleşmenin
 * kendi ayrımı: ad/telefon "kimlik kartı", dil/izin "nasıl konuşalım"). İstemci yalnız
 * `granted` boolean'ı gönderir; kanıtın damgasını (`at`/`source`) sunucu vurur. Boş gövde
 * görünür rettir (`no_changes`) — ekran yalnız DEĞİŞEN alanı yollar.
 */
export function updatePreferences(input: z.input<typeof MePreferencesSchema>): Promise<ApiResult<Me>> {
  return authorizedFetch('/api/v1/me/preferences', MeSchema, { method: 'PATCH', body: input });
}

/**
 * **Hesabı silme** (GDPR md. 17 · App Store 5.1.1(v)) — geri alınamaz, gövdesiz.
 *
 * Kimlik GÖNDERİLMEZ: silinecek hesap oturumun kendisidir ve sunucu onu jetondan çözer (uç
 * künyesi). Cevap yalnız "oldu mu" der; başarıdan SONRA çıkış yapmak çağıranın işidir — sunucu
 * `auth.users` satırını siliyor ama cihazdaki jetona dokunamıyor.
 */
export function deleteAccount(): Promise<ApiResult<true>> {
  return authorizedFetch('/api/v1/me', z.literal(true), { method: 'DELETE' });
}
