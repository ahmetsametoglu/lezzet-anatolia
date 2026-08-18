import { DeliveryTermsSchema, type DeliveryTerms } from '@lezzet/types';

import { maybeAuthorizedFetch } from '../auth/authorized-fetch';
import { type ApiResult } from './client';

/*
  `/api/v1/delivery-terms` — bilgi metinlerinin İLAN ETTİĞİ tutarlar (18.08 · kullanıcı kararı).

  Kargo ücreti, ücretsiz kargo eşiği, asgari sepet ve kapıda ödeme tavanı `settings` satırıdır;
  operatör Ayarlar'dan değiştirir. Bugüne kadar bu sayılar sözlükte DONMUŞTU ("Kargo ücreti 7,90 €"),
  yani ayar değiştiği gün sepet yeni sayıyı keser, yasal sayfa eskisini ilan ederdi.

  ── `maybeAuthorizedFetch`, ÇIPLAK `apiFetch` DEĞİL ─────────────────────────
  Uç oturumsuz açılıyor (yasal sayfa ve posta kodu adımı misafirde de görünür) ama kapsamın kanal
  ekseni müşteriden çıkıyor: onaylı toptancının asgari sepeti perakendeninkinden farklı. Jeton varsa
  gönderilir, yoksa çağrı yine yapılır — `authorizedFetch` olsaydı misafirde ağa hiç çıkmazdı.
*/

export type { DeliveryTerms };

export function fetchDeliveryTerms(): Promise<ApiResult<DeliveryTerms>> {
  return maybeAuthorizedFetch('/api/v1/delivery-terms', DeliveryTermsSchema);
}
