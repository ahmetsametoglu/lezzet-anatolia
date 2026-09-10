import { isAuthApiError } from '@supabase/supabase-js';

import { forgetAccountLocale } from '@/lib/i18n/app-locale';
import { resetDeliveryAddress } from '@/screens/customer-kit/delivery-address-store';

import { clearStoredSession } from './session-store';
import { getSupabase } from './supabase';

/*
  OTURUMUN SONU (21.304) — cihazdaki oturumu kapatan İKİ yol ve ikisinin ORTAK yarısı.

  · GÖNÜLLÜ çıkış (`sign-out.ts`): kişi "Oturumu kapat"a basar. Önce push kaydı bırakılır (yetki
    ister), sonra buradaki ortak yarı koşar.
  · REDDEDİLEN oturum (`endRejectedSession`): sunucu jetonu, auth sunucusu da tazelemeyi KESİN
    reddetmiştir. Push adımı YOK — reddedilmiş kimlikle yetkili istek atılamaz; atılsaydı
    `authorizedFetch` → 401 → yine bu kapı diye bir döngü kurulurdu. Cihaz başka hesaba geçtiğinde
    sunucudaki sahip devri yanlış alıcıyı zaten keser (`register-device` künyesi).

  ── NİÇİN DOĞDU (10.09, cihazda ölçüldü) ────────────────────────────────────
  17:27'deki `db:refresh` Oppo'daki depo oturumunu öldürdü ama uygulama onu 17:57'ye kadar taşıdı:
  depo ana sayfası "İş listesi yüklenemedi — Bağlantı ya da sunucu sorunu", kargo devri
  "okunamadı" yazdı, üstbaşlıkta silinmiş personelin adı durdu. GoTrue günlüğü: 17:52:09'da mobil
  API'nin `/user` sorusu 403 `user_not_found`, telefonun tazelemesi 400 `refresh_token_not_found`
  aldı — oturum kesin ölüydü ve uygulama bunu DUYMUŞTU.

  Duyduğu hâlde kapatmamasının sebebi supabase-js'in kendisi (auth-js 2.110.8,
  `GoTrueClient._callRefreshToken`): tazeleme kesin reddedilince cihazdaki erişim jetonunun SAATİNE
  bakıyor, süresi dolmamışsa isteği "erken tazeleme" sayıp oturumu BİLEREK koruyor. Ret ayrıca
  60 sn önbelleğe alınıyor (`REFRESH_FAILURE_COOLDOWN_MS`); sonraki denemeler ağa çıkmadan aynı
  cevabı okuyor. Kütüphanenin bilmediği şey jetonun ÇALIŞMADIĞI — sunucu onu az önce reddetti. O
  bilgi yalnız `authorizedFetch`in elinde; karar orada verilir, sonu burada uygulanır. Eskiden
  oturum ancak jetonun kendi süresi dolunca (en çok 1 saat — `supabase/config.toml` `jwt_expiry`)
  kütüphanece kaldırılıyordu.

  Yeniden üretildi (18:58): telefonun `auth.sessions` satırı silindi — uzaktan iptalin aynısı —
  ve aynı tablo çıktı: `/user` 403 `session_not_found`, tazeleme 400 `refresh_token_not_found`,
  ekran "yüklenemedi", oturum cihazda. Yani arıza yerele özgü değil: canlıda iptal edilen ya da
  silinen her oturum bu pencereyi açardı.

  ── ÖLÜMÜN KANITI 401 DEĞİL, AUTH SUNUCUSUNUN CEVABI ────────────────────────
  Mobil API, auth sunucusuna ULAŞAMADIĞINDA da 401 veriyor (`lib/api/client` → `failureCauseOf`
  künyesi: GoTrue `/user` 504 → `unauthorized`). 401'e bakıp oturum kapatmak, bir auth kesintisinde
  bütün kuryeleri rota ortasında dışarı atardı. Karar tazelemenin cevabına bağlı: auth sunucusu
  "bu tazeleme jetonu yok / iptal edilmiş / oturumun süresi geçmiş / kullanıcı engelli" dediyse
  ölüm kesindir. Ağ hatası, 5xx, 429 (hız sınırı) KESİN DEĞİL — oturum korunur, ekran
  "doğrulanamadı" der. Tanınmayan bir kod oturumu KAPATMAZ; en kötü hâlde eski davranışa (jetonun
  süresi dolunca kütüphanenin kapatması) düşülür.
*/

/**
 * Auth sunucusunun tazelemeye verdiği "bu oturum bitti" cevapları — auth-js'in hata kodu listesinden
 * (`ErrorCode`). Cihazda ölçülen `refresh_token_not_found` (10.09: hem silinen kullanıcıda hem
 * silinen oturumda).
 */
const DEAD_SESSION_CODES: ReadonlySet<string> = new Set([
  'refresh_token_not_found',
  'refresh_token_already_used',
  'session_expired',
  'user_banned',
]);

/** Tazeleme hatası oturumun ÖLDÜĞÜNÜ mü söylüyor, yoksa yalnız "şu an olmadı" mı. */
export function isDeadSessionAnswer(error: unknown): boolean {
  return isAuthApiError(error) && DEAD_SESSION_CODES.has(error.code ?? '');
}

/**
 * Cihaz tarafı oturum sonu — gönüllü çıkışla reddedilen oturumun ORTAK yarısı; cihaz durumunu
 * boşaltan TEK kapı burası.
 *
 * `scope: 'local'`: bu cihazın oturumu kapanır (refresh token'ın sunucuda küresel iptali ayrı ürün
 * kararı; "tüm cihazlardan çıkış" gelirse buradan tek satırla döner). Supabase temizliği ağdan
 * bağımsız denenir, depo HER durumda elle de boşaltılır — çıkış asla yarım kalmaz.
 *
 * KARTTAN YANSIYAN DİL DE ÇIKAR (16.08): oturum anahtarını silip dili bırakmak, bir sonraki YENİ
 * hesabı gidenin diliyle açıyordu — gerekçe ve ölçüm `lib/i18n/app-locale` künyesinde. Kullanıcının
 * kendi seçtiği dil düşmez; ayrımı o modül yapar, burada koşul yazılmaz (iki yerde iki ölçüt olurdu).
 *
 * SEÇİLİ TESLİMAT ADRESİ DE DÜŞER (27.08): kimliği bellekte tutan depo kendi künyesinde "müşteri
 * değişince seçim düşer" diyordu ama kapıyı çağıran yoktu (knip ölü ihraç olarak gösterdi). Kalan
 * kimlik yeni müşteride hiçbir şeye karşılık gelmez; sunucu varsayılana düşerek kendini koruyor
 * ama ekran o arada başkasının adresini seçili gösterirdi.
 */
export async function endDeviceSession(): Promise<{ error: string | null }> {
  const { error } = await getSupabase().auth.signOut({ scope: 'local' });
  await clearStoredSession();
  await forgetAccountLocale();
  resetDeliveryAddress();
  return { error: error?.message ?? null };
}

const rejectionListeners = new Set<() => void>();

/**
 * Reddedilen oturumu duymak isteyen için — bugün tek abonesi kökteki kanca
 * (`use-session-ended-login`): giriş ekranını sebebiyle açar. Supabase'in `SIGNED_OUT` olayı gönüllü
 * çıkışla reddi ayırmıyor; ayrım buradan gelir. Dönen fonksiyon aboneliği bırakır.
 */
export function onSessionRejected(listener: () => void): () => void {
  rejectionListeners.add(listener);
  return () => {
    rejectionListeners.delete(listener);
  };
}

/** Süren kapanış — aynı anda düşen istekler (hub üç ucu birden okur) TEK kapanışı paylaşır. */
let ending: Promise<void> | null = null;

/**
 * Reddedilen oturumun sonu. Aboneler kapanıştan ÖNCE duyar ki `SIGNED_OUT` geldiğinde sebep
 * yerinde olsun. Tek uçuşlu: ikinci bir kapanış ikinci bir `SIGNED_OUT` yayar ve kapıyı boşuna
 * yeniden sorgulatırdı.
 *
 * `endDeviceSession`in döndürdüğü hata burada okunmaz: auth-js yerel oturumu çıkış ucu hata verse
 * de siliyor (`_signOut` → `removeCurrentSession`), depo zaten elle boşaltılıyor ve oturum
 * sunucuda ölü — bildirilecek bir karar kalmıyor.
 */
export function endRejectedSession(): Promise<void> {
  ending ??= (async () => {
    rejectionListeners.forEach((listener) => listener());
    await endDeviceSession();
  })().finally(() => {
    ending = null;
  });
  return ending;
}
