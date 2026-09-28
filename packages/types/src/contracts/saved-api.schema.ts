import { z } from 'zod';
import { MeCartViewLineSchema } from './cart-api.schema';

/** Hesaptaki "Sonraya kaydedilenler" kartı: kalemler sepet satırının şekliyle, bölge haberi kayıtları posta koduyla. */
export const MeSavedViewSchema = z.object({
  saved: z.array(MeCartViewLineSchema),
  zoneNotices: z.array(z.object({ postalCode: z.string() })),
});
export type MeSavedView = z.infer<typeof MeSavedViewSchema>;

/** Sepete geri alınacak satırların adresi; adet listedeki kaydın kendisidir, istemci yazmaz. */
export const MeSavedRestoreBodySchema = z.object({
  lines: z
    .array(
      z.discriminatedUnion('kind', [
        z.object({ kind: z.literal('variant'), variantId: z.string().uuid(), stockId: z.string().uuid().nullable() }),
        z.object({ kind: z.literal('bundle'), bundleId: z.string().uuid() }),
      ]),
    )
    .min(1),
});
