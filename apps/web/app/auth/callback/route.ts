import { NextResponse } from 'next/server';
import { DEFAULT_LOCALE } from '@lezzet/i18n';
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

  /**
   * **Davet bağı Google yolunda da kurulur** (17.11 — mobil şeridin 11.08 notu).
   *
   * 17.9 bağı OTP akışının içine koymuştu ve o cümle yalnız OTP için doğruydu: bu rota Supabase'e
   * doğrudan gidiyor, profili `0002` trigger'ı açıyor ve kodu soran hiçbir çağrı yoktu. Davet
   * bağlantısına tıklayıp *"Google ile devam et"* diyen davetli sessizce bağsız kalıyordu — en
   * olası yol da buydu (telefonda oturumu açık Google hesabı).
   *
   * Kural OTP ile AYNI kapıdan geçiyor (`tryAttachReferral` → `attachReferralOnLogin`), yani iki
   * yüzey iki ayrı "yeni müşteri" tanımı taşımıyor. Kod tüketilir: bağ kurulsun ya da kurulmasın
   * çerez düşer — tüketilmiş bir davet tarayıcıda otuz gün daha durup sonraki hiçbir işe yaramaz.
   */
  await handOffInvitesToCustomer(user.id);

  const target = await resolvePostLoginRedirect(user.id, next);
  return NextResponse.redirect(`${origin}${target}`);
}
