import { z } from 'zod';
import { LocalizedTextSchema } from '../primitives/localized-text.schema';

/**
 * AI asistanının ONAY KUYRUĞU (22.3) — `0042_assistant_proposal.sql`.
 * Kurgu: `docs/architecture/AI_ADMIN_ASSISTANT.md §5`.
 *
 * **`payload` bir KOMUT değil DİLEKÇEDİR.** Asistan "şu tabloya şunu yaz" demez; "şu paketi şu
 * kalemlerle kur" der ve uygulama onaydan sonra NORMAL servis/motor yolundan koşar. Bu yüzden
 * payload şemaları hedef tablonun kolonlarını değil, **var olan servis kapılarının girdisini**
 * taklit eder — kuyruk ikinci bir yazma yolu açmaz.
 *
 * **Şema kind başına ayrı ve TEK YERDE** (`PROPOSAL_PAYLOAD_SCHEMAS`): üç yüzey (öneriyi YAZAN
 * MCP aracı, GÖSTEREN panel, UYGULAYAN kapı) aynı sözlükten okur. Ayrı ayrı yazılsalardı biri
 * gevşer ve panelde görünen ile uygulanan ayrışırdı — onay ekranının tek vaadi tam olarak budur.
 */

export const AssistantProposalKindEnum = z.enum([
  'bundle_draft',
  'featured_flag',
  'discount_draft',
  'purchase_order',
  'stock_intake',
  'money_movement',
  'zone_extend',
  'product_draft',
  'recipe_draft',
]);
export type AssistantProposalKind = z.infer<typeof AssistantProposalKindEnum>;

export const AssistantProposalStatusEnum = z.enum(['pending', 'applied', 'rejected', 'expired', 'failed']);
export type AssistantProposalStatus = z.infer<typeof AssistantProposalStatusEnum>;

// ─── Payload şemaları — bugün UYGULANABİLEN üç tip ────────────────────────────
//
// Enum dokuz tip taşıyor (ileriye hazır, `0042` künyesi) ama şeması yalnız uygulayıcısı yazılmış
// olanların var. Şemasız tip için öneri HİÇ DOĞMAZ: yazıp uygulayamamak, panelde onaylanan ama
// hiçbir şey yapmayan bir kalem üretirdi — "çizip yazmamak"ın kuyruk hâli.

/** Vitrin işareti — en küçük yazma: tek boolean, tek kayıt. */
export const FeaturedFlagPayloadSchema = z.object({
  target: z.enum(['category', 'collection', 'bundle']),
  id: z.string().uuid(),
  isFeatured: z.boolean(),
  /**
   * Kaydın ADI — yalnız ÖNİZLEME içindir, uygulama bunu kullanmaz (kimlikten yeniden çözer).
   * Saklanması bilinçli: kayıt sonradan yeniden adlandırılırsa geçmişte "neyi onaylamıştım"
   * sorusunun cevabı o günkü ad olmalı.
   */
  name: z.string().min(1),
});

/** Tedarik siparişi taslağı — eşik-altı sinyalinden; hedef depo ZORUNLU (varsayılan depo yoktur). */
export const PurchaseOrderPayloadSchema = z.object({
  warehouseId: z.string().uuid(),
  supplierId: z.string().uuid().nullable(),
  supplierName: z.string().nullable(),
  lines: z
    .array(
      z.object({
        variantId: z.string().uuid(),
        productName: z.string().min(1),
        qty: z.number().int().positive(),
      }),
    )
    .min(1),
  note: z.string().optional(),
});

/** Paket taslağı — paylar `domain-core`'un mutabakat kuralından geçer (servis kapısında). */
export const BundleDraftPayloadSchema = z.object({
  name: LocalizedTextSchema,
  description: LocalizedTextSchema.nullable().optional(),
  /** Paketin TEK fiyatı (euro, `Bundle.totalPrice` ile aynı birim — paket ailesi henüz cent'e göçmedi). */
  totalPrice: z.number().positive(),
  serves: z.number().int().positive().nullable().optional(),
  items: z
    .array(
      z.object({
        variantId: z.string().uuid(),
        productName: z.string().min(1),
        qty: z.number().int().positive(),
        /** Kaleme atanan birim fiyat (euro). Toplamı paket fiyatını tutmalı — kural motorda. */
        allocatedUnitPrice: z.number().nonnegative(),
      }),
    )
    .min(2),
});

/** Kind → payload şeması. Uygulayıcısı olmayan tip burada YOKTUR (yukarıdaki gerekçe). */
export const PROPOSAL_PAYLOAD_SCHEMAS = {
  featured_flag: FeaturedFlagPayloadSchema,
  purchase_order: PurchaseOrderPayloadSchema,
  bundle_draft: BundleDraftPayloadSchema,
} as const satisfies Partial<Record<AssistantProposalKind, z.ZodTypeAny>>;

/** Bugün öneri ÜRETİLEBİLEN tipler — MCP araçları ve panel bu listeden türer. */
export type SupportedProposalKind = keyof typeof PROPOSAL_PAYLOAD_SCHEMAS;

export type FeaturedFlagPayload = z.infer<typeof FeaturedFlagPayloadSchema>;
export type PurchaseOrderPayload = z.infer<typeof PurchaseOrderPayloadSchema>;
export type BundleDraftPayload = z.infer<typeof BundleDraftPayloadSchema>;

/**
 * Ham payload'ı kind'ına göre doğrular. Desteklenmeyen tip **sessizce geçmez**: kuyruğa şekli
 * bilinmeyen bir dilekçe girerse onay ekranı onu çizemez ve uygulayıcı da anlamaz.
 */
export function parseProposalPayload(kind: AssistantProposalKind, raw: unknown) {
  const schema = (PROPOSAL_PAYLOAD_SCHEMAS as Record<string, z.ZodTypeAny | undefined>)[kind];
  if (!schema) throw new Error(`[assistant] '${kind}' tipi için payload şeması yok — bu tip henüz uygulanamıyor.`);
  return schema.parse(raw);
}

export const AssistantProposalSchema = z.object({
  id: z.string().uuid(),
  kind: AssistantProposalKindEnum,
  /** Öneriyi üreten sohbet/oturum etiketi — denetim izi (üretim turunda FK olur). */
  sourceSession: z.string().nullable(),
  /** Şekli `kind`'a göre değişir; `parseProposalPayload` ile çözülür. */
  payload: z.unknown(),
  /** Patronun okuyacağı TEK cümle — panel bunu gösterir, JSON'u değil. */
  summary: z.string(),
  status: AssistantProposalStatusEnum,
  expiresAt: z.string(),
  createdAt: z.string(),
  decidedBy: z.string().uuid().nullable(),
  decidedAt: z.string().nullable(),
  decidedNote: z.string().nullable(),
  appliedAt: z.string().nullable(),
  /** Uygulamanın doğurduğu kayıtların kimlikleri (`{"bundleId": "..."}`). */
  result: z.unknown().nullable(),
  error: z.string().nullable(),
});
export type AssistantProposal = z.infer<typeof AssistantProposalSchema>;

export const AssistantProposalInsertSchema = AssistantProposalSchema.pick({
  kind: true,
  payload: true,
  summary: true,
}).extend({
  sourceSession: z.string().nullish(),
  expiresAt: z.string(),
});
export type AssistantProposalInsert = z.infer<typeof AssistantProposalInsertSchema>;

export const AssistantProposalUpdateSchema = AssistantProposalSchema.partial().required({ id: true });
export type AssistantProposalUpdate = z.infer<typeof AssistantProposalUpdateSchema>;
