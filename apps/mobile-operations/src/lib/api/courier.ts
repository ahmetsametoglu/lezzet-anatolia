import type { z } from 'zod';
import {
  type CloseDeliveryRunRequest,
  CloseDeliveryRunResultSchema,
  type ConfirmDoorDeliveryRequest,
  ConfirmDoorDeliveryResponseSchema,
  CourierDayResponseSchema,
  CourierRoutesResponseSchema,
  CourierVehiclesResponseSchema,
  CourierVanStockMoveResponseSchema,
  CourierVanStockResponseSchema,
  type CourierVanStockScanRequest,
  type CourierVanStockSetRequest,
  DepartCourierRunResponseSchema,
  DiscardCourierRunResponseSchema,
  DayCloseDraftSchema,
  type LoadBoxRequest,
  LoadBoxResponseSchema,
  type MarkUndeliveredRequest,
  MarkUndeliveredResponseSchema,
  type StartCourierDayRequest,
  StartCourierDayResponseSchema,
} from '@lezzet/types';

import { authorizedFetch } from '@lezzet/mobile-kit/src/lib/auth/authorized-fetch';
import type { ApiResult } from '@lezzet/mobile-kit/src/lib/api/client';

/*
  Kurye uçları (`/api/v1/courier/*`): gövde şeması `@lezzet/types`tan gelir ve uç da aynı şemayla üretir, alan adı değişirse iki uç birlikte
  derlemede kırılır. Olumsuz kapı cevapları (`stale`, `forbidden`, `already_started` …) 200 ile gövdede gelir ve ekran okur; hataya
  çevrilmez, çünkü `currentStatus` gibi taşıdıkları bilgi kaybolurdu.
*/

/** `undefined` parametre YAZILMAZ (katalog emsali): boş dize meşru bir değerdir, yokluk değil. */
function queryOf(params: Record<string, string | undefined>): string {
  const pairs = Object.entries(params)
    .filter((entry): entry is [string, string] => entry[1] !== undefined)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
  return pairs.length === 0 ? '' : `?${pairs.join('&')}`;
}

/**
 * Günün rotası: gün verilmezse uç bugüne düşer ve günü cevapta döndürür, istemci varsayılan hesaplamaz ki gece yarısı geçişinde cevapla
 * çelişmesin. `run` seferin künyesidir; `null` = kurye o gün rota almadı.
 */
export function fetchCourierDay(date?: string): Promise<ApiResult<z.infer<typeof CourierDayResponseSchema>>> {
  return authorizedFetch(`/api/v1/courier/day${queryOf({ date })}`, CourierDayResponseSchema);
}

/**
 * O gün koşan rotalar; kurye seferi süreceği rotayı buradan seçer. `run`u dolu rota bugün başlatılmıştır: rota ve gün başına tek sefer
 * olduğu için ekran onu pasif gösterip kimin sürdüğünü söyler.
 */
export function fetchCourierRoutes(date?: string): Promise<ApiResult<z.infer<typeof CourierRoutesResponseSchema>>> {
  return authorizedFetch(`/api/v1/courier/routes${queryOf({ date })}`, CourierRoutesResponseSchema);
}

/**
 * Seferi başlatır: rotanın hazır durakları yola çıkar ve siparişlerin kuryesi bu seferden gelir; `ok`, `already_started`, `route_required`
 * ve `no_route` dallarının hepsi 200 ile gelir. Gün ve `zoneId` ekrandakinden gönderilir, çünkü günsüz istek gece yarısından sonra yarının
 * rotasını başlatıp ekrandaki listeyi kilitli bırakırdı.
 */
export function startCourierDay(
  body: StartCourierDayRequest = {},
): Promise<ApiResult<z.infer<typeof StartCourierDayResponseSchema>>> {
  return authorizedFetch('/api/v1/courier/day/start', StartCourierDayResponseSchema, { method: 'POST', body });
}

/** Kuryenin seçebileceği araçlar: kendi deposuna kayıtlı olanlar; filo güne göre değişmediği için gün parametresi yok. */
export function fetchCourierVehicles(): Promise<ApiResult<z.infer<typeof CourierVehiclesResponseSchema>>> {
  return authorizedFetch('/api/v1/courier/vehicles', CourierVehiclesResponseSchema);
}

/** Kurulmuş ama başlamamış seferi araçtan çıkarır: siparişler serbest kalır, kutuların araç damgası silinir. */
export function discardCourierRun(
  runId: string,
): Promise<ApiResult<z.infer<typeof DiscardCourierRunResponseSchema>>> {
  return authorizedFetch(`/api/v1/courier/runs/${runId}/discard`, DiscardCourierRunResponseSchema, {
    method: 'POST',
  });
}

/**
 * Kurulmuş seferi yola çıkarır: duraklar açılır ve müşteriye "yolda" haberi gider. `startCourierDay({ depart: false })` seferi kurar, bu
 * başlatır; araçta birden çok sefer durabildiği için hangisi olduğu adreste.
 */
export function departCourierRun(runId: string): Promise<ApiResult<z.infer<typeof DepartCourierRunResponseSchema>>> {
  return authorizedFetch(`/api/v1/courier/runs/${runId}/depart`, DepartCourierRunResponseSchema, { method: 'POST' });
}

/** Araçtaki serbest ürün ve depodan alınabilecekler tek okumada, çünkü ekran ikisini yan yana çizer ve karar ikisinden birlikte kurulur. */
export function fetchVanStock(): Promise<ApiResult<z.infer<typeof CourierVanStockResponseSchema>>> {
  return authorizedFetch('/api/v1/courier/van-stock', CourierVanStockResponseSchema);
}

/**
 * Serbest ürün araması aynı uçtan, yalnız süzgeçle: ekrandaki liste tavanlı bir seçkidir ve arama onun dışında kalan malı bulur.
 * Ayrı uç, aynı listeyi iki sıralama ve iki tavanla döndürmeye kapı açardı.
 */
export function searchVanCandidates(
  query: string,
): Promise<ApiResult<z.infer<typeof CourierVanStockResponseSchema>>> {
  return authorizedFetch(
    `/api/v1/courier/van-stock?q=${encodeURIComponent(query)}`,
    CourierVanStockResponseSchema,
  );
}

/**
 * Araçtaki adedi yazar: "şu kadar ekle" değil "şu kadar olsun". Yönü sunucu araçtaki gerçeğe bakarak bulur; gerekçe
 * `CourierVanStockSetRequestSchema` künyesinde.
 */
export function setVanQty(
  body: CourierVanStockSetRequest,
): Promise<ApiResult<z.infer<typeof CourierVanStockMoveResponseSchema>>> {
  return authorizedFetch('/api/v1/courier/van-stock/set', CourierVanStockMoveResponseSchema, { method: 'POST', body });
}

/**
 * **Okut ve bir tane al** — ayrı kapı, çünkü ayrı bilgi durumu: okutan taraf kodun hangi varyant
 * olduğunu bilmiyor, dolayısıyla hedef de taban da veremez. Künyesi ucun kendisinde.
 */
export function scanToVan(
  body: CourierVanStockScanRequest,
): Promise<ApiResult<z.infer<typeof CourierVanStockMoveResponseSchema>>> {
  return authorizedFetch('/api/v1/courier/van-stock/scan', CourierVanStockMoveResponseSchema, { method: 'POST', body });
}

/**
 * Araca yükleme okutması: kutulu siparişin yola çıkışı burada yazılmaz, onu sefer başlatma yazar; tek istisna sefer zaten yoldayken okutulan
 * son kutudur (`stopOpened`). Yanlış rotanın kutusu `wrong_route` ile görünür biçimde reddedilir.
 */
export function loadCourierBox(body: LoadBoxRequest): Promise<ApiResult<z.infer<typeof LoadBoxResponseSchema>>> {
  return authorizedFetch('/api/v1/courier/boxes/load', LoadBoxResponseSchema, { method: 'POST', body });
}

/**
 * Kapıda teslim: kutu kodları, kapı kodu, eksik kalem ve tahsilat tek istekte gider. Ekran adımlara bölse de istek bölünmez, çünkü ağın
 * koptuğu an yarısı yazılmış teslimat kalırdı.
 */
export function submitDoorDelivery(
  orderId: string,
  body: ConfirmDoorDeliveryRequest,
): Promise<ApiResult<z.infer<typeof ConfirmDoorDeliveryResponseSchema>>> {
  return authorizedFetch(`/api/v1/courier/stops/${orderId}/deliver`, ConfirmDoorDeliveryResponseSchema, {
    method: 'POST',
    body,
  });
}

/**
 * Ulaşılamadı ya da kabul etmedi: not uçta zorunludur (sözleşmede `nullish`, uç daraltır) ve eksikse `400 note_required` döner ki ekran onu
 * bir alan hatası olarak göstersin.
 */
export function submitUndelivered(
  orderId: string,
  body: MarkUndeliveredRequest,
): Promise<ApiResult<z.infer<typeof MarkUndeliveredResponseSchema>>> {
  return authorizedFetch(`/api/v1/courier/stops/${orderId}/undelivered`, MarkUndeliveredResponseSchema, {
    method: 'POST',
    body,
  });
}

/**
 * Sefer kapanışı taslağı: seferin resmi ve beklenen tahsilat; `closed` doluysa ekran salt okunur, `run: null` = kapanacak sefer yok. `runId`
 * verilmezse uç `/courier/day` ile aynı seferi bulur, verilirse ekranın gösterdiği sefer ile kapatılan sefer ayrışamaz.
 */
export function fetchDayCloseDraft(
  params: { date?: string; runId?: string } = {},
): Promise<ApiResult<z.infer<typeof DayCloseDraftSchema>>> {
  return authorizedFetch(
    `/api/v1/courier/day-close${queryOf({ date: params.date, runId: params.runId })}`,
    DayCloseDraftSchema,
  );
}

/**
 * Seferi kapatır; `runId` zorunludur, çünkü iki sefer süren kurye ikisini ayrı kapatır. `already_closed` hata değil 200 ile gelen bir
 * gerçektir ve ekran onu "sefer zaten kapalı" diye okur.
 */
export function submitDayClose(
  body: CloseDeliveryRunRequest,
): Promise<ApiResult<z.infer<typeof CloseDeliveryRunResultSchema>>> {
  return authorizedFetch('/api/v1/courier/day-close', CloseDeliveryRunResultSchema, { method: 'POST', body });
}

