import { InviteWelcomeSchema, type InviteWelcomeView } from '@lezzet/types';

import { maybeAuthorizedFetch } from '../auth/authorized-fetch';
import type { ApiResult } from '../api/client';

/*
  `GET /api/v1/invite/:code` — davet karşılamasının cihaz ucu. Şema `@lezzet/types`ta ve UÇ DA
  onunla üretiyor (sözleşme tek kaynak); burada yalnız çağrı var.

  ÇAĞRI `maybeAuthorizedFetch`: uç ziyaretçiye açık ama kimlikten YARARLANIR (keşif turunun aynı
  rejimi). Oturum yoksa istek Bearer'sız gider ve 401 dönmez; VARSA sunucu iki hâli ayırt edebilir
  — müşteri kendi bağlantısını açmıştır, ya da zaten müşteriyken bir tanıdığının bağlantısına
  dokunmuştur. `authorizedFetch` kullanılsaydı davetlinin — yani hesabı OLMAYAN kişinin — çağrısı
  ağa hiç çıkmadan 401'e düşerdi ki davetin tamamı o kişi için var.
*/

export function fetchInviteWelcome(code: string): Promise<ApiResult<InviteWelcomeView>> {
  return maybeAuthorizedFetch(`/api/v1/invite/${encodeURIComponent(code)}`, InviteWelcomeSchema);
}
