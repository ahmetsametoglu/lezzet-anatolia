import 'server-only';
import { cookies } from 'next/headers';

/*
  Gel-al seçimi (adres seçicideki depo kartı) çerezde yaşar. Adres seçimi "varsayılan adres" olarak sunucuda durur; depo bir
  adres değildir ve profile yazılmaz — bir oturumun alışverişine ait tercihtir (native'deki seçim deposuyla aynı ömür).
  Kimlik olduğu gibi kullanılmaz: okuyan taraf onu teklif kapısından geçirir (`readPickupOffer`), geçemeyen seçim düşer.
*/
const COOKIE = 'lezzet.pickup.v1';
const UUID = /^[0-9a-f-]{36}$/i;

export async function readPickupCookie(): Promise<string | null> {
  const raw = (await cookies()).get(COOKIE)?.value ?? null;
  return raw !== null && UUID.test(raw) ? raw : null;
}

export async function writePickupCookie(warehouseId: string | null): Promise<void> {
  const store = await cookies();
  if (warehouseId === null) {
    store.delete(COOKIE);
    return;
  }
  store.set(COOKIE, warehouseId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
}
