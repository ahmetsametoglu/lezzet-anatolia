import { z } from 'zod';

import { apiFetch } from '../api/client';
import { getSupabase } from './supabase';

/*
  GELİŞTİRME GİRİŞİ (kullanıcı isteği 09.08) — login ekranındaki test düğmelerinin istemci ucu:
  OTP mail turunu atlar ama oturum GERÇEKTİR. Sunucu (`/api/v1/auth/dev-session`, yalnız yerel
  süreçte mount) magic-link token'ı üretir (mail gitmez); burada o token Supabase'in kendi
  doğrulamasından (`verifyOtp`) geçirilir — cihazda kalan oturum, OTP'yle kurulandan farksız.

  Düğmeler `__DEV__` arkasında; hesaplar aşağıdaki listede. Şema dosya-yerel (sayfaya-özel tip
  kuralı): tek tüketen bu akış, üretim sözleşmelerine karışmaz.

  BYPASS DEĞİL, GİRİŞ: web operasyonu guard'ı SUNUCUDA kısa devre yapan bir bypass kullanıyor
  (`apps/web/lib/guard.ts`); burada öyle bir şey YOK ve olmamalı. Ölçüldü (11.08): müşteri jetonuyla
  `/courier/day` → 403, kurye jetonuyla → 200. Bypass'ı mobile taşımak, dev'de yakalanabilen yetki
  hatalarını görünmez kılardı.
*/

/**
 * Dev giriş düğmelerinin hesapları — SIRA düğme sırasıdır.
 *
 * ── OPERASYON HESAPLARI SEED'İN MALI (21.32) ────────────────────────────────
 * Düğmelerden biri bir süre kullanıcının kendi adresine (`sametoglu@ayas.fr`) basıyordu ve o hesap
 * `{customer}`; yani "Operasyon (test)" düğmesi hiçbir zaman operasyona sokmuyordu (kullanıcı
 * bulgusu 11.08). Adresler artık `scripts/seed/people.ts`ten geliyor ve seed onlara giriş hesabı
 * da açıyor — `db:refresh` sonrası düğmeler ÇALIŞIR hâlde doğuyor.
 *
 * ── ÜÇ ROL, TEK "OPERASYON" DEĞİL (kullanıcı kararı 11.08) ──────────────────
 * Rol → bölüm eşlemesi birebirdir (`lib/operations/sections.ts`): admin yalnız Yönetim'i, kurye
 * yalnız Kurye'yi açar. Tek düğme hangisine bassa öteki iki bölüm yerelde hiç görülemezdi — dört
 * ekranın yalnız erişimsiz hâliyle doğrulanabildiği web arızasının (guard künyesi) aynısı.
 * Muhasebe ayrıca ÇOK bölümlüdür (para + depo), yani sekme çubuğunun görünür hâli de buradan
 * denenir; tek bölümlü hesapta çubuk bilerek çizilmez.
 */
interface DevAccount {
  label: string;
  email: string;
  /** Müşteri düğmesi zeytin, operasyon düğmeleri terracotta — hangi yüzeye gidildiği renkten okunur. */
  operations: boolean;
}

export const DEV_ACCOUNTS: readonly DevAccount[] = [
  { label: 'Müşteri', email: 'yamansehzade@gmail.com', operations: false },
  { label: 'Kurye', email: 'kurye@lezzetanatolia.fr', operations: true },
  { label: 'Depo', email: 'depo@lezzetanatolia.fr', operations: true },
  { label: 'Yönetim', email: 'yonetim@lezzetanatolia.fr', operations: true },
];

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
