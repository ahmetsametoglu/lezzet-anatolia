import type { z } from 'zod';
import {
  type OnSiteSaleRequest,
  OnSiteSaleResponseSchema,
  RecentSalesResponseSchema,
  SaleCatalogPageSchema,
  SaleVariantsResponseSchema,
} from '@lezzet/types';

import { authorizedFetch } from '../auth/authorized-fetch';
import { withWarehouseChoice } from '../operations/warehouse-choice';
import type { ApiFetchInit, ApiResult } from './client';

/**
 * **Bu dosyanın TEK çağrı kapısı** — depo istemcisiyle AYNI sarmalayıcı (`lib/api/warehouse.ts`
 * künyesi): personelin seçtiği depo adrese yazılır, seçim yoksa adres aynen gider.
 *
 * Satış uçları da depo kapısının arkasında (`courierVehicleFirst` → `warehouseGuard`) ve seçimi
 * ATLASAYDI iki ekran ayrışırdı: depo işleri seçilen tesiste, satış ise kapının kendi çözdüğü
 * yerde (kuryede: araçta) yazılırdı. Aynı personelin aynı telefonda iki farklı depoda çalışması,
 * stoğu iki yerden birden bozmanın en sessiz yoludur (DOMAIN §17).
 */
function saleFetch<TSchema extends z.ZodTypeAny>(
  path: string,
  schema: TSchema,
  init: ApiFetchInit = {},
): Promise<ApiResult<z.infer<TSchema>>> {
  return authorizedFetch(withWarehouseChoice(path), schema, init);
}

/*
  YERİNDE SATIŞ UÇLARI — `/api/v1/sale/*` (21.119).

  ŞEMA BURADA YAZILMAZ: gövde sözleşmesi `@lezzet/types`ın (`contracts/sale-api.schema.ts`) ve uç
  DA aynı şemayla üretiyor — alan adı değişirse üreten ve tüketen aynı anda derlemede kırılır.
  Kurye/depo emsalleriyle aynı düzen.

  HEPSİ KORUNAN ÇAĞRI: rol kapısı `warehouse|courier|admin` (satan kişi malın yanındaki personeldir
  — `DOMAIN §17`), üstüne DEPO kapısı. Depo kimliği hiçbir isteğe yazılmaz — depo istemcisinin
  kararıyla aynı gerekçe (`lib/api/warehouse.ts` künyesi): parametreyi dolduracak meşru bir kaynak
  yok, personelin deposu SUNUCUDA künyeden çözülür.

  ── OLUMSUZ SONUÇ BİR HATA DEĞİL, CEVABIN KENDİSİDİR ────────────────────────
  `insufficient_here` · `blocked_lines` · `failed` uçtan **200** ile ve GÖVDEDE gelir; kararı ekran
  okur. Yetersiz stok özellikle: kalan sayıyı taşır ki personel müşteriye "üçü var" diyebilsin.
  Telin gerçek hataları (401 · 400 · 403 kapsam dışı · 500 · ağ) `ApiFail`.
*/

/** `undefined` parametre YAZILMAZ (kurye emsali): boş dize meşru bir değerdir, yokluk değil. */
function queryOf(params: Record<string, string | undefined>): string {
  const pairs = Object.entries(params)
    .filter((entry): entry is [string, string] => entry[1] !== undefined)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
  return pairs.length === 0 ? '' : `?${pairs.join('&')}`;
}

/**
 * **Bu depoda ne var** — satış ekranının listesi. Kart, vitrin kartı + `availableHere` (kalan adet)
 * taşır; arama sunucuda daraltır, sayfa `cursor` ile büyür.
 */
export function fetchSaleCatalog(params: {
  q?: string;
  cursor?: string;
}): Promise<ApiResult<z.infer<typeof SaleCatalogPageSchema>>> {
  return saleFetch(`/api/v1/sale/catalog${queryOf({ locale: 'tr', q: params.q, cursor: params.cursor })}`, SaleCatalogPageSchema);
}

/** **Boy çekmecesi** — çok boylu ürünün boyları, fiyat ve kalan adetle (boy seçimi satış anında). */
export function fetchSaleVariants(slug: string): Promise<ApiResult<z.infer<typeof SaleVariantsResponseSchema>>> {
  return saleFetch(`/api/v1/sale/catalog/${encodeURIComponent(slug)}/variants?locale=tr`, SaleVariantsResponseSchema);
}

/**
 * **Satışın kendisi** — tek çağrıda kapanır (taslak → tüketim → tahsilat, hepsi sunucuda).
 * Pazarlıklı fiyat YALNIZ üstüne yazılan kalemde gönderilir; dokunulmamış kalemin fiyatını
 * sunucu çözer — siparişin parasını istemci yazmaz.
 */
export function sellOnSite(body: OnSiteSaleRequest): Promise<ApiResult<z.infer<typeof OnSiteSaleResponseSchema>>> {
  return saleFetch('/api/v1/sale/on-site', OnSiteSaleResponseSchema, { method: 'POST', body });
}

/** **Son satışlar** — bu deponun kapı satışları, kim yazdıysa adıyla (en yeni önce, sabit tavan). */
export function fetchRecentSales(): Promise<ApiResult<z.infer<typeof RecentSalesResponseSchema>>> {
  return saleFetch('/api/v1/sale/recent', RecentSalesResponseSchema);
}
