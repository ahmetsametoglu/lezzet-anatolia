import { NextResponse, type NextRequest } from 'next/server';
import { McpConnectionKeyService, OauthCodeService, serviceDb } from '@lezzet/database';
import { randomToken, sha256hex, verifyPkceS256 } from '@/lib/oauth';

/**
 * Jeton ucu — kodu erişim jetonuna çevirir.
 *
 * **Üretilen jeton yeni bir `mcp_connection_key` satırıdır:** MCP kapısı bu satırı zaten
 * doğruluyor, yani OAuth kapıya hiçbir şey eklemiyor; yalnız anahtarı panel yerine tarayıcı akışı
 * üretiyor. Böylece jeton da panelden iptal edilebilir ve çağrı izinde kimliğiyle görünür.
 *
 * Yenileme jetonu YOK (kullanıcı kararı): süre dolunca connector ekranından bir kez daha giriş
 * yapılır. Saklanacak ikinci bir sır olmaması, çalınan jetonun ömrünü de doksan günle sınırlar.
 */

/** Jeton ömrü — kullanıcı kararı. */
const ACCESS_TTL_DAYS = 90;
const ACCESS_TTL_S = ACCESS_TTL_DAYS * 24 * 3600;

const oauthError = (error: string, description: string): Response =>
  NextResponse.json({ error, error_description: description }, { status: 400, headers: { 'Cache-Control': 'no-store' } });

export async function POST(request: NextRequest): Promise<Response> {
  const form = await request.formData();
  const grantType = String(form.get('grant_type') ?? '');
  const code = String(form.get('code') ?? '');
  const codeVerifier = String(form.get('code_verifier') ?? '');
  const redirectUri = String(form.get('redirect_uri') ?? '');
  const clientId = String(form.get('client_id') ?? '');

  if (grantType !== 'authorization_code') return oauthError('unsupported_grant_type', "Yalnız 'authorization_code' desteklenir");
  if (!code || !codeVerifier) return oauthError('invalid_request', 'code ve code_verifier zorunlu');

  const db = serviceDb();
  const codes = new OauthCodeService(db);
  const record = await codes.findByCodeHash(sha256hex(code));

  if (!record) return oauthError('invalid_grant', 'Kod geçersiz');
  if (record.usedAt) return oauthError('invalid_grant', 'Kod zaten kullanıldı');
  if (Date.parse(record.expiresAt) <= Date.now()) return oauthError('invalid_grant', 'Kodun süresi doldu');
  if (clientId && record.clientId !== clientId) return oauthError('invalid_grant', 'client_id uyuşmuyor');
  if (redirectUri && record.redirectUri !== redirectUri) return oauthError('invalid_grant', 'redirect_uri uyuşmuyor');
  if (!verifyPkceS256(codeVerifier, record.codeChallenge)) return oauthError('invalid_grant', 'PKCE doğrulaması başarısız');

  // Kod ÖNCE tüketilir: aynı kodla ikinci bir jeton üretimi burada kesilir (yarış dâhil).
  if (!(await codes.markUsed(record.id))) return oauthError('invalid_grant', 'Kod zaten kullanıldı');

  const accessToken = randomToken(32);
  await new McpConnectionKeyService(db).insert({
    label: 'OAuth connector',
    tokenHash: sha256hex(accessToken),
    scope: 'propose',
    createdBy: record.adminProfileId,
    expiresAt: new Date(Date.now() + ACCESS_TTL_S * 1000).toISOString(),
  });

  return NextResponse.json(
    { access_token: accessToken, token_type: 'Bearer', expires_in: ACCESS_TTL_S, scope: 'mcp' },
    { headers: { 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' } },
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
