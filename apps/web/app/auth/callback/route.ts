import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resolvePostLoginRedirect } from '@/lib/auth/redirect';

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

  if (!code) {
    return NextResponse.redirect(`${origin}/connexion?error=oauth`);
  }

  const supabase = await createClient();
  const { error: exchangeErr } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeErr) {
    return NextResponse.redirect(`${origin}/connexion?error=oauth`);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(`${origin}/connexion?error=oauth`);
  }

  const target = await resolvePostLoginRedirect(user.id, next);
  return NextResponse.redirect(`${origin}${target}`);
}
