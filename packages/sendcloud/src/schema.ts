import { z } from 'zod';

/**
 * Sendcloud v3 cevaplarının şeması — **TOLERANSLI, çünkü dış dünya bizim sözleşmemiz değil.**
 *
 * İki tolerans kararı ve ikisi de ölçümden geliyor:
 *
 * 1. **Boolish alanlar.** `signature`/`tracked`/`eco_delivery` taşıyıcıya göre bazen `true`, bazen
 *    `"yes"` dizesi geliyor. Katı `z.boolean()` bütün teklifi düşürürdü — bir alanın biçimi
 *    yüzünden fiyat listesini kaybetmek, hiç sormamaktan kötü.
 * 2. **`last_mile` dize olarak alınıyor**, enum olarak değil. Sendcloud yeni bir teslim türü
 *    eklediğinde parse kırılmamalı; bilinmeyen değer UI'da "bilinmiyor"a düşer (`CLAUDE §1`).
 *
 * `.passthrough()` YOK ve bilinçli: tanımadığımız alanı taşımak, onu bir yerde okumaya
 * kalkışacağımız anlamına gelir. Ne kullanıyorsak o yazılı.
 */

/** Sendcloud'un tutarsız boolean'ı — bool, dize ya da sayı gelebilir. */
const Boolish = z.union([z.boolean(), z.string(), z.number()]).nullish();

/** Kesin `true` mu — UI ve süzgeçler bunu sorar. */
export function truthy(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return ['true', 'yes', '1'].includes(value.toLowerCase().trim());
  if (typeof value === 'number') return value !== 0;
  return false;
}

/** Bilinen son-adım kümesi. Dışındaki değer `null`'a düşer — "bilinmiyor". */
export const LAST_MILE = ['home_delivery', 'service_point', 'mailbox', 'locker', 'locker_or_service_point'] as const;
export type LastMile = (typeof LAST_MILE)[number];

export function toLastMile(raw: unknown): LastMile | null {
  return typeof raw === 'string' && (LAST_MILE as readonly string[]).includes(raw) ? (raw as LastMile) : null;
}

const MoneySchema = z.object({ value: z.string(), currency: z.string() });

export const ShippingOptionSchema = z.object({
  code: z.string(),
  name: z.string().nullish(),
  carrier: z.object({ code: z.string(), name: z.string().nullish() }),
  functionalities: z
    .object({
      last_mile: z.string().nullish(),
      delivery_deadline: z.string().nullish(),
      signature: Boolish,
      tracked: Boolish,
      eco_delivery: Boolish,
      /**
       * **ÇOK KOLİ DESTEĞİ — canlı ölçümün en pahalı bulgusu (28.08).** 17 seçeneğin yalnız
       * 10'unda var; Mondial Relay'in HİÇBİRİNDE yok ve en ucuz üç seçeneğin ikisi o. Çok kutulu
       * sipariş bu alanla SÜZÜLMEZSE müşteri en ucuzu seçer, etiket satın alma anında sağlayıcı
       * reddeder ve sipariş sevk edilemez hâlde kalır.
       */
      multicollo: Boolish,
    })
    .nullish(),
  quotes: z
    .array(
      z.object({
        lead_time: z.number().nullish(),
        price: z.object({ total: MoneySchema }).nullish(),
      }),
    )
    .nullish(),
});

export const ShippingOptionsResponseSchema = z.object({ data: z.array(ShippingOptionSchema).nullish() });

const ParcelSchema = z.object({
  id: z.union([z.string(), z.number()]).nullish(),
  tracking_number: z.string().nullish(),
  tracking_url: z.string().nullish(),
  /** Etiket base64 — tek koli senkron duyuruda gelir. */
  label_file: z.string().nullish(),
  documents: z
    .array(z.object({ type: z.string().nullish(), document_type: z.string().nullish(), link: z.string().nullish() }))
    .nullish(),
  status: z.object({ code: z.string().nullish(), message: z.string().nullish() }).nullish(),
});

/** Liste ucu — öksüz gönderi nöbetinin okuması. Tek gönderi şemasının dar hâli. */
export const ShipmentListResponseSchema = z.object({
  data: z
    .array(
      z.object({
        id: z.union([z.string(), z.number()]).nullish(),
        external_reference_id: z.string().nullish(),
        parcels: z.array(z.object({ id: z.union([z.string(), z.number()]).nullish() })).nullish(),
      }),
    )
    .nullish(),
});

export const ShipmentResponseSchema = z.object({
  data: z.object({
    id: z.union([z.string(), z.number()]).nullish(),
    carrier: z.object({ code: z.string().nullish(), name: z.string().nullish() }).nullish(),
    parcels: z.array(ParcelSchema),
    /** 201 + `errors[]` = taşıyıcı tarafı YUMUŞAK hata; etiket yine alınmış olabilir. */
    errors: z.array(z.object({ title: z.string().nullish(), detail: z.string().nullish() })).nullish(),
  }),
});

