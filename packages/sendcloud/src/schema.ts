import { z } from 'zod';

/**
 * Sendcloud v3 cevaplarının şeması, toleranslı: boolean alanlar taşıyıcıya göre `true` ya da `"yes"` gelir ve `last_mile` enum değil
 * dizedir, yoksa tek bir alanın biçimi bütün teklifi düşürürdü. Kullanmadığımız alan taşınmaz (`passthrough` yok).
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

/** Bilinen nokta türleri (`general_shop_type`). Dışındaki değer `null`'a düşer; servis eşlemesi bilinmeyen türü hiçbir türe saymaz. */
const SERVICE_POINT_KIND = ['servicepoint', 'locker', 'post_office'] as const;
export type ServicePointKind = (typeof SERVICE_POINT_KIND)[number];

export function toServicePointKind(raw: unknown): ServicePointKind | null {
  return typeof raw === 'string' && (SERVICE_POINT_KIND as readonly string[]).includes(raw) ? (raw as ServicePointKind) : null;
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
       * Çok koli desteği. Mondial Relay seçeneklerinin hiçbirinde yok; çok kutulu sipariş bununla süzülmezse sağlayıcı etiketi
       * satın alma anında reddeder ve sipariş sevk edilemez kalır.
       */
      multicollo: Boolish,
      /** Etiketsiz (QR) gönderi: etiket kolinin teslim edildiği noktada basılır. Depo etiket bastığı için etiketli ikizi öne alınır. */
      labelless: Boolish,
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


/** Teslim noktası ucunun satırı (`servicepoints.sendcloud.sc/api/v2`). Koordinat dize gelir. */
export const ServicePointSchema = z.object({
  id: z.union([z.string(), z.number()]),
  carrier: z.string(),
  name: z.string().nullish(),
  street: z.string().nullish(),
  house_number: z.string().nullish(),
  postal_code: z.string().nullish(),
  city: z.string().nullish(),
  country: z.string(),
  latitude: z.union([z.string(), z.number()]).nullish(),
  longitude: z.union([z.string(), z.number()]).nullish(),
  distance: z.number().nullish(),
  is_active: Boolish,
  general_shop_type: z.string().nullish(),
  formatted_opening_times: z.record(z.array(z.string())).nullish(),
});

export const ServicePointListSchema = z.array(ServicePointSchema);
