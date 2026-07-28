import 'server-only';
import { serviceDb, UserProfileService } from '@lezzet/database';
import { postLoginTarget } from './post-login-target';

/**
 * Giriş sonrası hedef (iki yüzey kuralı): personel → Operasyon, müşteri → geldiği yer (`next`).
 * Auth kullanıcısını Customer'a bağlama DB trigger'ında yapılır (handle_new_auth_user); burada
 * yalnız "personel mi" sorusu sorulur, karar `postLoginTarget`'ta.
 */
export async function resolvePostLoginRedirect(userId: string, next?: string | null): Promise<string> {
  return postLoginTarget(await new UserProfileService(serviceDb()).isStaff(userId), next);
}
