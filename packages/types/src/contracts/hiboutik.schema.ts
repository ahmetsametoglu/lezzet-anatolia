import { z } from 'zod';

/**
 * Hiboutik API'sinin ölçülen cevap biçimi (docs/feature/kasa-muhasebe.md §6); tutar ve KDV oranı ondalık dize gelir, cent'e ve yüzdeye
 * istemci çevirir. Açık satışta `completed_at` boş tarih, `unique_sale_id` boş dizedir.
 */

const decimal = z.union([z.string(), z.number()]);

export const HiboutikCreatedProductSchema = z.object({ product_id: z.number().int() });
export const HiboutikCreatedSaleSchema = z.object({ sale_id: z.number().int() });
export const HiboutikCreatedLineSchema = z.object({ id_sale_product_detail: z.number().int() });
export const HiboutikCreatedPaymentSchema = z.object({ payment_detail_id: z.number().int() });
export const HiboutikCreatedTillMoveSchema = z.object({ till_id: z.number().int() });

export const HiboutikTaxListSchema = z.array(
  z.object({ tax_id: z.number().int(), tax_value: decimal, tax_enabled: z.number().optional() }),
);

export const HiboutikProductListSchema = z.array(z.object({ product_id: z.number().int() }));
export const HiboutikSaleIdListSchema = z.array(z.object({ sale_id: z.number().int() }));
export const HiboutikTillMoveListSchema = z.array(
  z.object({
    till_id: z.number().int(),
    comments: z.string().nullish(),
    date_till: z.string(),
    deposit: decimal,
    withdrawal: decimal,
  }),
);

/** Gün sonu: oran başına KDV dahil toplam ve ödeme türü başına, satış kimliğiyle ödemeler. */
export const HiboutikDayTaxListSchema = z.array(z.object({ tax_value: decimal, total_incl_taxes: decimal }));
export const HiboutikDayPaymentListSchema = z.array(
  z.object({ payment_type: z.string(), payments: z.array(z.object({ sale_id: z.number().int(), amount: decimal })) }),
);
/** Kapanmamış günde `closure_date` boş tarihtir. */
export const HiboutikDayClosureSchema = z.object({ closure_date: z.string() });

/** Ödeme satırları ve bakiye yalnız bölünmüş (`DIV`) satışta gelir, taze açılan satış henüz `DIV` değildir; şema yalnız tüketilen alanı ister. */
export const HiboutikSaleSchema = z.object({
  sale_id: z.number().int(),
  store_id: z.number().int(),
  sale_ext_ref: z.string().nullish(),
  unique_sale_id: z.string().nullish(),
  completed_at: z.string(),
  url_receipt: z.string().nullish(),
  line_items: z
    .array(
      z.object({
        line_item_id: z.number().int(),
        product_id: z.number().int(),
        quantity: z.number(),
        product_price: decimal,
        vat: decimal,
      }),
    )
    .default([]),
  payment_details: z
    .array(z.object({ payment_detail_id: z.number().int(), payment_type: z.string(), payment_amount: decimal }))
    .default([]),
});
export type HiboutikSale = z.output<typeof HiboutikSaleSchema>;

/** Satış okuması tek elemanlı dizi döner. */
export const HiboutikSaleReadSchema = z.array(HiboutikSaleSchema).length(1);
