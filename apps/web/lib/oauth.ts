import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { siteOrigin } from '@lezzet/i18n';

/**
 * MCP OAuth — YETKİLENDİRME SUNUCUSU yardımcıları (`docs/architecture/INTEGRATIONS.md`).
 *
 * Yetkilendirme sunucusu web, çünkü admin oturumu burada yaşıyor; korunan kaynak backend'in `/mcp`
 * ucu. İkisi aynı alan adında olduğu için oturum çerezi sorunu doğmuyor. Akışın sonunda üretilen
 * erişim jetonu bir `mcp_connection_key` satırıdır — kapı değişmez, anahtar yalnız başka yoldan doğar.
 */

/** Yetkilendirme sunucusunun kökü (issuer) — sitenin kendi adresi. */
export const issuer = (): string => siteOrigin();

/** Korunan kaynağın kanonik adresi; Caddy bu yolu backend'e veriyor. */
export const mcpResourceUri = (): string => `${siteOrigin()}/mcp`;

export const sha256hex = (input: string): string => createHash('sha256').update(input).digest('hex');

/** PKCE S256: doğrulayıcının özeti, yetkilendirmede bırakılan soruyla aynı mı. */
export function verifyPkceS256(codeVerifier: string, codeChallenge: string): boolean {
  return createHash('sha256').update(codeVerifier).digest('base64url') === codeChallenge;
}

/** URL-güvenli rastgele değer — kod, istemci kimliği ve erişim jetonu aynı üreteçten. */
export const randomToken = (bytes = 32): string => randomBytes(bytes).toString('base64url');

/** RFC 8414 — istemci uçları buradan keşfeder, elle yapılandırma istenmez. */
export function authServerMetadata(): Record<string, unknown> {
  const origin = issuer();
  return {
    issuer: origin,
    authorization_endpoint: `${origin}/oauth/authorize`,
    token_endpoint: `${origin}/oauth/token`,
    registration_endpoint: `${origin}/oauth/register`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
    scopes_supported: ['mcp'],
  };
}

/** RFC 9728 — korunan kaynağın hangi yetkilendirme sunucusuna baktığı. */
export function protectedResourceMetadata(): Record<string, unknown> {
  return { resource: mcpResourceUri(), authorization_servers: [issuer()] };
}
