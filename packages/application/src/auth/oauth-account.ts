import type { SupabaseClient } from '@supabase/supabase-js';
import { UserProfileService } from '@lezzet/database';
import { captureError } from '@lezzet/observability';
import { AUTH_SOURCE } from './otp';

/*
  OPERASYONA KAYITSIZ HESAP GİREMEZ — Google yolu (21.312, kullanıcı kararı 14.09).

  Kod ile girişte kural baştan uygulanır: hesabı olmayan e-postaya kod gitmez, doğrulama hesap açmaz
  (`otp.ts`, `registeredOnly`). Google'da bu mümkün değil — Supabase yeni bir Google hesabını GİRİŞİN
  KENDİSİNDE yaratır (`auth.users` + tetik 0002'nin profili). Kullanıcı seçimi: *"Google kalsın, kayıtsız
  hesap reddedilsin"*. Operasyon uygulaması Google dönüşünden hemen sonra bu kapıyı sorar; hesap bu girişte
  doğduysa silinir ve uygulama çıkış yapar.

  ── "BU GİRİŞTE DOĞDU" ÖLÇÜTÜ ───────────────────────────────────────────
  Açılış anı (`created_at`) ile son giriş anı (`last_sign_in_at`) arasındaki fark pencereden küçükse — ŞİMDİYE
  göre değil. Birkaç dakika önce müşteri uygulamasından kaydolmuş biri operasyonu Google'la denerse hesabı
  SİLİNMEZ: kayıtlıdır, kapı ona "yetki yok" der. Personel rolü olan hesap hiçbir koşulda silinmez. Son giriş
  damgası yoksa (beklenmez; dönüş bir giriştir) hesaba dokunulmaz.

  ── NE SİLİNİR, NE KALIR ───────────────────────────────────────────────
  Yalnız `auth.users` satırı. Profil tablosu silmeye kapalı (taban servisin kuralı: "ters kayıt ya da RPC")
  ve bağ `on delete set null`: tetiğin bu girişte açtığı profil ya da bağladığı eski misafir profili
  SAHİPSİZ kalır — misafirin siparişleri yerinde durur; aynı e-posta bir gün gerçekten kaydolursa tetik
  profili yeniden bağlar. `is_draft`a dokunulmaz: o işaret "WhatsApp telefonuyla açılan taslak"tır, "hesabı
  yok" değil.
*/

/** Açılış ile son giriş arası bu kadar yakınsa hesap bu girişte doğmuştur (ms). */
const FRESH_SIGN_UP_WINDOW_MS = 10_000;

/** Saf karar — zaman damgaları Supabase'in ISO dizgeleri; okunamayan damga "doğmadı" sayılır (silme yok). */
export function isFreshSignUp(createdAt: string, lastSignInAt: string | null | undefined, windowMs = FRESH_SIGN_UP_WINDOW_MS): boolean {
  if (!lastSignInAt) return false;
  const created = Date.parse(createdAt);
  const signedIn = Date.parse(lastSignInAt);
  if (Number.isNaN(created) || Number.isNaN(signedIn)) return false;
  return Math.abs(signedIn - created) <= windowMs;
}

export type OAuthAccountCheck = { status: 'kept' } | { status: 'rejected' } | { status: 'failed' };

/**
 * Google dönüşünden sonra hesabı sorar: bu girişte doğduysa ve personel değilse siler (`rejected`), yoksa
 * dokunmaz (`kept`). Okunamaz ya da silinemezse `failed` — çağıran oturumu yine kapatır (kapı kapalı kalır)
 * ama hesap hakkında karar verilmemiş sayılır ve iz kayda düşer.
 */
export async function rejectFreshOAuthAccount(admin: SupabaseClient, authUserId: string): Promise<OAuthAccountCheck> {
  const { data, error } = await admin.auth.admin.getUserById(authUserId);
  if (error || !data.user) {
    await captureError(new Error(`OAuth hesap kapısı: kullanıcı okunamadı: ${error?.message ?? 'kullanıcı yok'}`), {
      source: AUTH_SOURCE,
      context: { flow: 'auth/rejectFreshOAuthAccount', authUserId },
    });
    return { status: 'failed' };
  }
  if (await new UserProfileService(admin).isStaff(authUserId)) return { status: 'kept' };
  if (!isFreshSignUp(data.user.created_at, data.user.last_sign_in_at)) return { status: 'kept' };

  const { error: deleteError } = await admin.auth.admin.deleteUser(authUserId);
  // "Zaten yok" istenen sonucun ta kendisi (anonimleştirmenin emsali, `user-profile.service.ts`).
  if (deleteError && deleteError.status !== 404) {
    await captureError(new Error(`OAuth hesap kapısı: hesap silinemedi: ${deleteError.message}`), {
      source: AUTH_SOURCE,
      context: { flow: 'auth/rejectFreshOAuthAccount', authUserId },
    });
    return { status: 'failed' };
  }
  return { status: 'rejected' };
}
