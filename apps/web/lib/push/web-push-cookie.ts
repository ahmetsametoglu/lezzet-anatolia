import 'server-only';
import { cookies } from 'next/headers';

/** Çıkış bu tarayıcının aboneliğini silebilsin diye kaydın adresi burada tutulur; çıkış eylemini beş ayrı yer çağırıyor. */
const COOKIE = 'lz_web_push';
const MAX_AGE_SEC = 60 * 60 * 24 * 365;

export async function rememberWebPushEndpoint(endpoint: string): Promise<void> {
  (await cookies()).set(COOKIE, endpoint, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: MAX_AGE_SEC,
  });
}

export async function readWebPushEndpoint(): Promise<string | null> {
  return (await cookies()).get(COOKIE)?.value ?? null;
}

export async function forgetWebPushEndpoint(): Promise<void> {
  (await cookies()).delete(COOKIE);
}
