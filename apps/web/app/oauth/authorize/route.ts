import { NextResponse, type NextRequest } from 'next/server';
import { OauthClientService, OauthCodeService, serviceDb } from '@lezzet/database';
import { isAllowedRedirectUri } from '@lezzet/domain-core';
import { DEFAULT_LOCALE, localizedPath } from '@lezzet/i18n';
import { AuthError, requireAdmin } from '@/lib/guard';
import { randomToken, sha256hex } from '@/lib/oauth';

/**
 * Yetkilendirme ucu (RFC 6749 + PKCE).
 *
 * **Onay ekranı YOK ve bu bilinçli:** onayın kendisi admin girişidir — bu kapıdan geçebilen tek
 * kişi zaten sistemin sahibi. İstek parametreleri hatalıysa dönüş adresine YÖNLENDİRİLMEZ, 400
 * döner: kullanıcıyı kötü bir adrese sürüklemek, hatayı orada göstermekten tehlikelidir.
 */

/** Kod ömrü kısa tutulur: tarayıcıdan sunucuya tek sıçrama için yeter, çalınırsa pencere dardır. */
const CODE_TTL_MS = 60_000;

const badRequest = (message: string): Response => new Response(message, { status: 400 });

export async function GET(request: NextRequest): Promise<Response> {
  const p = request.nextUrl.searchParams;
  const clientId = p.get('client_id');
  const redirectUri = p.get('redirect_uri');
  const codeChallenge = p.get('code_challenge');
  const state = p.get('state');

  if (p.get('response_type') !== 'code') return badRequest('response_type=code zorunlu');
  if (p.get('code_challenge_method') !== 'S256') return badRequest('PKCE zorunlu (code_challenge_method=S256)');
  if (!codeChallenge) return badRequest('code_challenge zorunlu');
  if (!clientId) return badRequest('client_id zorunlu');
  if (!redirectUri || !isAllowedRedirectUri(redirectUri)) return badRequest('İzin verilmeyen redirect_uri');

  const db = serviceDb();
  const client = await new OauthClientService(db).findByClientId(clientId);
  if (!client) return badRequest('client_id tanınmadı');
  if (!client.redirectUris.includes(redirectUri)) return badRequest('redirect_uri bu istemcide kayıtlı değil');

  let adminProfileId: string;
  try {
    adminProfileId = (await requireAdmin()).profileId;
  } catch (err) {
    // Oturum yoksa girişe gönderip buraya geri getiriyoruz; personel olmayan kullanıcı ise
    // girişi tekrarlamanın faydası yok, cevabı düz metin.
    if (err instanceof AuthError && err.code === 'auth_required') {
      const login = `${localizedPath('/login', DEFAULT_LOCALE)}?next=${encodeURIComponent(request.nextUrl.pathname + request.nextUrl.search)}`;
      return NextResponse.redirect(new URL(`/${DEFAULT_LOCALE}${login}`, request.nextUrl.origin));
    }
    return new Response('Bu bağlantıyı yalnız yönetici kurabilir.', { status: 403 });
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
