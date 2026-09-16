import { NextResponse, type NextRequest } from 'next/server';
import { OauthClientService, serviceDb } from '@lezzet/database';
import { isAllowedRedirectUri } from '@lezzet/domain-core';
import { randomToken } from '@/lib/oauth';

/**
 * Dinamik istemci kaydı (RFC 7591) — connector ekranında kullanıcı hiçbir alan doldurmaz.
 *
 * Uç herkese AÇIK ve bu güvenlik açığı değil: kayıt olan yalnız bir `client_id` alır; jetona giden
 * yol `/authorize`tan geçer ve orada admin girişi aranır. Gizli anahtar üretilmez (tarayıcıdaki
 * istemci sırrı saklayamaz), korumayı PKCE ile dönüş adresi beyaz listesi verir.
 */
export async function POST(request: NextRequest): Promise<Response> {
  let body: { redirect_uris?: unknown; client_name?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'invalid_client_metadata', error_description: 'Geçersiz JSON' }, { status: 400 });
  }

  const redirectUris = Array.isArray(body.redirect_uris) ? body.redirect_uris.filter((u): u is string => typeof u === 'string') : [];
  if (redirectUris.length === 0) {
    return NextResponse.json({ error: 'invalid_redirect_uri', error_description: 'redirect_uris zorunlu' }, { status: 400 });
  }
  const rejected = redirectUris.find((uri) => !isAllowedRedirectUri(uri));
  if (rejected) {
    return NextResponse.json({ error: 'invalid_redirect_uri', error_description: `İzin verilmeyen adres: ${rejected}` }, { status: 400 });
  }

  const clientId = randomToken(16);
  await new OauthClientService(serviceDb()).insert({
    clientId,
    clientName: typeof body.client_name === 'string' ? body.client_name : null,
    redirectUris,
  });

  return NextResponse.json(
    {
      client_id: clientId,
      redirect_uris: redirectUris,
      grant_types: ['authorization_code'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
    },
    { status: 201, headers: { 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' } },
  );
}

export function OPTIONS(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'content-type',
    },
  });
}
