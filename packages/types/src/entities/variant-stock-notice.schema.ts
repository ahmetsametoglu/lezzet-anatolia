import { z } from 'zod';
import { CountryEnum } from '../primitives/enums.schema';

/**
 * Varyant + yer bazlı stok bildirimi (19.12) — `variant_stock_notice`.
 *
 * **`ZoneNotice` ile karıştırılmaz, iki farklı sözdür:**
 * - `zone_notice` → "bölgenize henüz gelmiyoruz" (rota hiç yok)
 * - bu tablo → "bölgenize geliyoruz ama BU ÜRÜN burada şu an yok"
 *
 * İkincisi vitrinin dördüncü stok hâlidir (`elsewhere`, 19.10): ürün ağda var ama müşterinin
 * yerine ulaşamıyor — soğuk zincir olduğu için kargoya da verilemiyor.
 *
 * **Anahtar depo DEĞİL, yer.** Müşteriye verilen söz kendi adresi hakkındadır: bir bölgeyi ileride
 * başka depoya bağlarsak söz ayakta kalmalı. Depo anahtarlı kayıt o gün sessizce yanlış listeye
 * düşerdi — ve "müşteri depoyu hiç görmez" kuralı veride de korunur.
 */
export const VariantStockNoticeSchema = z.object({
  id: z.string().uuid(),
  variantId: z.string().uuid(),
  country: CountryEnum,
  postalCode: z.string(),
  email: z.string(),
  customerId: z.string().uuid().nullable(),
  createdAt: z.string(),
  /** Haber gönderildiğinde damgalanır — **tek hatırlatma** sözü bununla tutulur. */
  notifiedAt: z.string().nullable(),
});

export type VariantStockNotice = z.infer<typeof VariantStockNoticeSchema>;

export const VariantStockNoticeInsertSchema = VariantStockNoticeSchema.omit({
  id: true,
  createdAt: true,
}).partial({ customerId: true, notifiedAt: true });

export type VariantStockNoticeInsert = z.infer<typeof VariantStockNoticeInsertSchema>;

/** Yalnız "haber verildi" damgası güncellenir — kaydın kendisi değişmez. */
export const VariantStockNoticeUpdateSchema = VariantStockNoticeSchema.pick({ id: true, notifiedAt: true });

export type VariantStockNoticeUpdate = z.infer<typeof VariantStockNoticeUpdateSchema>;
