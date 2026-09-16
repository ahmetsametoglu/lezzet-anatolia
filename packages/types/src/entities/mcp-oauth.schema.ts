import { z } from 'zod';

// MCP OAuth akışının iki kaydı (`supabase/migrations/0057_mcp_oauth.sql`). Erişim jetonu burada
// DEĞİL: akış bittiğinde jeton bir `mcp_connection_key` satırı olarak doğar (`mcp.schema.ts`).

export const OauthClientSchema = z.object({
  id: z.string().uuid(),
  clientId: z.string(),
  clientName: z.string().nullable(),
  redirectUris: z.array(z.string()),
  createdAt: z.string(),
});
export type OauthClient = z.infer<typeof OauthClientSchema>;

export const OauthClientInsertSchema = z.object({
  clientId: z.string().min(1),
  clientName: z.string().nullish(),
  redirectUris: z.array(z.string().url()).min(1),
});
export type OauthClientInsert = z.infer<typeof OauthClientInsertSchema>;

export const OauthClientUpdateSchema = OauthClientSchema.partial().required({ id: true });
export type OauthClientUpdate = z.infer<typeof OauthClientUpdateSchema>;

export const OauthCodeSchema = z.object({
  id: z.string().uuid(),
  /** SHA-256 (hex) — kodun kendisi yalnız tarayıcıya döner, hiçbir yerde saklanmaz. */
  codeHash: z.string(),
  clientId: z.string(),
  redirectUri: z.string(),
  codeChallenge: z.string(),
  adminProfileId: z.string().uuid(),
  expiresAt: z.string(),
  /** Dolu = kullanılmış; ikinci deneme reddedilir ve satır kanıt olarak kalır. */
  usedAt: z.string().nullable(),
  createdAt: z.string(),
});
export type OauthCode = z.infer<typeof OauthCodeSchema>;

export const OauthCodeInsertSchema = z.object({
  codeHash: z.string().min(1),
  clientId: z.string().min(1),
  redirectUri: z.string().url(),
  codeChallenge: z.string().min(1),
  adminProfileId: z.string().uuid(),
  expiresAt: z.string(),
});
export type OauthCodeInsert = z.infer<typeof OauthCodeInsertSchema>;

export const OauthCodeUpdateSchema = OauthCodeSchema.partial().required({ id: true });
export type OauthCodeUpdate = z.infer<typeof OauthCodeUpdateSchema>;
