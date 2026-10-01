import type { Context, MiddlewareHandler, Next } from 'hono';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import type { AppEnv } from '../../context';
import { anonDb, serviceDb, UserProfileService } from '@lezzet/database';
import type { UserProfile, UserRole } from '@lezzet/types';
import { fail } from '../../lib/respond';

/**
 * `/api/v1` bağlam tipi — kök `AppEnv`'den TÜRER (reqId taşımaya devam eder) ve doğrulanmış
 * kullanıcıyı ekler. Tip burada tanımlı olmak zorunda: Hono `c.set/get`'i tipe bağlıyor, yani
 * `authUser`'ı koymayı unutan bir uç derlenmez — sözleşmenin yeri kimliği üreten dosyadır
 * (apps/backend `request-log.ts` ile aynı gerekçe).
 */
export interface V1Env {
  Variables: AppEnv['Variables'] & { authUser: User };
}

/**
 * `Bearer` başlığından ham token; iki çağıranın kararı farklı (`bearerAuth` 401 verir, `optionalCustomerId` ziyaretçiye düşer)
 * ama ayrıştırma tek yerde durur ki önek ve boşluk iki biçimde ele alınmasın. Dışa verilmez, dışarısı çözülmüş kimlikle konuşur.
 */
function bearerTokenOf(header: string | undefined): string | undefined {
  if (!header?.startsWith('Bearer ')) return undefined;
  const token = header.slice('Bearer '.length).trim();
  return token.length > 0 ? token : undefined;
}

/**
 * Cihazdaki oturumun access token'ı Supabase Auth'ta en az yetkiyle (anon istemci) doğrulanır ve kullanıcı bağlama konur. Eksik ve
 * geçersiz token aynı `401`i alır, çünkü ayrım çağırana bir şey kazandırmaz, saldırgana kazandırır.
 */
export async function bearerAuth(c: Context<V1Env>, next: Next): Promise<Response | void> {
  const token = bearerTokenOf(c.req.header('authorization'));
  if (!token) return fail(c, 'unauthorized', 401);

  const { data, error } = await anonDb().auth.getUser(token);
  if (error || !data.user) return fail(c, 'unauthorized', 401);

  c.set('authUser', data.user);
  await next();
}

/**
 * Açık uçların isteğe bağlı kimlik zinciri (`Bearer` → auth kullanıcısı → müşteri profili): başlık yoksa, token geçersizse ya da
 * profil satırı yoksa ziyaretçiye düşer, çünkü 401 süresi dolmuş token'lı müşteriye vitrin yerine hata gösterirdi. Auth kimliği
 * müşteri kimliği değildir; zincir fiyat ve keşif uçlarının ortak kaynağı olarak tek yerde durur.
 */
export async function optionalCustomerId(db: SupabaseClient, authorization: string | undefined): Promise<string | null> {
  const token = bearerTokenOf(authorization);
  if (!token) return null;

  const { data, error } = await anonDb().auth.getUser(token);
  if (error || !data.user) return null;

  const profile = await new UserProfileService(db).findByAuthUserId(data.user.id);
  return profile?.id ?? null;
}

/**
 * Personel bölümlerinin bağlamı doğrulanmış kullanıcının profil satırını taşır, çünkü kapıların istediği yabancı anahtarlar
 * (`courier_id`, `actor_id`) profile bakar ve auth kimliği hiçbir satırla eşleşmeden hatasız boş liste döndürürdü.
 */
export interface StaffEnv {
  Variables: V1Env['Variables'] & { staff: UserProfile };
}

/**
 * `bearerAuth`tan sonra koşar ve yetkiyle kimliği aynı profil satırından tek okumada çözer; rolsüz ve profilsiz kullanıcı aynı `403`ü
 * alır. Yönetici rolü kapıyı açar ama kimliği değiştirmez: kurye kapıları yine yalnız o kişinin siparişlerini döndürür.
 */
export function requireStaffRole(...roles: readonly UserRole[]): MiddlewareHandler<StaffEnv> {
  return async (c, next) => {
    const profile = await new UserProfileService(serviceDb()).findByAuthUserId(c.get('authUser').id);
    if (!profile) return fail(c, 'forbidden', 403);
    if (!roles.some((role) => profile.roles.includes(role))) return fail(c, 'forbidden', 403);

    c.set('staff', profile);
    await next();
  };
}
