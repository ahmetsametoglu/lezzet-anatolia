import { z } from 'zod';

import { apiFetch } from '../api/client';
import { getSupabase } from './supabase';

/*
  GELİŞTİRME GİRİŞİ (kullanıcı isteği 09.08) — login ekranındaki test düğmelerinin istemci ucu:
  OTP mail turunu atlar ama oturum GERÇEKTİR. Sunucu (`/api/v1/auth/dev-session`, yalnız yerel
  süreçte mount) magic-link token'ı üretir (mail gitmez); burada o token Supabase'in kendi
  doğrulamasından (`verifyOtp`) geçirilir — cihazda kalan oturum, OTP'yle kurulandan farksız.

  Düğmeler `__DEV__` arkasında; e-postalar kullanıcının verdiği iki gerçek test hesabı. Şema
  dosya-yerel (sayfaya-özel tip kuralı): tek tüketen bu akış, üretim sözleşmelerine karışmaz.
*/

export const DEV_CUSTOMER_EMAIL = 'yamansehzade@gmail.com';
export const DEV_ADMIN_EMAIL = 'sametoglu@ayas.fr';

const DevSessionSchema = z.object({ tokenHash: z.string().min(1) });

/**
 * Ret metni HAM döner (anahtar değil): bu yol yalnız geliştirmede görünür ve tek okuyucusu
 * geliştiricidir — arızayı adlandırmak yerine SÖYLEMEK teşhisi hızlandırır (üretim akışlarının
 * adlı-ret kuralı burada geçerli değil; düğmeler `__DEV__` arkasında).
 */
export async function devSignIn(email: string): Promise<{ error: string | null }> {
  const result = await apiFetch('/api/v1/auth/dev-session', DevSessionSchema, { method: 'POST', body: { email } });
  if (result.error !== null) return { error: `uç: ${result.error}` };

  const { error } = await getSupabase().auth.verifyOtp({ token_hash: result.data.tokenHash, type: 'magiclink' });
  return { error: error === null ? null : `doğrulama: ${error.message}` };
}
