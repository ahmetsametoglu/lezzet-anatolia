import 'server-only';
import { serviceDb, StaffRoleService } from '@lezzet/database';

/**
 * Açık yönlendirme (open redirect) koruması: yalnız site-içi mutlak yol kabul edilir.
 * `//host` ve `http…` gibi dış hedefler reddedilir; varsayılan '/'.
 */
function safeNext(next: string | null | undefined): string {
  if (!next) return '/';
  if (!next.startsWith('/') || next.startsWith('//')) return '/';
  return next;
}

/**
 * Giriş sonrası hedef (iki yüzey kuralı): `staff_role` varsa → Operasyon, yoksa müşteri →
 * geldiği yer (`next`). Auth kullanıcısını Customer'a bağlama DB trigger'ında yapılır
 * (handle_new_auth_user); burada yalnız yönlendirme kararı kalır.
 */
export async function resolvePostLoginRedirect(userId: string, next?: string | null): Promise<string> {
  const staffRoles = await new StaffRoleService(serviceDb()).getRoles(userId);
  if (staffRoles.length > 0) return '/operations';
  return safeNext(next);
}
