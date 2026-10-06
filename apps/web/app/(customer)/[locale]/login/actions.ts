'use server';

import { resolvePostLoginRedirect } from '@/lib/auth/redirect';
import { customerErrorKey, type CustomerResult } from '@/lib/customer-error';
import { getSessionUser } from '@/lib/guard';

/** Google dönüşü kodu öbür istekte çevirirken giriş sayfası oturumu bununla yoklar; oturum yoksa `data` boştur ve bu bir hata değildir. */
export async function resumeOAuthLoginAction(next: string | null): Promise<CustomerResult<{ redirect: string }>> {
  try {
    const user = await getSessionUser();
    if (!user) return { data: null, errorKey: null };
    return { data: { redirect: await resolvePostLoginRedirect(user.id, next) }, errorKey: null };
  } catch (err) {
    return { data: null, errorKey: customerErrorKey(err) };
  }
}
