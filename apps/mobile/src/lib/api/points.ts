import { z } from 'zod';
import type { MePointsHistoryEntrySchema } from '@lezzet/types';
import {
  MePointsHistoryPageSchema,
  MePointsRedeemResultSchema,
  MePointsViewSchema,
  PointsRulesSchema,
} from '@lezzet/types';

import { authorizedFetch } from '../auth/authorized-fetch';
import { apiFetch, type ApiResult } from './client';

/*
  `/api/v1/me/points` — puan cüzdanı (21.17): bakiye + çevirme eşiği + kullanılabilir kuponlar.

  `points: null` B2B demektir, SIFIR DEĞİL (sözleşme künyesi): ekran bölümü hiç çizmez —
  "0 puan" yazmak, programa dahil olmayan müşteriye olmayan bir bakiye göstermek olurdu.

  Çevirme gövdesizdir: kaç puanın harcanacağını istemci söylemez, motor bakiyenin tamamını
  çevirir (web kararı, sözleşmede yazılı).
*/

/*
  Kupon satırının ayrı bir takma adı YOK: kuponlar cüzdanın içinde geliyor ve ekran onları
  `MePointsView['coupons']` üzerinden çıkarımla okuyor (`account-screen`). `MeCouponSchema`dan
  ikinci bir ad türetmek, aynı şekle iki isim vermek olurdu (CLAUDE §1) — gerekirse görünümden
  indekslenerek alınır, yeniden türetilmez.
*/
export type MePointsView = z.infer<typeof MePointsViewSchema>;

export function fetchPoints(): Promise<ApiResult<MePointsView>> {
  return authorizedFetch('/api/v1/me/points', MePointsViewSchema);
}

export function redeemPoints(): Promise<ApiResult<z.infer<typeof MePointsRedeemResultSchema>>> {
  return authorizedFetch('/api/v1/me/points/redeem', MePointsRedeemResultSchema, { method: 'POST' });
}

export type PointsHistoryEntry = z.infer<typeof MePointsHistoryEntrySchema>;

/**
 * **Puan geçmişi sayfası** — *"hangi puan nereden geldi"* (kullanıcı isteği 15.08).
 *
 * İmleç OPAKTIR: istemci onu yorumlamaz, bir sonraki isteğe aynen geri verir (sipariş listesinin
 * aynı sözleşmesi). URL'e de yazılmaz — süzgeç yok, paylaşılabilecek bir seçim de yok.
 *
 * B2B'de uç 403 `not_eligible` döner ve bu bir arıza DEĞİL: program dışı profile boş liste dönmek
 * "hiç hareketiniz yok" demek olurdu. Ekran zaten oraya gitmez — geçmişin kapısı puan kartının
 * içinde ve kart B2B'de hiç çizilmiyor.
 */
export function fetchPointsHistory(cursor?: string): Promise<ApiResult<z.infer<typeof MePointsHistoryPageSchema>>> {
  const query = cursor === undefined ? '' : `?cursor=${encodeURIComponent(cursor)}`;
  return authorizedFetch(`/api/v1/me/points/history${query}`, MePointsHistoryPageSchema);
}

export type PointsRules = z.infer<typeof PointsRulesSchema>;

/**
 * **Programın kuralları — KİMLİKSİZ okuma** (`authorizedFetch` DEĞİL, `apiFetch`).
 *
 * Onboarding'in puan adımını misafir görüyor: jetonu yok. `authorizedFetch` kullansaydık çağrı
 * oturum yenilemeye takılır ve ekran boş kalırdı — oysa burada kişisel hiçbir şey istemiyoruz,
 * yalnız "kaç puan ne eder" soruyoruz (uç künyesi `apps/mobile-api/src/api/v1/points.ts`).
 */
export function fetchPointsRules(): Promise<ApiResult<PointsRules>> {
  return apiFetch('/api/v1/points/rules', PointsRulesSchema);
}

/**
 * **Günlük giriş puanı** (MB-50) — uygulama öne geldiğinde, girişli müşteride.
 *
 * Sonuç OKUNMAZ ve bu bilinçli: ödül sessizdir (karar seti 2h — *"uygulama açılınca: sessiz"*) ve
 * gün içindeki ikinci çağrı bir arıza değil, motorun zaten düşürdüğü normal davranıştır. Ekranın
 * bu cevaptan kuracağı bir cümle yok; bakiye hesap kartında görünüyor.
 */
export function recordVisit(): Promise<ApiResult<true>> {
  return authorizedFetch('/api/v1/me/points/visit', z.literal(true), { method: 'POST' });
}
