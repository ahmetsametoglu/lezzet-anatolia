import { SendcloudError, classify } from './errors';
import {
  ShipmentListResponseSchema,
  ShipmentResponseSchema,
  ShippingOptionsResponseSchema,
  toLastMile,
  truthy,
  type LastMile,
} from './schema';

/**
 * Sendcloud API v3 istemcisi.
 *
 * ── RESMÎ SDK YOK, REST var (ölçüldü 28.08) ─────────────────────────────────
 * Sendcloud dil bazlı istemci yayımlamıyor. npm'deki `sendcloud`/`sendcloud-client` paketleri
 * **başka bir servise** (`sendcloud.sohu.com`, Çin e-posta servisi) ait ve 9 yıldır güncellenmiyor
 * — yanlış paket kurma tuzağı. Bu dosya o yüzden var.
 *
 * ── v2 KAPALI ───────────────────────────────────────────────────────────────
 * v2 Nisan 2026'da bakım moduna girdi ve yeni kullanıcıya kapalı. Tek yol v3.
 *
 * ── GRAM ve MİLİMETRE — dönüşüm YOK ─────────────────────────────────────────
 * API `weight.unit = "g"` ve `dimensions.unit = "mm"` kabul ediyor (canlı ölçüm 28.08, HTTP 200).
 * Sakladığımız tam sayılar doğrudan tele giriyor. Referans projenin kilogramı ondalıkla taşırken
 * yaşadığı kayan nokta artefaktı (`3 × 0,35 = 1.0499999999999998`, `toFixed(3)` yaması) bizde
 * hiç doğmuyor — çünkü hiç ondalık yok.
 */

const DEFAULT_BASE = 'https://panel.sendcloud.sc';

export interface SendcloudConfig {
  publicKey: string;
  secretKey: string;
  baseUrl?: string;
  /** Test için enjekte edilir — sahte sağlayıcı ağa çıkmaz. */
  fetchImpl?: typeof fetch;
}

export interface ParcelSpec {
  /** Tam sayı gram. */
  weightG: number;
  /** Tam sayı milimetre. */
  lengthMm: number;
  widthMm: number;
  heightMm: number;
}

export interface AddressSpec {
  countryCode: string;
  postalCode: string;
  city?: string;
  name?: string;
  addressLine1?: string;
  houseNumber?: string;
  addressLine2?: string;
  email?: string;
  phone?: string;
}

export interface ShippingQuote {
  code: string;
  carrierCode: string;
  carrierName: string;
  name: string;
  priceCents: number | null;
  currency: string;
  leadTimeHours: number | null;
  lastMile: LastMile | null;
  signature: boolean;
  tracked: boolean;
  ecoDelivery: boolean;
  /** Çok koli destekliyor mu — çok kutulu siparişte ZORUNLU süzgeç (canlı ölçüm: 17'nin 10'u). */
  multicollo: boolean;
}

export interface AnnouncedParcel {
  providerParcelRef: string;
  trackingNumber: string;
  trackingUrl: string | null;
  /** Etiket PDF'i (base64 çözülmüş). Yoksa `null` — belge bağlantısından ayrıca indirilir. */
  labelPdf: Buffer | null;
}

export interface AnnouncedShipment {
  providerShipmentId: string;
  carrierCode: string;
  carrierName: string;
  parcels: AnnouncedParcel[];
  /** 201 döndüğü hâlde gelen taşıyıcı uyarıları — etiket alınmış olabilir, kayda geçer. */
  warnings: string[];
}

const auth = (c: SendcloudConfig): string => `Basic ${Buffer.from(`${c.publicKey}:${c.secretKey}`).toString('base64')}`;

/**
 * Tek atış istek — zaman aşımı + iptal.
 *
 * ⚠ **POST'ta YENİDEN DENEME YOK.** Sendcloud'da idempotency anahtarı yok (dokümanda hiç
 * anılmıyor, 28.08 taraması) — 5xx ya da ağ hatasında POST'u tekrarlamak **ikinci koli açar** ve
 * o gerçek paradır. GET güvenli: sonucu değiştirmez, üç kez denenir.
 */
async function once(config: SendcloudConfig, path: string, init: RequestInit & { timeoutMs: number }): Promise<Response> {
  const f = config.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), init.timeoutMs);
  try {
    return await f(`${config.baseUrl ?? DEFAULT_BASE}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        Authorization: auth(config),
        Accept: 'application/json',
        ...(init.body != null ? { 'Content-Type': 'application/json' } : {}),
        ...init.headers,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new SendcloudError({
      code: 'network',
      message: /abort/i.test(message) ? `Sendcloud isteği zaman aşımına uğradı (${init.timeoutMs} ms)` : `Sendcloud'a ulaşılamadı: ${message}`,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function request(config: SendcloudConfig, path: string, init: RequestInit & { timeoutMs: number }): Promise<unknown> {
  if (!config.publicKey || !config.secretKey) {
    throw new SendcloudError({ code: 'credentials', message: 'Sendcloud anahtarları tanımlı değil (SENDCLOUD_PUBLIC_KEY / SENDCLOUD_SECRET_KEY).' });
  }
  const method = (init.method ?? 'GET').toUpperCase();
  const attempts = method === 'GET' ? 3 : 1;
  let last: unknown;

  for (let i = 1; i <= attempts; i++) {
    let res: Response;
    try {
      res = await once(config, path, init);
    } catch (err) {
      last = err;
      if (i < attempts) {
        await sleep(i * 1000);
        continue;
      }
      throw err;
    }
    if (res.status >= 500 && i < attempts) {
      last = new SendcloudError({ code: 'provider', message: `Sendcloud sunucu hatası (${res.status})` });
      await sleep(i * 1000);
      continue;
    }
    if (!res.ok) throw new SendcloudError(classify(res.status, await readBody(res)));
    return res.json();
  }
  throw last instanceof Error ? last : new SendcloudError({ code: 'provider', message: 'Sendcloud isteği başarısız' });
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function readBody(res: Response): Promise<unknown> {
  const text = await res.text().catch(() => '');
  try {
    return JSON.parse(text);
  } catch {
    return text || null;
  }
}

const addressBody = (a: AddressSpec): Record<string, unknown> => ({
  country_code: a.countryCode,
  postal_code: a.postalCode,
  ...(a.city ? { city: a.city } : {}),
  ...(a.name ? { name: a.name } : {}),
  ...(a.addressLine1 ? { address_line_1: a.addressLine1 } : {}),
  ...(a.houseNumber ? { house_number: a.houseNumber } : {}),
  ...(a.addressLine2 ? { address_line_2: a.addressLine2 } : {}),
  ...(a.email ? { email: a.email } : {}),
  ...(a.phone ? { phone_number: a.phone } : {}),
});

const parcelBody = (p: ParcelSpec): Record<string, unknown> => ({
  weight: { value: String(Math.round(p.weightG)), unit: 'g' },
  dimensions: {
    length: String(Math.round(p.lengthMm)),
    width: String(Math.round(p.widthMm)),
    height: String(Math.round(p.heightMm)),
    unit: 'mm',
  },
});

/**
 * **Teklif** — `POST /shipping-options` + `calculate_quotes`. Hiçbir şey yaratmaz, para harcamaz.
 *
 * Koliler dizi olarak gidiyor: çok kutulu sipariş TEK teklif çağrısında sorulur ve dönen fiyat
 * gönderinin tamamınındır. Referans proje temsilî tek koli için sorup fiyatı koli sayısıyla
 * ÇARPIYORDU — bizim kolilerimiz farklı boylarda olabildiği için o çarpım yanlış cevap verirdi.
 */
export async function fetchShippingQuotes(
  config: SendcloudConfig,
  args: { from: AddressSpec; to: AddressSpec; parcels: readonly ParcelSpec[] },
): Promise<ShippingQuote[]> {
  const json = await request(config, '/api/v3/shipping-options', {
    method: 'POST',
    timeoutMs: 8_000,
    body: JSON.stringify({
      from_address: addressBody(args.from),
      to_address: addressBody(args.to),
      parcels: args.parcels.map(parcelBody),
      calculate_quotes: true,
    }),
  });

  const parsed = ShippingOptionsResponseSchema.safeParse(json);
  if (!parsed.success) {
    throw new SendcloudError({ code: 'parse', message: 'Sendcloud teklif cevabı beklenen şekilde değil', detail: parsed.error.issues });
  }

  return (parsed.data.data ?? []).flatMap((opt) => {
    const total = opt.quotes?.[0]?.price?.total;
    const price = total ? Number(total.value) : null;
    const fn = opt.functionalities ?? {};
    return [
      {
        code: opt.code,
        carrierCode: opt.carrier.code,
        carrierName: opt.carrier.name ?? opt.carrier.code,
        name: opt.name ?? opt.code,
        // Cent'e YUVARLAMA burada: para hesabı tam sayı cent üzerinden yürür (`STACK §8`).
        priceCents: price !== null && Number.isFinite(price) ? Math.round(price * 100) : null,
        currency: total?.currency ?? 'EUR',
        leadTimeHours: opt.quotes?.[0]?.lead_time ?? null,
        lastMile: toLastMile(fn.last_mile),
        signature: truthy(fn.signature),
        tracked: truthy(fn.tracked),
        ecoDelivery: truthy(fn.eco_delivery),
        multicollo: truthy(fn.multicollo),
      },
    ];
  });
}

/**
 * **Gönderi duyur + etiket al** — `POST /api/v3/shipments/announce`. GERÇEK PARA HARCAR.
 *
 * Çok koli (multicollo) tek çağrıda: her koli kendi ağırlığı ve ölçüsüyle dizide, her biri kendi
 * takip numarasını alıyor. **Senkron çağrıda en fazla 15 koli** (doküman) — çağıran bunu
 * denetlemek zorunda; burada da savunmacı bir kapı var.
 */
export async function announceShipment(
  config: SendcloudConfig,
  args: {
    externalReferenceId: string;
    orderNumber?: string;
    reference?: string;
    from: AddressSpec;
    to: AddressSpec;
    parcels: readonly ParcelSpec[];
    shippingOptionCode: string;
    servicePointId?: string;
  },
): Promise<AnnouncedShipment> {
  if (args.parcels.length === 0) throw new SendcloudError({ code: 'validation', message: 'Gönderi kolisiz duyurulamaz.' });
  if (args.parcels.length > MAX_PARCELS_PER_SHIPMENT) {
    throw new SendcloudError({
      code: 'validation',
      message: `Tek gönderide en fazla ${MAX_PARCELS_PER_SHIPMENT} koli duyurulabilir (${args.parcels.length} verildi).`,
    });
  }

  const json = await request(config, '/api/v3/shipments/announce', {
    method: 'POST',
    timeoutMs: 20_000,
    body: JSON.stringify({
      external_reference_id: args.externalReferenceId,
      ...(args.orderNumber ? { order_number: args.orderNumber } : {}),
      ...(args.reference ? { reference: args.reference } : {}),
      from_address: addressBody(args.from),
      to_address: addressBody(args.to),
      ship_with: { type: 'shipping_option_code', properties: { shipping_option_code: args.shippingOptionCode } },
      ...(args.servicePointId ? { to_service_point: { id: args.servicePointId } } : {}),
      label_details: { mime_type: 'application/pdf' },
      parcels: args.parcels.map(parcelBody),
    }),
  });

  const parsed = ShipmentResponseSchema.safeParse(json);
  if (!parsed.success) {
    throw new SendcloudError({ code: 'parse', message: 'Sendcloud gönderi cevabı beklenen şekilde değil', detail: parsed.error.issues });
  }
  const data = parsed.data.data;
  const warnings = (data.errors ?? []).map((e) => e.detail ?? e.title ?? 'bilinmeyen uyarı');

  const parcels = data.parcels.map((p) => {
    if (!p.tracking_number) {
      throw new SendcloudError({
        code: 'validation',
        message: 'Sendcloud koliyi takip numarasız açtı — gönderi izlenemez.',
        detail: { warnings, parcel: p },
      });
    }
    return {
      providerParcelRef: String(p.id ?? ''),
      trackingNumber: p.tracking_number,
      trackingUrl: p.tracking_url ?? null,
      labelPdf: p.label_file ? Buffer.from(p.label_file, 'base64') : null,
    };
  });

  return {
    providerShipmentId: String(data.id ?? parcels[0]?.providerParcelRef ?? ''),
    carrierCode: data.carrier?.code ?? 'unknown',
    carrierName: data.carrier?.name ?? data.carrier?.code ?? 'unknown',
    parcels,
    warnings,
  };
}

/** Senkron duyuruda koli tavanı (doküman 28.08). Aşan sepet ikinci bir gönderi ister. */
export const MAX_PARCELS_PER_SHIPMENT = 15;

/**
 * **Gönderiyi iptal et.** 404 = zaten yok (başarı sayılır), 409 = koli yolda/teslim (reddedilir).
 * İkisini ayırmak önemli: birinde yapacak bir şey yok, ötekinde operatöre haber verilmeli.
 */
export async function cancelShipment(config: SendcloudConfig, providerShipmentId: string): Promise<void> {
  const res = await once(config, `/api/v3/shipments/${encodeURIComponent(providerShipmentId)}/cancel`, {
    method: 'POST',
    timeoutMs: 8_000,
  });
  if (res.ok || res.status === 404) return;
  throw new SendcloudError(classify(res.status, await readBody(res)));
}

/** Bir kolinin sağlayıcıdaki güncel hâli. `code` null = sağlayıcı durum vermedi. */
export interface ParcelStatus {
  /** Sağlayıcının KOLİ kimliği — `order_box.provider_parcel_ref` ile eşleşir. */
  parcelId: string | null;
  trackingNumber: string | null;
  code: string | null;
  message: string | null;
}

/**
 * **Gönderinin GERÇEK durumu — KOLİ KOLİ** — `GET /api/v3/shipments/{id}`.
 *
 * Webhook yalnız "değişti" tetikleyicisidir; durum buradan okunur (tek taksonomi, "Option B").
 * Gerekçe tasarım kaydında: webhook gövdesinin şeması belgeli değil ve yanlış eşlenen bir durum
 * siparişi yanlış yere taşır.
 *
 * **Dizi dönüyor, tek durum değil — ve bu bir düzeltmedir.** İlk yazım `parcels[0]`ı okuyordu;
 * çok kolili (multicollo) gönderide birinci koli teslim olup ötekiler yoldayken sipariş TESLİM
 * sayılırdı. Gönderi, en gerideki kolisi kadar ilerlemiştir (`aggregateShipmentStatus`) —
 * o kararı verebilmek için kolilerin hepsi lazım.
 */
export async function fetchShipmentParcels(config: SendcloudConfig, providerShipmentId: string): Promise<ParcelStatus[]> {
  const json = await request(config, `/api/v3/shipments/${encodeURIComponent(providerShipmentId)}`, {
    method: 'GET',
    timeoutMs: 10_000,
  });

  const parsed = ShipmentResponseSchema.safeParse(json);
  if (!parsed.success) {
    throw new SendcloudError({ code: 'parse', message: 'Sendcloud gönderi durumu beklenen şekilde değil', detail: parsed.error.issues });
  }

  return parsed.data.data.parcels.map((p) => ({
    parcelId: p.id == null ? null : String(p.id),
    trackingNumber: p.tracking_number ?? null,
    code: p.status?.code ?? null,
    message: p.status?.message ?? null,
  }));
}

/** Sağlayıcıdaki bir gönderinin kimlik yüzü — öksüz nöbetinin karşılaştırdığı tek şey. */
export interface RemoteShipment {
  providerShipmentId: string;
  /** Duyuruda BİZİM yazdığımız kimlik (`shipment.id`). Boşsa bizden çıkmamış demektir. */
  externalReferenceId: string | null;
  parcelIds: string[];
}

/**
 * **Sağlayıcıdaki gönderiler** — `GET /api/v3/shipments`, öksüz gönderi nöbetinin girdisi.
 *
 * Sayfalama **`Link` başlığından imleçle** yürüyor (doküman + canlı ölçüm 28.08: gövdede `meta`
 * YOK, yalnız `data`). `maxPages` bir emniyet freni: aşıldığında `truncated: true` döner ve
 * çağıran bunu SÖYLER — sessizce kesilen bir tarama, "hiç öksüz yok" diye okunurdu.
 */
export async function listShipments(
  config: SendcloudConfig,
  args: { announcedAfter?: Date; pageSize?: number; maxPages?: number } = {},
): Promise<{ shipments: RemoteShipment[]; truncated: boolean }> {
  const maxPages = args.maxPages ?? 10;
  const query = new URLSearchParams({ page_size: String(Math.min(args.pageSize ?? 100, 100)) });
  if (args.announcedAfter) query.set('announced_after', args.announcedAfter.toISOString());

  const shipments: RemoteShipment[] = [];
  let path: string | null = `/api/v3/shipments?${query.toString()}`;

  for (let page = 0; page < maxPages; page++) {
    if (!path) break;
    const res = await once(config, path, { method: 'GET', timeoutMs: 15_000 });
    if (!res.ok) throw new SendcloudError(classify(res.status, await readBody(res)));

    const parsed = ShipmentListResponseSchema.safeParse(await res.json());
    if (!parsed.success) {
      throw new SendcloudError({ code: 'parse', message: 'Sendcloud gönderi listesi beklenen şekilde değil', detail: parsed.error.issues });
    }
    for (const row of parsed.data.data ?? []) {
      if (row.id == null) continue;
      shipments.push({
        providerShipmentId: String(row.id),
        externalReferenceId: row.external_reference_id ?? null,
        parcelIds: (row.parcels ?? []).flatMap((p) => (p.id == null ? [] : [String(p.id)])),
      });
    }
    path = nextLink(res.headers.get('link'));
    if (!path) return { shipments, truncated: false };
  }
  return { shipments, truncated: path !== null };
}

/** `Link: <...?cursor=x>; rel="next"` → yol. Başlık yoksa ya da `next` yoksa `null`. */
function nextLink(header: string | null): string | null {
  if (!header) return null;
  for (const part of header.split(',')) {
    const match = /<([^>]+)>\s*;\s*rel="?next"?/i.exec(part.trim());
    if (match?.[1]) return match[1].replace(/^https?:\/\/[^/]+/, '');
  }
  return null;
}
