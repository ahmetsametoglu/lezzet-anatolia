import 'server-only';
import { serviceDb, UserProfileService } from '@lezzet/database';
import { canAccessWarehouse, warehouseScope, type WarehouseScope } from '@lezzet/domain-core';
import { DEV_ADMIN_PROFILE_ID, type UserRole } from '@lezzet/types';
import { createClient } from './supabase/server';
import { logger } from '@lezzet/observability';

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
//
// Kimlik UYDURMA DEĞİL: seed aynı id ile gerçek bir admin profili açar (`DEV_ADMIN_PROFILE_ID`).
// Gerekli, çünkü `actor_id` gibi alanlar `user_profiles`'a FK'lidir — profilsiz sahte bir kullanıcı
// ilk durum geçişinde FK ihlali verirdi. Seed atılmamışsa aktör yazan ekranlar bu yüzden düşer.
//
// ── KİMLİK SEÇİLEBİLİR: `DEV_AUTH_BYPASS_USER_ID` (07.08, operasyon şeridinin talebi) ──────────
// Bypass her zaman ADMİN kimliği veriyordu ve bunun görünmeyen bir bedeli vardı: kurye ekranları
// hiçbir ajan tarafından DOLU hâliyle görülemiyordu. `listCourierDay(courierId)` kimliği zorunlu
// tutuyor (ve tutmalı — o imza bir güvenlik sınırı), dolayısıyla admin kimliğiyle bakan her koşu
// boş bir gün görüyordu. Ekranlar boş değildi, GÖREN yoktu — dört ekran (11.1 · 11.2 · 11.6) yalnız
// erişimsiz hâliyle doğrulanabiliyordu.
//
// **Güvenlik sınırı DEĞİŞMEDİ:** bypass zaten yalnız `NODE_ENV !== 'production'` iken çalışıyor,
// yani üretimde bu env okunsa da hiçbir şey yapmaz. Değişen tek şey, dev'de hangi profille
// bakılacağı.
//
// Verilen kimliğin GERÇEK bir profil olması gerekir (aynı gerekçe: `actor_id` FK'li). Doğrulamayı
// burada yapmıyoruz — guard'ın sıcak yoluna her istekte bir sorgu koymak, yalnız dev'de işe yarayan
// bir kolaylık için ödenecek yanlış bedel. Yanlış kimlik verilirse ekran ilk aktör yazımında düşer
// ve sebebi bellidir.
const DEV_BYPASS_USER: AuthUser = {
  id: process.env.DEV_AUTH_BYPASS_USER_ID || DEV_ADMIN_PROFILE_ID,
  email: 'dev-admin@lezzet.local',
};

let bypassWarned = false;
function devBypassActive(): boolean {
  const active = process.env.NODE_ENV !== 'production' && process.env.DEV_AUTH_BYPASS !== 'false';
  if (active && !bypassWarned) {
    bypassWarned = true;
    logger.warn({ context: 'guard' }, 'DEV auth bypass AKTİF — operasyon guard atlanıyor (kapatmak için DEV_AUTH_BYPASS=false)');
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

/**
 * Oturumdaki kişinin **müşteri kimliği** (`user_profiles.id`); oturum ya da profil yoksa null.
 *
 * **Auth kimliği ≠ müşteri kimliği.** Profil satırını auth trigger'ı açar ve kendi `id`'sini üretir;
 * auth kullanıcısının kimliği `auth_user_id` sütununda AYRI durur. `user_profiles`'a FK veren her
 * tablo (`cart`, `order`, `address`, `zone_notice`) profil kimliğini bekler — oraya auth kimliği
 * yazmak FK ihlalidir.
 *
 * Bu dönüşümün tek yerde durması bu yüzden şart: yerel bir kopya olarak yazıldığında üç ayrı çağrı
 * yeri (sepet, boş sepet önerisi, bölge haberi) çeviriyi hiç yapmadı ve giriş yapan müşterinin
 * sepeti **sessizce kayboldu** (28.07). Rol soran guard'lar tersine auth kimliğiyle çalışır
 * (`isStaff`/`hasRole` içeride `auth_user_id`'den arar) — ikisi karıştırılmamalı.
 */
export async function currentCustomerId(): Promise<string | null> {
  const user = await getSessionUser();
  if (!user) return null;
  return (await new UserProfileService(serviceDb()).findByAuthUserId(user.id))?.id ?? null;
}

/**
 * Oturumdaki müşterinin **ekranda gösterilecek künyesi** — ad ve e-posta. Yoksa null.
 *
 * `currentCustomerId`'den ayrı durur çünkü sorusu farklı: o "hangi satıra yazacağım", bu "kime
 * sesleneceğim". Sorgu aynı olduğu için maliyeti de aynı; ayrı olması çağıranın niyetini
 * okunur kılıyor. **Sırlar taşınmaz:** rol, taslak durumu, kredi limiti burada YOKTUR — bu künye
 * tarayıcıya iniyor.
 */
export interface CustomerIdentity {
  id: string;
  name: string;
  email: string | null;
}

export async function currentCustomer(): Promise<CustomerIdentity | null> {
  const user = await getSessionUser();
  if (!user) return null;
  const profile = await new UserProfileService(serviceDb()).findByAuthUserId(user.id);
  return profile ? { id: profile.id, name: profile.name ?? '', email: profile.email ?? null } : null;
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

/**
 * Personelin DEPO KAPSAMI (DOMAIN §17) — rolün ikinci ekseni: ne yapar × nerede yapar.
 *
 * `warehouseId` verilirse o depoya erişim de doğrulanır ve yetkisizse `forbidden` atar. Verilmezse
 * yalnız kapsam döner (ekran kendi seçicisini ona göre kurar).
 *
 * **Fail-closed:** kapsamsız depocu/kurye HİÇBİR depoyu göremez — boş kapsam "hepsi" değildir.
 * Karar motorda (`warehouseScope`), guard yalnız kimliği getirip motora sorar (STACK §4).
 */
export async function requireWarehouseScope(warehouseId?: string): Promise<{ user: AuthUser; scope: WarehouseScope }> {
  const user = await requireStaff();
  if (devBypassActive()) return { user, scope: { kind: 'all' } };

  const profile = await new UserProfileService(serviceDb()).findByAuthUserId(user.id);
  if (!profile) throw new AuthError('forbidden');

  const scope = warehouseScope(profile.roles, profile.warehouseIds);
  if (scope.kind === 'none') throw new AuthError('forbidden');
  if (warehouseId && !canAccessWarehouse(scope, warehouseId)) throw new AuthError('forbidden');
  return { user, scope };
}

/**
 * Verilen rollerden **en az biri** şart — "yönetici VEYA muhasebeci" gibi kapılar için.
 *
 * `requireRole`'u iki kez çağırmak yerine tek okuma: rol listesi bir kez getirilir ve ilk çağrının
 * `forbidden` fırlatması ikinciyi hiç çalıştırmazdı. Tek rollü kapılar için `requireAdmin` vb.
 * kısayolları durmaya devam eder.
 */
export async function requireAnyRole(roles: readonly UserRole[]): Promise<AuthUser> {
  if (devBypassActive()) return DEV_BYPASS_USER;
  const user = await requireAuth();
  const owned = await new UserProfileService(serviceDb()).getRoles(user.id);
  if (!roles.some((r) => owned.includes(r))) throw new AuthError('forbidden');
  return user;
}

export const requireAdmin = (): Promise<AuthUser> => requireRole('admin');
/** Yönetici ya da muhasebeci — para gözü (tedarikçi borcu, sipariş tahsilatı, hesaplar). */
export const requireFinance = (): Promise<AuthUser> => requireAnyRole(['admin', 'accounting']);
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
