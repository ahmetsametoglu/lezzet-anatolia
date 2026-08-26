import { z } from 'zod';

// MCP kapısının kimlik ve iz şemaları (22.4) — `supabase/migrations/0051_mcp.sql` karşılığı.
//
// İki tablo, iki farklı soru: `McpConnectionKey` "kim bağlanabilir ve neye dokunabilir",
// `McpCallLog` "ne oldu". Ayrı tutulmalarının sebebi ömürlerinin farklı olması — anahtar
// operatörün yönettiği bir kayıt, iz süpürülen bir gözlem verisidir (OBSERVABILITY §4.2).

/**
 * Araç ailesi — KADEMELİ: `propose`, `read`i kapsar.
 *
 * İki değer yeter çünkü araç takımının ayrımı adlandırmada zaten yazılı: `propose_*` ile başlayan
 * araçlar onay kuyruğuna satır yazar, kalanları yalnız okur. Üçüncü bir aile (referans projedeki
 * "medya") bizde karşılıksızdır — uydurulmuş kapsam, seçildiğinde ne olduğu bilinmeyen bir
 * seçenektir.
 */
export const McpScopeEnum = z.enum(['read', 'propose']);
export type McpScope = z.infer<typeof McpScopeEnum>;

export const McpConnectionKeySchema = z.object({
  id: z.string().uuid(),
  /** Operatörün anahtarı tanıdığı ad — anahtarın kendisi bir daha görünmez, listede ayıran budur. */
  label: z.string(),
  /** SHA-256 (hex). Düz metin hiçbir yerde saklanmaz; üretim anında BİR KEZ gösterilir. */
  tokenHash: z.string(),
  scope: McpScopeEnum,
  createdBy: z.string().uuid().nullable(),
  createdAt: z.string(),
  expiresAt: z.string(),
  /** Dolu = iptal edilmiş. Satır silinmez — çağrı geçmişi sahipsiz kalmasın. */
  revokedAt: z.string().nullable(),
  /** `null` = HİÇ kullanılmadı ("0 gün önce" değil — CLAUDE.md §1 ölçülemeyen değer kuralı). */
  lastUsedAt: z.string().nullable(),
});
export type McpConnectionKey = z.infer<typeof McpConnectionKeySchema>;

export const McpConnectionKeyInsertSchema = z.object({
  label: z.string().min(1),
  tokenHash: z.string().min(1),
  scope: McpScopeEnum.optional(),
  createdBy: z.string().uuid().nullish(),
  expiresAt: z.string(),
});
export type McpConnectionKeyInsert = z.infer<typeof McpConnectionKeyInsertSchema>;

export const McpConnectionKeyUpdateSchema = McpConnectionKeySchema.partial().required({ id: true });
export type McpConnectionKeyUpdate = z.infer<typeof McpConnectionKeyUpdateSchema>;

export const McpCallLogSchema = z.object({
  id: z.string().uuid(),
  connectionKeyId: z.string().uuid().nullable(),
  tool: z.string(),
  ok: z.boolean(),
  durationMs: z.number().int().nonnegative(),
  /** Süzülmüş hata mesajı (`scrubMessage`). Araç ARGÜMANI hiçbir hâlde yazılmaz. */
  error: z.string().nullable(),
  createdAt: z.string(),
});
export type McpCallLog = z.infer<typeof McpCallLogSchema>;

export const McpCallLogInsertSchema = z.object({
  connectionKeyId: z.string().uuid().nullish(),
  tool: z.string().min(1),
  ok: z.boolean(),
  durationMs: z.number().int().nonnegative(),
  error: z.string().nullish(),
});
export type McpCallLogInsert = z.infer<typeof McpCallLogInsertSchema>;

export const McpCallLogUpdateSchema = McpCallLogSchema.partial().required({ id: true });
export type McpCallLogUpdate = z.infer<typeof McpCallLogUpdateSchema>;
