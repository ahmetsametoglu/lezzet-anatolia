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

  BYPASS DEĞİL, GİRİŞ: burada guard'ı kısa devre yapan hiçbir şey YOK ve olmamalı. Ölçüldü (11.08):
  müşteri jetonuyla `/courier/day` → 403, kurye jetonuyla → 200. Bypass'ı mobile taşımak, dev'de
  yakalanabilen yetki hatalarını görünmez kılardı.

  Bu cümle bir süre web'i şimdiki zamanla anlatıyordu (*"web guard'ı bir bypass KULLANIYOR"*);
  **artık kullanmıyor** — `apps/web/lib/guard.ts`in dev bypass'ı 19.08'de tamamen söküldü ve
  ölçüldü: oturumsuz `/operations` yerelde 200 dönüyordu, şimdi 307 → giriş. Yani bu dosyanın
  reddi haklı çıktı ve web de aynı yere geldi; kıyas cümlesi geçmiş zamana çekildi (denetim notu,
  19.08).
*/

/**
 * Dev giriş düğmelerinin hesapları — SIRA düğme sırasıdır.
 *
 * ── HESAPLARIN HEPSİ SEED'İN MALI (21.32 · düzeltme 21.08) ──────────────────
 * Düğmelerden biri bir süre kullanıcının kendi adresine (`sametoglu@ayas.fr`) basıyordu ve o hesap
 * `{customer}`; yani "Operasyon (test)" düğmesi hiçbir zaman operasyona sokmuyordu (kullanıcı
 * bulgusu 11.08). Adresler artık `scripts/seed/people.ts`ten geliyor ve seed onlara giriş hesabı
 * da açıyor — `db:refresh` sonrası düğmeler ÇALIŞIR hâlde doğuyor.
 *
 * **21.32 yalnız PERSONEL düğmelerini düzeltmişti; müşteri düğmesi dışarıda kalmıştı** ve aynı
 * arızanın AYNADAKİ hâline düşmüştü (denetim bulgusu 19.08): `yamansehzade@gmail.com` yerel
 * `auth.users`ın en eski satırıydı, yani veritabanında hiç admin yokken doğmuştu ve `0002`
 * trigger'ının açılış kuralı (*"hiç admin yoksa ilk hesap admin olur"*) onu `{admin}` yapmıştı.
 * "Müşteri" yazan düğme müşteri oturumu AÇMIYORDU — webde ölçüldü, `/operations`a düşüyordu.
 * O turda dışarıda kalmasının sebebi `seedStaffLogins`in müşteriye auth hesabı açmamasıydı
 * (*"müşterinin girişi OTP akışının kendisidir"*): gerekçe doğru, sessiz varsayımı yanlıştı —
 * kullanıcının kendi adresinin bir müşteri olduğunu varsayıyordu.
 *
 * Düğme artık `claire.weber@example.fr`e basıyor: seed'in siparişli, adresli, puanlı müşterisi,
 * yani müşteri yüzeyinin DOLU hâlini gösteren hesap. Öteki müşteriler auth'suz kalıyor — **OTP
 * akışı kapanmadı**, elle e-posta girerek her zaman koşulabilir.
 *
 * **LİSTE WEB'İNKİYLE AYNI SIRADA VE AYNI ADRESLERDE** (`apps/web/lib/auth/dev-login-gate.ts`):
 * biri değişip öteki kalırsa eşleşme sessizce bozulur ve aynı düğme iki yüzeyde başka hesap açar.
 * `Muhasebe` de bu yüzden eklendi — aşağıdaki gerekçe onu zaten anlatıyordu ama listede yoktu,
 * yani künye teslim etmediği bir şeyi vaat ediyordu.
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

/**
 * Dört bölümü de gören personel — hem "Hepsi" düğmesinin hem OTOMATİK dev girişinin hesabı
 * (`use-dev-auto-login.hook`). Tek sabit, iki tüketen: adres iki yere yazılsaydı biri değiştiği
 * gün düğme bir hesabı, otomatik giriş başkasını açardı ve fark sessiz kalırdı (CLAUDE §1).
 */
export const DEV_ALL_SECTIONS_EMAIL = 'hepsi@lezzetanatolia.fr';

export const DEV_ACCOUNTS: readonly DevAccount[] = [
  { label: 'Müşteri', email: 'claire.weber@example.fr', operations: false },
  { label: 'Yönetim', email: 'yonetim@lezzetanatolia.fr', operations: true },
  { label: 'Depo', email: 'depo@lezzetanatolia.fr', operations: true },
  { label: 'Kurye', email: 'kurye@lezzetanatolia.fr', operations: true },
  { label: 'Muhasebe', email: 'muhasebe@lezzetanatolia.fr', operations: true },
  /* DÖRT BÖLÜMÜ DE GÖREN hesap (kullanıcı isteği 30.08): sekme çubuğunun dolu hâli ve bölümler
     arası geçiş ancak böyle bir kişiyle denenebilir — tek bölümlü kullanıcıda çubuk hiç çizilmez. */
  { label: 'Hepsi', email: DEV_ALL_SECTIONS_EMAIL, operations: true },
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
