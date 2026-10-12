import { createECDH } from 'node:crypto';
import { isSendcloudError, listShipments } from '@lezzet/sendcloud';
import { probeR2Credentials } from '@lezzet/storage';
import { PennylaneApiMeSchema, PennylaneModeEnum, RevolutModeEnum, type IntegrationSecretName } from '@lezzet/types';
import { companyModeMismatch } from '../accounting/pennylane/client';
import { RevolutError, revolutClient } from '../order/revolut';
import { hiboutikRegister } from '../register/hiboutik/client';
import { HiboutikError } from '../register/hiboutik/errors';

/**
 * Anahtarın sağlayıcıda gerçekten çalışıp çalışmadığı; her sınama salt okuyan, ücretsiz bir çağrıdır. "Reddetti" ile "ulaşılamadı"
 * ayrı tutulur, çünkü ilki anahtarın yanlış olduğunu, ikincisi yalnız şu an sınanamadığını söyler.
 */
export type IntegrationCheck =
  | { status: 'ok' }
  | { status: 'rejected'; detail: string }
  | { status: 'unreachable'; detail: string }
  | { status: 'incomplete'; missing: IntegrationSecretName[] }
  | { status: 'unverifiable'; detail: string };

type Value = (name: IntegrationSecretName) => string;

interface Probe {
  /** Sınamanın birlikte istediği anahtarlar; biri eksikse sağlayıcıya gidilmez. */
  needs: readonly IntegrationSecretName[];
  run(value: Value, fetchImpl: typeof fetch): Promise<IntegrationCheck>;
}

const TIMEOUT_MS = 10_000;
const META_GRAPH = 'https://graph.facebook.com/v21.0';

const rejected = (detail: string): IntegrationCheck => ({ status: 'rejected', detail });
const unreachable = (detail: string): IntegrationCheck => ({ status: 'unreachable', detail });

/** Sağlayıcı cevabındaki okunur hata metni; gövde JSON değilse ya da alan yoksa durum kodu söylenir. */
export async function reasonOf(res: Response): Promise<string> {
  const text = await res.text().catch(() => '');
  try {
    const body = JSON.parse(text) as { error?: { message?: string } | string; message?: string };
    const message = typeof body.error === 'string' ? body.error : (body.error?.message ?? body.message);
    if (message) return `${res.status} — ${message.slice(0, 160)}`;
  } catch {
    // JSON olmayan gövde: durum kodu tek başına söylenir.
  }
  return String(res.status);
}

/** Yetkisiz cevap anahtarın reddi, başka her hata yalnız o anki ulaşılamazlıktır. */
async function judge(res: Response, provider: string): Promise<IntegrationCheck> {
  if (res.ok) return { status: 'ok' };
  const reason = await reasonOf(res);
  return res.status === 400 || res.status === 401 || res.status === 403
    ? rejected(`${provider} anahtarı reddetti (${reason})`)
    : unreachable(`${provider} beklenmeyen cevap verdi (${reason})`);
}

const get = (fetchImpl: typeof fetch, url: string, headers: Record<string, string>) =>
  fetchImpl(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });

const revolut: Probe = {
  needs: ['revolut_secret_key'],
  async run(value, fetchImpl) {
    const mode = RevolutModeEnum.safeParse(process.env.REVOLUT_MODE);
    if (!mode.success) return { status: 'unverifiable', detail: 'REVOLUT_MODE ortamda yok; anahtarın hangi ortama ait olduğu bilinmiyor' };
    try {
      await revolutClient({ secretKey: value('revolut_secret_key'), mode: mode.data, fetchImpl }).request('GET', '/api/orders?limit=1');
      return { status: 'ok' };
    } catch (err) {
      if (err instanceof RevolutError && err.code === 'credentials') return rejected(`Revolut anahtarı reddetti (${mode.data})`);
      throw err;
    }
  },
};

/** İmza anahtarları API'den sınanamaz; yanlış alana yapıştırılan anahtar en azından biçiminden yakalanır. */
const revolutWebhook: Probe = {
  needs: ['revolut_webhook_secret'],
  async run(value) {
    if (!value('revolut_webhook_secret').startsWith('wsk_')) return rejected('Revolut webhook signing secret "wsk_" ile başlar');
    return { status: 'unverifiable', detail: 'Revolut bu anahtarı API üzerinden sınatmaz; ilk bildirimde imza doğrulanır' };
  },
};

/** Geçerli bir anahtar da kipin şirketine ait değilse işe yaramaz: istemci o anahtarla hiçbir istek göndermez. */
const pennylane: Probe = {
  needs: ['pennylane_api_token'],
  async run(value, fetchImpl) {
    const mode = PennylaneModeEnum.safeParse(process.env.PENNYLANE_MODE);
    if (!mode.success)
      return { status: 'unverifiable', detail: 'PENNYLANE_MODE ortamda yok; anahtarın hangi şirkete ait olması gerektiği bilinmiyor' };
    const res = await get(fetchImpl, 'https://app.pennylane.com/api/external/v2/me', {
      Authorization: `Bearer ${value('pennylane_api_token')}`,
    });
    if (!res.ok) return judge(res, 'Pennylane');
    const me = PennylaneApiMeSchema.safeParse(await res.json().catch(() => null));
    if (!me.success) return unreachable('Pennylane şirket bilgisini beklenen biçimde vermedi');
    const mismatch = companyModeMismatch(me.data.company, mode.data);
    return mismatch ? rejected(mismatch) : { status: 'ok' };
  },
};

const hiboutik: Probe = {
  needs: ['hiboutik_account', 'hiboutik_user', 'hiboutik_api_key'],
  async run(value, fetchImpl) {
    try {
      await hiboutikRegister({
        account: value('hiboutik_account'),
        user: value('hiboutik_user'),
        apiKey: value('hiboutik_api_key'),
        fetchImpl,
      }).listStores();
      return { status: 'ok' };
    } catch (err) {
      if (err instanceof HiboutikError && err.code === 'credentials')
        return rejected('Hiboutik reddetti: Account name, Username ya da API key yanlış');
      throw err;
    }
  },
};

/** Yalnız gönderim yetkili anahtar alan listesine erişemez ama geçerlidir; Resend bunu ayrı adla söyler. */
const resend: Probe = {
  needs: ['resend_api_key'],
  async run(value, fetchImpl) {
    const res = await get(fetchImpl, 'https://api.resend.com/domains', { Authorization: `Bearer ${value('resend_api_key')}` });
    if (res.status === 401) {
      const body = (await res
        .clone()
        .json()
        .catch(() => null)) as { name?: string } | null;
      if (body?.name === 'restricted_api_key') return { status: 'ok' };
    }
    return judge(res, 'Resend');
  },
};

const sendcloud: Probe = {
  needs: ['sendcloud_public_key', 'sendcloud_secret_key'],
  async run(value, fetchImpl) {
    const config = {
      publicKey: value('sendcloud_public_key'),
      secretKey: value('sendcloud_secret_key'),
      baseUrl: process.env.SENDCLOUD_API_BASE_URL,
      fetchImpl,
    };
    try {
      await listShipments(config, { pageSize: 1, maxPages: 1 });
      return { status: 'ok' };
    } catch (err) {
      if (isSendcloudError(err) && err.code === 'credentials') return rejected('Sendcloud anahtarları reddetti');
      throw err;
    }
  },
};

const sendcloudWebhook: Probe = {
  needs: ['sendcloud_webhook_secret'],
  run: async () => ({ status: 'unverifiable', detail: 'Sendcloud bu anahtarı API üzerinden sınatmaz; ilk bildirimde imza doğrulanır' }),
};

const metaToken = (name: 'meta_access_token' | 'meta_page_access_token'): Probe => ({
  needs: [name],
  run: async (value, fetchImpl) =>
    judge(await get(fetchImpl, `${META_GRAPH}/me?fields=id`, { Authorization: `Bearer ${value(name)}` }), 'Meta'),
});

/** Uygulama sırrı yalnız uygulama kimliğiyle sınanır; kimlik erişim jetonunun künyesinden okunur. */
const metaAppSecret: Probe = {
  needs: ['meta_app_secret', 'meta_access_token'],
  async run(value, fetchImpl) {
    const token = value('meta_access_token');
    const debug = await get(fetchImpl, `${META_GRAPH}/debug_token?input_token=${encodeURIComponent(token)}`, {
      Authorization: `Bearer ${token}`,
    });
    const appId = debug.ok ? ((await debug.json().catch(() => null)) as { data?: { app_id?: string } } | null)?.data?.app_id : undefined;
    if (!appId) return { status: 'unverifiable', detail: "App ID, Access token'dan okunamadı; önce Access token'ı sınayın" };
    const query = new URLSearchParams({ client_id: appId, client_secret: value('meta_app_secret'), grant_type: 'client_credentials' });
    return judge(await get(fetchImpl, `${META_GRAPH}/oauth/access_token?${query.toString()}`, {}), 'Meta');
  },
};

const metaVerifyToken: Probe = {
  needs: ['meta_webhook_verify_token'],
  run: async () => ({
    status: 'unverifiable',
    detail: "Bu değeri biz belirleriz; Meta'daki webhook kaydının Verify token alanına aynısı girilir",
  }),
};

const anthropic: Probe = {
  needs: ['anthropic_api_key'],
  run: async (value, fetchImpl) =>
    judge(
      await get(fetchImpl, 'https://api.anthropic.com/v1/models?limit=1', {
        'x-api-key': value('anthropic_api_key'),
        'anthropic-version': '2023-06-01',
      }),
      'Anthropic',
    ),
};

const googleAi: Probe = {
  needs: ['google_ai_api_key'],
  run: async (value, fetchImpl) =>
    judge(
      await get(fetchImpl, 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1', {
        'x-goog-api-key': value('google_ai_api_key'),
      }),
      'Google',
    ),
};

const r2: Probe = {
  needs: ['r2_access_key_id', 'r2_secret_access_key'],
  async run(value) {
    const outcome = await probeR2Credentials({ accessKeyId: value('r2_access_key_id'), secretAccessKey: value('r2_secret_access_key') });
    if (outcome === 'unconfigured') return { status: 'unverifiable', detail: 'R2_ENDPOINT ya da R2_BUCKET_NAME ortamda yok' };
    return outcome === 'ok' ? { status: 'ok' } : rejected('R2 anahtarları reddetti');
  },
};

/** Yalnız kimlik alanı istenen metin araması ücretsizdir ve uygulamanın kullandığı Places API'yi sınar. */
const googleMaps: Probe = {
  needs: ['google_maps_api_key'],
  run: async (value, fetchImpl) =>
    judge(
      await fetchImpl('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST',
        headers: { 'X-Goog-Api-Key': value('google_maps_api_key'), 'X-Goog-FieldMask': 'places.id', 'Content-Type': 'application/json' },
        body: JSON.stringify({ textQuery: 'Strasbourg' }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      }),
      'Google',
    ),
};

/** Gizli anahtar sağlayıcıya gönderilmez; ondan türeyen açık anahtar ortamdaki açık anahtarla aynı olmalı. */
const webPush: Probe = {
  needs: ['web_push_private_key'],
  async run(value) {
    const publicKey = process.env.NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY?.trim();
    if (!publicKey) return { status: 'unverifiable', detail: 'Public Key (NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY) ortamda yok' };
    let derived: string;
    try {
      const ecdh = createECDH('prime256v1');
      ecdh.setPrivateKey(Buffer.from(value('web_push_private_key'), 'base64url'));
      derived = ecdh.getPublicKey('base64url', 'uncompressed');
    } catch {
      return rejected('Private Key geçerli bir VAPID anahtarı değil');
    }
    return derived === publicKey.replace(/=+$/, '') ? { status: 'ok' } : rejected('Private Key, ortamdaki Public Key ile eşleşmiyor');
  },
};

const PROBES: Record<IntegrationSecretName, Probe> = {
  revolut_secret_key: revolut,
  revolut_webhook_secret: revolutWebhook,
  pennylane_api_token: pennylane,
  hiboutik_account: hiboutik,
  hiboutik_user: hiboutik,
  hiboutik_api_key: hiboutik,
  resend_api_key: resend,
  sendcloud_public_key: sendcloud,
  sendcloud_secret_key: sendcloud,
  sendcloud_webhook_secret: sendcloudWebhook,
  meta_access_token: metaToken('meta_access_token'),
  meta_page_access_token: metaToken('meta_page_access_token'),
  meta_app_secret: metaAppSecret,
  meta_webhook_verify_token: metaVerifyToken,
  anthropic_api_key: anthropic,
  google_ai_api_key: googleAi,
  r2_access_key_id: r2,
  r2_secret_access_key: r2,
  google_maps_api_key: googleMaps,
  web_push_private_key: webPush,
};

/** Anahtarı birlikte çalıştığı öteki anahtarlarla sınar; `lookup` yazılmak üzere olan değeri de verebilir. */
export async function checkIntegrationKey(
  name: IntegrationSecretName,
  lookup: (name: IntegrationSecretName) => string | null,
  fetchImpl: typeof fetch = fetch,
): Promise<IntegrationCheck> {
  const probe = PROBES[name];
  const missing = probe.needs.filter((needed) => !lookup(needed));
  if (missing.length > 0) return { status: 'incomplete', missing };
  try {
    return await probe.run((needed) => lookup(needed) as string, fetchImpl);
  } catch (err) {
    return unreachable(err instanceof Error ? err.message.slice(0, 200) : String(err));
  }
}

/** Anahtarları tek turda sınar; aynı sağlayıcı çağrısını paylaşanlar (Hiboutik'in üçü, R2'nin ikisi) bir kez sınanır. */
export async function checkIntegrationKeys(
  names: readonly IntegrationSecretName[],
  lookup: (name: IntegrationSecretName) => string | null,
  fetchImpl: typeof fetch = fetch,
): Promise<Partial<Record<IntegrationSecretName, IntegrationCheck>>> {
  const runs = new Map<Probe, Promise<IntegrationCheck>>();
  const entries = await Promise.all(
    names.map(async (name) => {
      const probe = PROBES[name];
      let run = runs.get(probe);
      if (!run) {
        run = checkIntegrationKey(name, lookup, fetchImpl);
        runs.set(probe, run);
      }
      return [name, await run] as const;
    }),
  );
  return Object.fromEntries(entries);
}
