import type { z } from 'zod';
import {
  DiscoverClaimResultSchema,
  DiscoverDeckSchema,
  DiscoverSwipeSchema,
  type DiscoverCard,
  type DiscoverClaimBodySchema,
  type DiscoverVoteBodySchema,
} from '@lezzet/types';
import type { Locale } from '@lezzet/i18n';

import { authorizedFetch, maybeAuthorizedFetch } from '../auth/authorized-fetch';
import type { ApiResult } from './client';

/*
  KEŞİF TURU İSTEMCİSİ (21.19) — üç kapı: desteyi oku · oyu yaz · girişsiz turu hesaba bağla.

  ŞEMA BURADA YAZILMAZ (`orders.ts` · `tickets.ts` ile aynı gerekçe): sözleşme `@lezzet/types`ta ve
  UÇ DA aynı şemayla üretiyor (02-mimari §3.2) — alan adı değişirse üreten ve tüketen aynı anda
  DERLEMEDE kırılır. Bu dosyanın işi yalnız yolu kurmak ve şemayı istemciye vermek.

  ÜÇ KAPI, İKİ FARKLI KORUMA — ve fark sözleşmenin kendisinden geliyor:
  · deste ve oy `maybeAuthorizedFetch`: giriş duvarı YOK (tasarımın açık kararı — misafirin oyu da
    talep sinyalidir), ama Bearer varsa sunucu oyu müşterinin üstüne yazar ve oylanmış kartları
    desteden eler. `authorizedFetch` kullanılsaydı misafir isteği ağa hiç çıkmaz, ekran boşuna
    "bağlantı kurulamadı" derdi.
  · talep kapısı `authorizedFetch`: hesaba bağlama kimliksiz anlamsızdır; oturumsuz çağrı ağa hiç
    çıkmadan `401 unauthorized` döner ve çağıran onu "bağlanacak bir hesap yok" diye okur.
*/

/** Turun tek kartı — sözleşmenin kendisi (fiyat/stok/varyant TAŞIMAZ, taşımamalı). */
export type { DiscoverCard };
/** Bir kaydırmanın cevabı: `id` (yalnız girişsizde dolu) + `pointsAwarded` (`null` = girişsiz). */
export type DiscoverSwipe = z.infer<typeof DiscoverSwipeSchema>;
/** Talep sonucu — kaç kaydırma bağlandı, karşılığında kaç puan yazıldı. */
export type DiscoverClaimResult = z.infer<typeof DiscoverClaimResultSchema>;
/**
 * Oy gövdesi — `z.input`: derleme kilidi şemanın GİRDİ şeklinden gelir (`me.ts` deseni), böylece
 * sözleşmede alan adı değişirse çağıran ekran da derlemede kırılır.
 */
export type DiscoverVoteInput = z.input<typeof DiscoverVoteBodySchema>;

/**
 * Turun destesi — tek turda, sayfalama YOK (aday kümesi veriyle değil operatörün eliyle büyür).
 *
 * `locale` ZORUNLU: uç dilsiz çağrıyı `400 invalid_locale` ile reddediyor (ürün adları sessizce
 * Türkçeye düşmesin diye) — vitrin ve katalog istemcilerinin aynı kuralı.
 *
 * BOŞ DESTE HATA DEĞİL: `{ cards: [] }` geçerli bir cevaptır (operatör henüz aday açmamıştır ya da
 * müşteri hepsini oylamıştır) — ayrımı ekran yapar, veri katmanı değil.
 */
export function fetchDiscoverDeck(locale: Locale): Promise<ApiResult<z.infer<typeof DiscoverDeckSchema>>> {
  return maybeAuthorizedFetch(`/api/v1/discover?locale=${encodeURIComponent(locale)}`, DiscoverDeckSchema);
}

/**
 * Bir kartın kaydırılması — ANINDA yazılır, tur sonunda toplu değil (web'in kararı): tur yarıda
 * bırakılırsa da o ana kadarki sinyal elde kalır.
 *
 * `dwellMs` İSTEĞE BAĞLI ve ölçülemediyse HİÇ GÖNDERİLMEZ — sıfır göndermek "kart hiç görülmedi"
 * demektir ve motor o kaydırmayı gürültü sayar (sözleşme künyesi · CLAUDE §1).
 */
export function submitDiscoverVote(input: DiscoverVoteInput): Promise<ApiResult<DiscoverSwipe>> {
  return maybeAuthorizedFetch('/api/v1/discover/vote', DiscoverSwipeSchema, { method: 'POST', body: input });
}

/**
 * Girişsizken yapılan turun hesaba bağlanması — kaydırma kimlikleri cihazın deposundan gelir.
 *
 * HİÇBİRİ BAĞLANAMASA BİLE `200` döner (`{ linked: 0, points: 0 }`): aynı ürün zaten oylanmışsa ya
 * da kayıtlar eskimişse bu bir arıza değil, normal sonuçtur — çağıran listeyi yine de temizler,
 * yoksa aynı kimlikler her açılışta boşuna kapıya taşınırdı.
 */
export function claimDiscoverSwipes(
  swipeIds: z.input<typeof DiscoverClaimBodySchema>['swipeIds'],
): Promise<ApiResult<DiscoverClaimResult>> {
  return authorizedFetch('/api/v1/me/discover/claim', DiscoverClaimResultSchema, {
    method: 'POST',
    body: { swipeIds },
  });
}
