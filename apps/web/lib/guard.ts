import 'server-only';
import { serviceDb, UserProfileService } from '@lezzet/database';
import type { UserRole } from '@lezzet/types';
import { createClient } from './supabase/server';

// Tek yetki kapısı (DOMAIN §2). Oturum çerezden okunur; rol RLS deny-by-default olduğu için
// service-role ile `user_profiles.roles`'dan okunur. Guard'lar hata FIRLATIR; API/action için {ok}
// saran yardımcı ayrıdır — böylece izin kuralı tek yerde yaşar.

export type AuthErrorCode = 'auth_required' | 'forbidden';

export class AuthError extends Error {
  constructor(public code: AuthErrorCode) {
    super(code);
    this.name = 'AuthError';
  }
}

export interface AuthUser {
  id: string;
  email: string | null;
}

// ─── Dev-only auth bypass ──────────────────────────────────────────────────────
// Operasyon guard'larını (requireStaff/requireRole) atlayıp sahte admin enjekte eder — böylece
// geliştirmede admin girişi olmadan operasyon ekranları test edilebilir. GÜVENLİK: yalnız
// NODE_ENV !== 'production' iken çalışır; production build'de env ne olursa olsun ASLA aktif olmaz.
// Dev'de VARSAYILAN AÇIK; gerçek auth akışını dev'de test etmek için DEV_AUTH_BYPASS=false.
// Kapsam dar: yalnız personel kapıları — müşteri oturum/login akışına (getSessionUser) dokunmaz.
const DEV_BYPASS_USER: AuthUser = { id: '00000000-0000-0000-0000-0000000000ad', email: 'dev-admin@lezzet.local' };

let bypassWarned = false;
function devBypassActive(): boolean {
  const active = process.env.NODE_ENV !== 'production' && process.env.DEV_AUTH_BYPASS !== 'false';
  if (active && !bypassWarned) {
    bypassWarned = true;
    console.warn('[guard] DEV auth bypass AKTİF — operasyon guard atlanıyor (kapatmak için DEV_AUTH_BYPASS=false).');
  }
  return active;
}

/** Oturumdaki kullanıcı (yoksa null). */
export async function getSessionUser(): Promise<AuthUser | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ? { id: user.id, email: user.email ?? null } : null;
}

/** Girişli kullanıcı şart; değilse AuthError('auth_required'). */
export async function requireAuth(): Promise<AuthUser> {
  const user = await getSessionUser();
  if (!user) throw new AuthError('auth_required');
  return user;
}

async function requireRole(role: UserRole): Promise<AuthUser> {
  if (devBypassActive()) return DEV_BYPASS_USER;
  const user = await requireAuth();
  if (!(await new UserProfileService(serviceDb()).hasRole(user.id, role))) throw new AuthError('forbidden');
  return user;
}

/**
 * Herhangi bir personel rolü şart (Operasyon yüzeyine giriş kapısı). Müşteri ↔ personel keskin
 * ayrımdır: müşteri rolü olan kişi buradan geçemez (DOMAIN §2).
 */
export async function requireStaff(): Promise<AuthUser> {
  if (devBypassActive()) return DEV_BYPASS_USER;
  const user = await requireAuth();
  if (!(await new UserProfileService(serviceDb()).isStaff(user.id))) throw new AuthError('forbidden');
  return user;
}

export const requireAdmin = (): Promise<AuthUser> => requireRole('admin');
export const requireWarehouse = (): Promise<AuthUser> => requireRole('warehouse');
export const requireCourier = (): Promise<AuthUser> => requireRole('courier');
/** Muhasebe: para/muhasebe ekranları ve export. Bir kişi hem depo hem muhasebe olabilir. */
export const requireAccounting = (): Promise<AuthUser> => requireRole('accounting');

// ─── Sarıcı: Server Action / route handler için throw yerine {ok} döndürür ──────

export type GuardResult = { ok: true; user: AuthUser } | { ok: false; code: AuthErrorCode };

/**
 * Bir guard'ı çağırıp sonucu {ok} biçiminde döndürür — action'lar hatayı bilinçli
 * ele alır (kullanıcıya {error} döner), exception fırlatmaz.
 * Örn: `const g = await guarded(requireAdmin); if (!g.ok) return { error: g.code };`
 */
export async function guarded(guard: () => Promise<AuthUser>): Promise<GuardResult> {
  try {
    const user = await guard();
    return { ok: true, user };
  } catch (err) {
    if (err instanceof AuthError) return { ok: false, code: err.code };
    throw err;
  }
}
