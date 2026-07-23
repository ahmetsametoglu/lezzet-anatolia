import 'server-only';
import { serviceDb, StaffRoleService } from '@lezzet/database';
import type { StaffRole } from '@lezzet/types';
import { createClient } from './supabase/server';

// Tek yetki kapısı (DOMAIN §2). Oturum çerezden okunur; personel rolü RLS deny-by-default
// olduğu için service-role ile okunur. Guard'lar hata FIRLATIR; API/action için {ok} saran
// yardımcı ayrıdır — böylece izin kuralı tek yerde yaşar.

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

async function requireRole(role: StaffRole): Promise<AuthUser> {
  const user = await requireAuth();
  const roles = new StaffRoleService(serviceDb());
  if (!(await roles.hasRole(user.id, role))) throw new AuthError('forbidden');
  return user;
}

/** Herhangi bir personel rolü şart (Operasyon yüzeyine giriş kapısı). */
export async function requireStaff(): Promise<AuthUser> {
  const user = await requireAuth();
  const roles = new StaffRoleService(serviceDb());
  if ((await roles.getRoles(user.id)).length === 0) throw new AuthError('forbidden');
  return user;
}

export const requireAdmin = (): Promise<AuthUser> => requireRole('admin');
export const requireWarehouse = (): Promise<AuthUser> => requireRole('warehouse');
export const requireCourier = (): Promise<AuthUser> => requireRole('courier');

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
