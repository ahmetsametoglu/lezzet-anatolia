import 'server-only';
import { cache } from 'react';
import { serviceDb, UserProfileService } from '@lezzet/database';
import { canAccessWarehouse, isStaff, warehouseScope, type WarehouseScope } from '@lezzet/domain-core';
import type { UserProfile, UserRole } from '@lezzet/types';
import { createClient } from './supabase/server';

// Tek yetki kapısı (DOMAIN §2): oturum çerezden, rol RLS'e takılmadan service-role ile `user_profiles.roles`tan okunur.
// Guard'lar hata fırlatır; API ve eylem için `{ok}` saran yardımcı ayrıdır ki izin kuralı tek yerde kalsın.

export type AuthErrorCode = 'auth_required' | 'forbidden';

export class AuthError extends Error {
  constructor(public code: AuthErrorCode) {
    super(code);
    this.name = 'AuthError';
  }
}

export interface AuthUser {
  /** **Auth kimliği** (`auth.users.id`) — oturumun sahibi. Profil-FK'li bir kolona YAZILMAZ. */
  id: string;
  email: string | null;
}

/**
 * Personel guard'larının dönüşü: auth kimliğinin yanında profil kimliği; profile FK veren her kolon (`order.courier_id`,
 * `order_status_log.actor_id`) profil kimliğini bekler. İkisi de `string` olduğu için karıştırılınca hata vermez, yalnız sorgu boş döner; ayrımı alanın adı taşır.
 */
export interface StaffUser extends AuthUser {
  /** **Profil kimliği** (`user_profiles.id`) — FK'li kolonlara yazılacak olan. */
  profileId: string;
}

/*
  Geliştirmede guard'ı atlayan bir yol yok: `/auth/dev-login` gerçek oturum açar ve ekranlar production'daki gibi davranır.
  Atlama yolu, yetki hatalarını ancak yerelde yakalanabilecekleri yerde görünmez kılardı.
*/

/** Oturumdaki kullanıcı (yoksa null), istek başına bir kez (`cache`): `getUser` oturumu Auth sunucusunda doğrular, her çağrı bir ağ turudur. */
export const getSessionUser = cache(async (): Promise<AuthUser | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ? { id: user.id, email: user.email ?? null } : null;
});

/** Oturumdaki kişinin profil satırı, istek başına bir kez (`cache`); kimlik, künye ve rol kararları bu satırdan okunur. */
export const readSessionProfile = cache(async (): Promise<UserProfile | null> => {
  const user = await getSessionUser();
  return user ? new UserProfileService(serviceDb()).findByAuthUserId(user.id) : null;
});

/**
 * Oturumdaki kişinin müşteri kimliği (`user_profiles.id`); auth kimliğinden ayrıdır ve profile FK veren her tabloya (`cart`, `order`,
 * `address`) bu yazılır. Dönüşüm tek yerde durur, çünkü çeviriyi atlayan bir kopya müşterinin verisini sessizce kaybettirir.
 */
export async function currentCustomerId(): Promise<string | null> {
  return (await readSessionProfile())?.id ?? null;
}

/** Oturumdaki müşterinin ekranda gösterilecek künyesi (ad, e-posta); tarayıcıya gittiği için rol ve kredi limiti gibi sırları taşımaz. */
export interface CustomerIdentity {
  id: string;
  name: string;
  email: string | null;
}

export async function currentCustomer(): Promise<CustomerIdentity | null> {
  const profile = await readSessionProfile();
  return profile ? { id: profile.id, name: profile.name ?? '', email: profile.email ?? null } : null;
}

/** Girişli kullanıcı şart; değilse AuthError('auth_required'). */
export async function requireAuth(): Promise<AuthUser> {
  const user = await getSessionUser();
  if (!user) throw new AuthError('auth_required');
  return user;
}

/**
 * Personel guard'larının ortak gövdesi: oturum → profil → rol kararı, iki kimlik birden döner. Rol kararı motorundur
 * (`domain-core/identity/roles`), guard yalnız satırı getirir ve sorar.
 */
async function staffProfile(allowed: (roles: readonly UserRole[]) => boolean): Promise<{ user: StaffUser; profile: UserProfile }> {
  const user = await requireAuth();
  const profile = await readSessionProfile();
  if (!profile || !allowed(profile.roles)) throw new AuthError('forbidden');
  return { user: { id: user.id, email: user.email, profileId: profile.id }, profile };
}

async function requireRole(role: UserRole): Promise<StaffUser> {
  return (await staffProfile((roles) => roles.includes(role))).user;
}

/**
 * Herhangi bir personel rolü şart (Operasyon yüzeyine giriş kapısı). Müşteri ↔ personel keskin
 * ayrımdır: müşteri rolü olan kişi buradan geçemez (DOMAIN §2).
 */
export async function requireStaff(): Promise<StaffUser> {
  return (await staffProfile(isStaff)).user;
}

/**
 * Personelin depo kapsamı (DOMAIN §17); `warehouseId` verilirse o depoya erişim de doğrulanır, yetkisizse `forbidden`. Kapsamsız depocu
 * ve kurye hiçbir depoyu göremez, çünkü boş kapsam "hepsi" değildir; karar motordadır (`warehouseScope`).
 */
export async function requireWarehouseScope(warehouseId?: string): Promise<{ user: StaffUser; scope: WarehouseScope }> {
  // Profil tek kez okunur: kapsam kararının istediği `roles` ve `warehouseIds` aynı satırda.
  const { user, profile } = await staffProfile(isStaff);

  const scope = warehouseScope(profile.roles, profile.warehouseIds);
  if (scope.kind === 'none') throw new AuthError('forbidden');
  if (warehouseId && !canAccessWarehouse(scope, warehouseId)) throw new AuthError('forbidden');
  return { user, scope };
}

/**
 * Verilen rollerden en az biri şart ("yönetici veya muhasebeci" gibi kapılar). Rol listesi bir kez getirilir, çünkü `requireRole`u iki
 * kez çağırmak ilkinin `forbidden`ıyla ikinciyi hiç çalıştırmazdı.
 */
export async function requireAnyRole(roles: readonly UserRole[]): Promise<StaffUser> {
  return (await staffProfile((owned) => roles.some((r) => owned.includes(r)))).user;
}

export const requireAdmin = (): Promise<StaffUser> => requireRole('admin');
/** Yönetici ya da muhasebeci — para gözü (tedarikçi borcu, sipariş tahsilatı, hesaplar). */
export const requireFinance = (): Promise<StaffUser> => requireAnyRole(['admin', 'accounting']);
export const requireWarehouse = (): Promise<StaffUser> => requireRole('warehouse');
export const requireCourier = (): Promise<StaffUser> => requireRole('courier');
/** Muhasebe: para/muhasebe ekranları ve export. Bir kişi hem depo hem muhasebe olabilir. */
export const requireAccounting = (): Promise<StaffUser> => requireRole('accounting');

// ─── Sarıcı: Server Action / route handler için throw yerine {ok} döndürür ──────

/** Guard'ın kimlik tipi korunur (`T`) ki personel kapısından geçen çağıran `g.user.profileId`yi görebilsin. */
export type GuardResult<T extends AuthUser = AuthUser> = { ok: true; user: T } | { ok: false; code: AuthErrorCode };

/** Bir guard'ı çağırıp sonucu `{ok}` biçiminde döndürür; eylem hatayı fırlatmadan ele alır: `if (!g.ok) return { error: g.code };`. */
export async function guarded<T extends AuthUser>(guard: () => Promise<T>): Promise<GuardResult<T>> {
  try {
    const user = await guard();
    return { ok: true, user };
  } catch (err) {
    if (err instanceof AuthError) return { ok: false, code: err.code };
    throw err;
  }
}
