import { Hono } from 'hono';
import { rejectFreshOAuthAccount } from '@lezzet/application';
import { serviceDb } from '@lezzet/database';
import type { OAuthCheckResponse } from '@lezzet/types';
import { fail, ok } from '../../lib/respond';
import type { V1Env } from './auth';

/**
 * `/api/v1/auth/oauth/*` — Google dönüşünün KAYIT KAPISI (21.312). Operasyon uygulaması kod değişiminden
 * hemen sonra sorar: hesap bu girişte doğduysa ve personel değilse silinir, uygulama çıkış yapar
 * (kullanıcı kararı 14.09: *"kullanıcı sistemde kayıtlı değilse giriş yapamayacak"*; kural ve ölçütün künyesi
 * `@lezzet/application` `auth/oauth-account.ts`).
 *
 * OTURUM İSTER — soru "BU hesap kayıtlı mıydı"dır ve kimliği yalnız token söyler; bu yüzden `router.ts`te
 * `bearerAuth`tan SONRA bağlanır (kod uçları `/auth/otp` ise ondan önce, oturumsuz).
 */
export const authOauth = new Hono<V1Env>();

// 200 {data:'kept'} · 403 not_registered (hesap bu girişte doğmuştu, silindi) · 502 check_failed
authOauth.post('/check', async (c) => {
  const result = await rejectFreshOAuthAccount(serviceDb(), c.get('authUser').id);
  if (result.status === 'kept') return ok(c, 'kept' satisfies OAuthCheckResponse);
  if (result.status === 'rejected') return fail(c, 'not_registered', 403);
  return fail(c, 'check_failed', 502);
});
