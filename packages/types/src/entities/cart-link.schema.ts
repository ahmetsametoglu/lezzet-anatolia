import { z } from 'zod';

/**
 * Sepet bağlantısı (15.21) — sohbette kurulan sepeti siteye TAŞIYAN jeton. `0055` künyesi:
 * `wa_link_token`ın ters yönü; sohbetin bağlantısıdır (müşterinin değil), tek kullanımlık, süreli.
 *
 * Jetonun kendisi hiçbir yüzeye geri okutulmaz; buradaki tip service-role yolunun tipidir.
 */
export const CartLinkSchema = z.object({
  id: z.string().uuid(),
  /** 12 hane okunabilir alfabe, BÜYÜK harf — üretim de arama da bu biçimde. */
  token: z.string().length(12),
  conversationId: z.string().uuid(),
  expiresAt: z.string(),
  /** Tek kullanım damgası; `null` = henüz açılmadı. */
  claimedAt: z.string().nullable(),
  /** Bağlantıyı açıp giriş yapan kişi (birleşme sonrası HEDEF hesap). Hesap silinince `null`. */
  claimedBy: z.string().uuid().nullable(),
  createdAt: z.string(),
});
export type CartLink = z.infer<typeof CartLinkSchema>;

export const CartLinkInsertSchema = CartLinkSchema.pick({ token: true, conversationId: true, expiresAt: true });
export type CartLinkInsert = z.infer<typeof CartLinkInsertSchema>;

export const CartLinkUpdateSchema = CartLinkSchema.pick({ id: true }).extend(
  CartLinkSchema.pick({ expiresAt: true, claimedAt: true, claimedBy: true }).partial().shape,
);
export type CartLinkUpdate = z.infer<typeof CartLinkUpdateSchema>;
