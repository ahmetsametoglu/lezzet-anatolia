import type { SendcloudConfig } from './client';

/**
 * Sahte sağlayıcı — **test AĞA ÇIKMAZ** (`packages/ai/testing` ve `packages/notify/whatsapp/testing`
 * deseninin aynısı).
 *
 * Gerçek anahtarlarla koşan tek şey elle yapılan provadır ve o da ücretsiz seçenekle
 * (`sendcloud:letter`, canlı ölçümde 0,00 €). Otomatik testin dış servise gitmesi, koşuyu
 * sağlayıcının çalışma süresine ve bakiyesine bağlar — düşen bir test o gün kodun bozulduğunu
 * değil, internetin bozulduğunu söylerdi.
 */
export interface FakeCall {
  path: string;
  method: string;
  body: unknown;
}

export interface FakeResponse {
  status?: number;
  json?: unknown;
  /** Ağ hatası taklidi — `fetch` fırlatır. */
  throws?: string;
}

/**
 * Sıraya konmuş cevapları veren sahte `fetch`. Çağrıları KAYDEDER: "kaç kez çağrıldı" sorusu
 * POST'ta yeniden deneme olmadığını sınamanın tek yolu.
 */
export function fakeSendcloud(responses: FakeResponse[]): { config: SendcloudConfig; calls: FakeCall[] } {
  const calls: FakeCall[] = [];
  let i = 0;
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    const path = String(url).replace(/^https?:\/\/[^/]+/, '');
    calls.push({ path, method: (init?.method ?? 'GET').toUpperCase(), body: init?.body ? JSON.parse(String(init.body)) : null });
    const next = responses[Math.min(i, responses.length - 1)];
    i += 1;
    if (next?.throws) throw new Error(next.throws);
    return new Response(JSON.stringify(next?.json ?? {}), {
      status: next?.status ?? 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as unknown as typeof fetch;

  return { config: { publicKey: 'pub', secretKey: 'sec', baseUrl: 'https://sendcloud.test', fetchImpl }, calls };
}

/** Tek seçenekli teklif cevabı — testlerin ortak gövdesi. */
export function quoteResponse(over: Record<string, unknown> = {}): unknown {
  return {
    data: [
      {
        code: 'chronopost:shop2shop',
        name: 'Chrono Shop2Shop',
        carrier: { code: 'chronopost', name: 'Chronopost' },
        functionalities: { last_mile: 'service_point', signature: 'no', tracked: 'yes', eco_delivery: false, multicollo: true },
        quotes: [{ lead_time: 48, price: { total: { value: '4.99', currency: 'EUR' } } }],
        ...over,
      },
    ],
  };
}
