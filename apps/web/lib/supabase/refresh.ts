import { createServerClient, type CookieOptions } from '@supabase/ssr';
import type { NextRequest, NextResponse } from 'next/server';

type CookieToSet = { name: string; value: string; options: CookieOptions };

/**
 * Ara katmanda oturum tazeleme (desen: `~/dev/petitcigogne/src/proxy.ts`).
 *
 * **Neden ŞART.** Erişim jetonu bir saatte doluyor (`config.toml → jwt_expiry`) ve yenileme jetonu
 * her kullanımda döndürülüyor (`enable_refresh_token_rotation`). Jeton dolduğunda ilk `getUser()`
 * çağrısı yenilemeyi tetikler ve **yeni çerezleri yazması gerekir**. Bu çağrı bir Server
 * Component'ten (sayfa render'ı) geliyorsa `cookies().set()` çalışmaz — bizim sunucu istemcimiz o
 * hatayı yutuyor. Sonuç sessiz ve yıkıcı: sunucu tazelenmiş oturumu belleğinde tutar, TARAYICI ise
 * eski yenileme jetonuyla kalır; o jeton döndürüldüğü için artık geçersizdir. Bir sonraki istekte
 * oturum tamamen düşer.
 *
 * Müşterinin gördüğü şey buydu: bir saat önce giriş yapmış olmasına rağmen checkout ondan yeniden
 * kod istiyordu (28.07). Çıkış yapmamıştı — oturumu sessizce çürümüştü.
 *
 * Ara katman çerez YAZABİLEN tek yer olduğu için tazeleme buraya taşındı. `getUser()` çağrısı
 * sonucu için değil, **yenilemeyi tetiklemek** için yapılır (Supabase SSR dokümanı). Yetki kararı
 * burada verilmez — personel rolü service-role ile okunuyor ve o anahtar kenar paketine girmemeli
 * (bkz. `middleware.ts`).
 *
 * Tazelenen çerezler İKİ yere birden yazılır: `request.cookies` (bu isteğin devamı — sayfa
 * render'ı taze jetonu görsün) ve dönen yanıt (tarayıcı saklasın). Yalnız birine yazmak, ya bu
 * isteğin eski jetonla çalışmasına ya da tarayıcının hiç öğrenmemesine yol açar.
 */
export async function refreshSession(request: NextRequest): Promise<(response: NextResponse) => NextResponse> {
  const pending: CookieToSet[] = [];

  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        for (const { name, value, options } of cookiesToSet) {
          request.cookies.set(name, value);
          pending.push({ name, value, options });
        }
      },
    },
  });

  // Sonuç KULLANILMAZ: amaç jeton döndürmeyi tetiklemek. Ağ hatası akışı kesmemeli — oturum
  // tazelenemediyse sayfa yine çalışır, yalnız müşteri girişsiz görünür.
  try {
    await supabase.auth.getUser();
  } catch {
    // Sessiz: auth sunucusuna ulaşılamaması bir sayfa hatası değildir.
  }

  return (response: NextResponse) => {
    for (const { name, value, options } of pending) response.cookies.set(name, value, options);
    return response;
  };
}
