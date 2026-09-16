import { NextResponse, type NextRequest } from 'next/server';
import { OauthClientService, OauthCodeService, serviceDb } from '@lezzet/database';
import { isAllowedRedirectUri } from '@lezzet/domain-core';
import { DEFAULT_LOCALE, localizedPath } from '@lezzet/i18n';
import { AuthError, requireAdmin } from '@/lib/guard';
import { randomToken, sha256hex } from '@/lib/oauth';
import type { OauthFailureDetail } from '../error/failure';

/**
 * Yetkilendirme ucu (RFC 6749 + PKCE).
 *
 * **Onay ekranı YOK ve bu bilinçli:** onayın kendisi admin girişidir — bu kapıdan geçebilen tek
 * kişi zaten sistemin sahibi. İstek hatalıysa dönüş adresine YÖNLENDİRİLMEZ: kullanıcıyı kötü bir
 * adrese sürüklemek, hatayı orada göstermekten tehlikelidir. Hata KENDİ ekranımızda çizilir
 * (`/oauth/error`) — bu uç tarayıcıda açılıyor, düz metin gövdenin okuru yok.
 */

/** Kod ömrü kısa tutulur: tarayıcıdan sunucuya tek sıçrama için yeter, çalınırsa pencere dardır. */
const CODE_TTL_MS = 60_000;

/**
 * Vekil arkasında `nextUrl.origin` İÇ adresi (`localhost:3000`) verir ve connector'dan gelen
 * kullanıcı oraya savrulurdu; gerçek origin forwarded başlıklarından kurulur (`auth/callback` deseni).
 */
function publicOrigin(request: NextRequest): string {
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? request.nextUrl.host;
  const proto = request.headers.get('x-forwarded-proto') ?? request.nextUrl.protocol.replace(':', '');
  return `${proto}://${host}`;
}

function failure(request: NextRequest, reason: 'not_admin' | 'invalid_request', detail?: OauthFailureDetail): Response {
  const suffix = detail ? `&detail=${detail}` : '';
  return NextResponse.redirect(`${publicOrigin(request)}/oauth/error?reason=${reason}${suffix}`);
}

export async function GET(request: NextRequest): Promise<Response> {
  const p = request.nextUrl.searchParams;
  const clientId = p.get('client_id');
  const redirectUri = p.get('redirect_uri');
  const codeChallenge = p.get('code_challenge');
  const state = p.get('state');

  if (p.get('response_type') !== 'code') return failure(request, 'invalid_request', 'response_type');
  if (p.get('code_challenge_method') !== 'S256') return failure(request, 'invalid_request', 'pkce');
  if (!codeChallenge) return failure(request, 'invalid_request', 'code_challenge');
  if (!clientId) return failure(request, 'invalid_request', 'client_id');
  if (!redirectUri || !isAllowedRedirectUri(redirectUri)) return failure(request, 'invalid_request', 'redirect_uri');

  const db = serviceDb();
  const client = await new OauthClientService(db).findByClientId(clientId);
  if (!client) return failure(request, 'invalid_request', 'unknown_client');
  if (!client.redirectUris.includes(redirectUri)) return failure(request, 'invalid_request', 'redirect_not_registered');

  let adminProfileId: string;
  try {
    adminProfileId = (await requireAdmin()).profileId;
  } catch (err) {
    // Yetki dışı hata YUTULMAZ: veritabanı düşmesini "yetkiniz yok" diye göstermek, arızayı
    // kullanıcının hesabına yıkar ve kimse aramaz.
    if (!(err instanceof AuthError)) throw err;
    // Oturum yoksa girişe gönderip buraya geri getiriyoruz; yetkisi olmayan kullanıcı için girişi
    // tekrarlamanın faydası yok — o dal hata ekranında biter.
    if (err.code === 'auth_required') {
      const login = `${localizedPath('/login', DEFAULT_LOCALE)}?next=${encodeURIComponent(request.nextUrl.pathname + request.nextUrl.search)}`;
      return NextResponse.redirect(`${publicOrigin(request)}/${DEFAULT_LOCALE}${login}`);
    }
    return failure(request, 'not_admin');
  }

  const code = randomToken(32);
  await new OauthCodeService(db).insert({
    codeHash: sha256hex(code),
    clientId,
    redirectUri,
    codeChallenge,
    adminProfileId,
    expiresAt: new Date(Date.now() + CODE_TTL_MS).toISOString(),
  });

  const back = new URL(redirectUri);
  back.searchParams.set('code', code);
  if (state) back.searchParams.set('state', state);
  return NextResponse.redirect(back);
}
