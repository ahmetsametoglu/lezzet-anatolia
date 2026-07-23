import { NextResponse } from 'next/server';
import { DEFAULT_LOCALE } from '@lezzet/i18n';
import { createClient } from '@/lib/supabase/server';
import { resolvePostLoginRedirect } from '@/lib/auth/redirect';
import { getPathname } from '@/i18n/navigation';

// Google (OAuth) dönüş noktası: kodu oturuma çevirir, müşteriyi bağlar, role göre yönlendirir.
// Not: proxy arkasında (Caddy) request.url origin'i yanlış olur; gerçek origin forwarded
// header'lardan kurulur (referans deseni).
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? url.host;
  const proto = request.headers.get('x-forwarded-proto') ?? url.protocol.replace(':', '');
  const origin = `${proto}://${host}`;

  const code = url.searchParams.get('code');
  const next = url.searchParams.get('next');

  // OAuth hata dönüşü — yerelleştirilmiş girişe (locale bilinmiyor → varsayılan fr: /fr/connexion).
  const loginErrorUrl = `${origin}${getPathname({ locale: DEFAULT_LOCALE, href: '/login' })}?error=oauth`;

  if (!code) {
    return NextResponse.redirect(loginErrorUrl);
  }

  const supabase = await createClient();
  const { error: exchangeErr } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeErr) {
    return NextResponse.redirect(loginErrorUrl);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(loginErrorUrl);
  }

  const target = await resolvePostLoginRedirect(user.id, next);
  return NextResponse.redirect(`${origin}${target}`);
}
