import { OAuthCheckResponseSchema, type OAuthCheckResponse } from '@lezzet/types';

import type { ApiResult } from '@lezzet/mobile-kit/src/lib/api/client';
import { authorizedFetch } from '@lezzet/mobile-kit/src/lib/auth/authorized-fetch';

/*
  GOOGLE DÖNÜŞÜNÜN KAYIT KAPISI (21.312) — operasyon girişi Google değişiminden hemen SONRA sorar: Supabase yeni
  Google hesabını girişin kendisinde yaratıyor, bu uygulamaya ise kayıtlı olmayan giremez (kullanıcı kararı
  14.09). Bu girişte doğan ve personel olmayan hesabı sunucu siler ve 403 `not_registered` döner; personel ya da
  önceden var olan hesap `kept`. Karar sunucuda (`packages/application/src/auth/oauth-account.ts`), burada
  yalnız sorulur.
*/
export function checkOAuthAccount(): Promise<ApiResult<OAuthCheckResponse>> {
  return authorizedFetch('/api/v1/auth/oauth/check', OAuthCheckResponseSchema, { method: 'POST' });
}
