import type { CloudApiConfig } from './cloud-api';

/**
 * **SAHTE META** — Cloud API'nin yerine geçen, sözleşmeyi ZORLAYAN bir `fetch` (15.11).
 *
 * ── NEDEN VAR ───────────────────────────────────────────────────────────────
 * Numaranın Cloud API kaydı Meta tarafındaki kısıt yüzünden bekliyor; gerçek bir gönderim
 * yapılamıyor. Ama gönderim zincirinin gerçek olan her parçası bugün sınanabilir: pencere kuralı,
 * kanal ayrımı, hata sınıflandırması, defter yazımı ve echo'nun geri düşmesi. Eksik olan tek halka
 * son sıçrama — onu bu dosya taklit ediyor.
 *
 * ── TAKLİT DEĞİL, HAKEM ─────────────────────────────────────────────────────
 * Her isteğe "tamam" diyen bir sahte, bu dosyanın önlemek için yazıldığı arızanın kendisi olurdu.
 * Bu sahte **reddediyor**: `messaging_product` eksikse, alıcı yoksa, tip tanınmıyorsa, şablonun
 * dili yoksa — Meta'nın kendi hata kodlarıyla (`100`) düşürüyor. Böylece "belgeye göre yazılmış
 * kod" değil, **belgeye uyduğu makineyle zorlanan kod** elde ediyoruz.
 *
 * Depoda `vi.mock` YOK ve olmayacak (ev usulü: gerçeğe vur ya da bağımlılığı enjekte et) —
 * `fakeAiModel` ile aynı desen: sahte, arayüzün kendisi olarak geçiliyor.
 */

export interface FakeMetaCall {
  url: string;
  token: string | null;
  body: Record<string, unknown>;
}

export interface FakeMeta {
  /** `CloudApiConfig.fetchImpl` olarak geçilir. */
  fetchImpl: typeof fetch;
  /** Yapılan çağrılar — "modele NE gönderildi" sorusunun cevabı (`fakeAiModel` deseni). */
  calls: FakeMetaCall[];
  /** Sıradaki çağrının cevabını senaryolar: hata zarfı ya da HTTP durumu. */
  failNext(error: { status?: number; code?: number; message?: string }): void;
}

/** Meta'nın başarı zarfları — iki kanal iki ad kullanıyor, sahte de aynısını yapıyor. */
function successBody(channel: 'whatsapp' | 'messenger', id: string): Record<string, unknown> {
  return channel === 'whatsapp'
    ? { messaging_product: 'whatsapp', contacts: [{ input: '…', wa_id: '…' }], messages: [{ id }] }
    : { recipient_id: '…', message_id: id };
}

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

/**
 * Sahteyi kurar. Sayaç her çağrıda artar ki ardışık iki gönderim AYNI kimliği almasın — alsalardı
 * defterin tekillik indeksi ikinciyi reddeder ve testler gerçekte olmayan bir "çift yazım" görürdü.
 *
 * ⚠ **SAYAÇ ÖRNEK BAŞINADIR — DB'YE YAZAN TESTLERDE TEK SAHTE KULLANIN.** Her `fakeMeta()` çağrısı
 * kimlik dizisini BAŞTAN başlatır (`m_FAKE1`, `m_FAKE2`…), oysa `message.provider_message_id`
 * veritabanında **küresel tekildir**. Her teste yeni bir sahte kurulursa ikinci testin ilk gönderimi
 * birincinin kimliğine çarpar; `sendOutboundMessage` yine `sent` döner (mesaj gerçekten gitti —
 * künyesi bunu söylüyor) ama defter satırı OLUŞMAZ ve test "gönderilmedi" sanır. Ölçüldü 25.08:
 * `ai.test.ts`te iki iddia tam olarak böyle düştü. Saf birim testlerinde (DB yok) sorun değildir.
 */
export function fakeMeta(): FakeMeta {
  const calls: FakeMetaCall[] = [];
  let sira = 0;
  let scripted: { status?: number; code?: number; message?: string } | null = null;

  /* Parametre `string | URL` — `RequestInfo` bir DOM tipi ve bu dosya DOM lib'i olmayan paketlerden
     de import ediliyor (`@lezzet/application` testleri). Daraltmanın bedeli yok: çağıran tek yer
     `sendCloudApiMessage` ve o daima dizge geçiyor; dönüş `typeof fetch`e zaten dönüştürülüyor. */
  const fetchImpl = (async (input: string | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    const headers = (init?.headers ?? {}) as Record<string, string>;
    const token = headers.authorization?.replace(/^Bearer /, '') ?? null;
    const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
    calls.push({ url, token, body });

    if (scripted) {
      const senaryo = scripted;
      scripted = null;
      return jsonResponse(senaryo.status ?? 400, {
        error: { message: senaryo.message ?? 'senaryo hatası', code: senaryo.code ?? 100, type: 'OAuthException' },
      });
    }

    // ── Jeton: Meta jetonsuz isteği 190 ile düşürür ────────────────────────
    if (!token) return jsonResponse(401, { error: { message: 'Invalid OAuth access token', code: 190 } });

    const kanal = 'messaging_product' in body ? 'whatsapp' : 'messenger';

    if (kanal === 'whatsapp') {
      // Meta'nın ilk ayıklama alanı; eksikse istek tümüyle düşer.
      if (body.messaging_product !== 'whatsapp') {
        return jsonResponse(400, { error: { message: 'Missing messaging_product', code: 100 } });
      }
      if (!body.to) return jsonResponse(400, { error: { message: 'Missing "to"', code: 100 } });
      const tip = body.type;
      if (tip !== 'text' && tip !== 'template' && tip !== 'interactive') {
        return jsonResponse(400, { error: { message: `Unsupported type: ${String(tip)}`, code: 100 } });
      }
      if (tip === 'template') {
        const template = body.template as { name?: string; language?: { code?: string } } | undefined;
        // Dil şablonun kimliğinin parçasıdır: aynı ad farklı dillerde ayrı onaylanır.
        if (!template?.name || !template.language?.code) {
          return jsonResponse(400, { error: { message: 'template requires name and language', code: 100 } });
        }
      }
      if (tip === 'text' && !(body.text as { body?: string } | undefined)?.body) {
        return jsonResponse(400, { error: { message: 'text.body is required', code: 100 } });
      }
    } else {
      const recipient = body.recipient as { id?: string } | undefined;
      if (!recipient?.id) return jsonResponse(400, { error: { message: 'recipient.id is required', code: 100 } });
      if (!body.messaging_type) {
        return jsonResponse(400, { error: { message: 'messaging_type is required', code: 100 } });
      }
      const message = body.message as { text?: string; attachment?: unknown } | undefined;
      if (!message?.text && !message?.attachment) {
        return jsonResponse(400, { error: { message: 'message.text or attachment is required', code: 100 } });
      }
    }

    sira += 1;
    const id = kanal === 'whatsapp' ? `wamid.FAKE${sira}` : `m_FAKE${sira}`;
    return jsonResponse(200, successBody(kanal, id));
  }) as typeof fetch;

  return {
    fetchImpl,
    calls,
    failNext(error) {
      scripted = error;
    },
  };
}

/** Sahteyle kurulmuş hazır yapılandırma — testlerin tek satırla bağlanması için. */
export function fakeCloudApiConfig(meta: FakeMeta): CloudApiConfig {
  return { token: 'FAKE-TOKEN', fetchImpl: meta.fetchImpl, baseUrl: 'https://fake-graph.test/v21.0' };
}
