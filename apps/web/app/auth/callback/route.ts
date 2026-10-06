import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { DEFAULT_LOCALE } from '@lezzet/i18n';
import { captureError, logger, SOURCES } from '@lezzet/observability';
import { createClient } from '@/lib/supabase/server';
import { resolvePostLoginRedirect } from '@/lib/auth/redirect';
import { handOffInvitesToCustomer } from '@/lib/identity/invite-handoff';
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
  const loginUrl = `${origin}${getPathname({ locale: DEFAULT_LOCALE, href: '/login' })}`;
  const loginErrorUrl = `${loginUrl}?error=oauth`;

  if (!code) {
    return NextResponse.redirect(loginErrorUrl);
  }

  const supabase = await createClient();
  // Doğrulama çerezini giriş başlarken tarayıcı yazar, kodu ilk çeviren istek siler.
  const hadVerifier = (await cookies()).getAll().some((cookie) => cookie.name.endsWith('-auth-token-code-verifier'));
  const { error: exchangeErr } = await supabase.auth.exchangeCodeForSession(code);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Kurulu PWA varken Android, tarayıcı sekmesi kodu çevirdikten sonra aynı dönüş adresini uygulamada bir kez daha açar; o istek
  // doğrulama çerezini değil ilk çevirmenin oturumunu taşır, yani giriş tamamdır.
  const alreadyExchanged = exchangeErr !== null && !hadVerifier && user !== null;
  // Aynı istek ilk çevirmenin cevabından önce de gelebilir: kod tükenmiştir ama oturum henüz tarayıcıya yazılmamıştır. Giriş birkaç
  // an içinde tamamlanacağı için giriş sayfası hatayı göstermeden önce oturumu bekler.
  const pendingElsewhere = exchangeErr?.code === 'flow_state_not_found' && hadVerifier && user === null;
  if (pendingElsewhere) {
    logger.info({ flow: 'auth/callback' }, 'Google dönüşü: kod öbür istekte çevriliyor, giriş sayfası oturumu bekleyecek');
    return NextResponse.redirect(`${loginUrl}?error=oauth_pending${next ? `&next=${encodeURIComponent(next)}` : ''}`);
  }
  if (!user || (exchangeErr && !alreadyExchanged)) {
    await captureError(new Error(`Google dönüşü oturum açamadı: ${exchangeErr?.message ?? 'kullanıcı okunamadı'}`), {
      source: SOURCES.webServer,
      context: { flow: 'auth/callback', hadVerifier, sessionPresent: user !== null },
    });
    return NextResponse.redirect(loginErrorUrl);
  }
  if (alreadyExchanged) logger.info({ authUserId: user.id }, 'Google dönüşü: kod ilk istekte çevrilmiş, açık oturumla devam');

  // Davet bağı Google yolunda da OTP ile aynı kapıdan kurulur, çünkü davetlinin en olası yolu telefonda açık Google hesabıdır; davet
  // çerezi bağ kurulsun ya da kurulmasın tüketilir.
  await handOffInvitesToCustomer(user.id);

  const target = await resolvePostLoginRedirect(user.id, next);
  return NextResponse.redirect(`${origin}${target}`);
}
