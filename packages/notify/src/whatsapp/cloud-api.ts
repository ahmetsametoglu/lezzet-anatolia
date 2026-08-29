/**
 * **META CLOUD API İSTEMCİSİ** (15.11) — üç kanala mesaj gönderen tek HTTP kapısı.
 *
 * ── NEDEN BURADA ────────────────────────────────────────────────────────────
 * Uygulama katmanı HTTP bilmez (`STACK §4`): gönderim kararlarını `application/messaging/send.ts`
 * veriyor, teli buradan çekiyoruz. `@lezzet/notify` zaten OUTBOUND sağlayıcı paketidir ve
 * `whatsapp_api` sürücüsünün boş gövdesi 14'ten beri burada bekliyordu.
 *
 * ── SAĞLAYICI CANLI DEĞİLKEN NASIL YAZILDI ──────────────────────────────────
 * Numaranın Cloud API kaydı Meta tarafındaki portföy kısıtı yüzünden bekliyor (15.6/15.7), yani
 * bugün gerçek bir gönderim yapılamıyor. İstek şekilleri Meta'nın belgelediği sözleşmeden yazıldı
 * ve **sahte Meta** (`./testing`) o sözleşmeyi MAKİNEYLE zorluyor: eksik `messaging_product`,
 * bilinmeyen `type`, dilsiz şablon — üçü de sahte tarafından reddediliyor. Böylece "belgeye göre
 * yazılmış kod" değil, "belgeye uyduğu sınanan kod" oluyor.
 *
 * **Yine de DOĞRULANMAMIŞ sayılır** ve bu künye onu açıkça söylüyor: gerçek Meta'nın isteği kabul
 * edip mesajı teslim ettiği ancak canlı bir gönderimle bilinir (`CLAUDE §0` — ölçülmemiş varsayım).
 * Hesap açıldığı gün yapılacak iş bu dosyayı YAZMAK değil, DOĞRULAMAK.
 *
 * ── KANAL FARKI TEK YERDE ───────────────────────────────────────────────────
 * WhatsApp `POST /{phone_number_id}/messages` ve alıcıyı `to` alanında ister; Messenger/Instagram
 * `POST /{page_id}/messages` ve alıcıyı `recipient.id` içinde ister. İkisi ayrı uç gibi görünüyor
 * ama aynı karar zincirinin sonu — ayrı iki istemci, aynı jetonu ve aynı hata eşlemesini iki kez
 * yaşatırdı.
 */

/** Graph sürümü sabit ve AÇIK: "en son" diye bir sürüm yok, Meta eskisini bir gün kapatır. */
const GRAPH_VERSION = 'v21.0';

export interface CloudApiConfig {
  /** Sistem kullanıcısı / sayfa erişim jetonu. Okunduğu yer ÇAĞIRANDIR — paket env okumaz. */
  token: string;
  /** Test ve yerel taklit için; verilmezse ortamın `fetch`i. */
  fetchImpl?: typeof fetch;
  /** Sahte Meta'yı adresleyebilmek için; varsayılan gerçek Graph. */
  baseUrl?: string;
}

/** Gönderilecek mesajın kanal-bağımsız hâli — kararı veren taraf bunu kurar. */
export interface CloudApiMessage {
  /** WhatsApp: `phone_number_id` · Messenger/Instagram: Sayfa kimliği. */
  accountRef: string;
  /** WhatsApp: E.164 telefon · Messenger/Instagram: PSID/IGSID. */
  to: string;
  channel: 'whatsapp' | 'messenger' | 'instagram';
  text: string | null;
  /** Dolu ise KALIP mesaj (yalnız WhatsApp). */
  templateName?: string | null;
  /** Şablonun dili — Meta zorunlu tutar; varsayılan Türkçe değil, çağıranın kararı. */
  templateLanguage?: string;
  /**
   * Türe özgü ham gövde (interaktif kart, medya). Meta'nın şeklinde gelir ve OLDUĞU GİBİ geçer:
   * burada yeniden şekillendirmek, sağlayıcının sözleşmesini ikinci kez yazmak olurdu.
   */
  interactive?: Record<string, unknown> | null;
  /**
   * **İNSAN TEMSİLCİ ETİKETİ** (yalnız Messenger/Instagram) — 24 saat kapandıktan sonra 7 güne
   * kadar cevap yazmanın Meta'daki tek yolu. Kararı `send.ts` verir (pencere hesabı orada); burası
   * yalnız çevirir. WhatsApp gövdesinde karşılığı YOK ve olmamalı: orada kapalı pencerenin çaresi
   * ücretli şablondur, etiket değil.
   */
  humanAgent?: boolean;
}

export type CloudApiResult =
  | { ok: true; messageId: string }
  /**
   * `retryable` sağlayıcı hatasının SINIFIDIR, şiddeti değil: hız sınırı ve geçici sunucu hatası
   * yeniden denenir; kural ihlali (pencere dışı serbest metin) ve geçersiz jeton denenmez —
   * ikincisini denemek aynı hatayı para ve gürültüyle tekrarlamaktır.
   */
  | { ok: false; reason: string; retryable: boolean };

/**
 * Meta hata kodlarının bizim sınıfımıza eşlenmesi.
 *
 * Kodlar Meta'nındır, biz uydurmuyoruz — ve eşleme BURADA duruyor çünkü çağıranın "yeniden dene"
 * düğmesini doğru yere koyması buna bağlı. Tanınmayan kod **denenebilir** sayılıyor: bilinmeyen bir
 * hatayı kalıcı ilan etmek, geçici bir kesintide mesajı sessizce çöpe atmak olurdu.
 */
function retryableOf(httpStatus: number, code: number | undefined): boolean {
  if (code === 190) return false; // geçersiz/expired jeton — tekrar aynı sonucu verir
  if (code === 131047) return false; // yeniden etkileşim gerekli (pencere dışı) — kural ihlali
  if (code === 131026) return false; // alıcıya teslim edilemez (WhatsApp'ı yok / engelli)
  if (code === 100) return false; // istek şekli hatalı — bizim hatamız, tekrar düzeltmez
  if (httpStatus === 429) return true; // hız sınırı
  if (httpStatus >= 500) return true; // sağlayıcı tarafı geçici
  return true;
}

/** Meta'nın hata zarfı — `error.code` + `error_subcode`; mesaj metni teşhis içindir. */
interface GraphError {
  error?: { message?: string; code?: number; error_subcode?: number; type?: string };
}

/**
 * WhatsApp gövdesi. `messaging_product` ZORUNLU ve sabit: Meta bunu isteğin ilk ayıklama alanı
 * olarak kullanıyor, eksikse tüm istek `100` ile düşer.
 */
function whatsappBody(message: CloudApiMessage): Record<string, unknown> {
  const base = { messaging_product: 'whatsapp', recipient_type: 'individual', to: message.to };
  if (message.templateName) {
    return {
      ...base,
      type: 'template',
      // Dil zarfı şablonun kimliğinin PARÇASI: aynı ad farklı dillerde ayrı onaylanır.
      template: { name: message.templateName, language: { code: message.templateLanguage ?? 'tr' } },
    };
  }
  if (message.interactive) return { ...base, type: 'interactive', interactive: message.interactive };
  return { ...base, type: 'text', text: { body: message.text ?? '' } };
}

/**
 * Messenger/Instagram gövdesi — alıcı `recipient.id`de, metin `message.text`te.
 *
 * `messaging_type: 'RESPONSE'`: bu bir CEVAPTIR, işletme-başlatan bir mesaj değil. Alan boş
 * bırakılırsa Meta isteği reddediyor; yanlış değer ("UPDATE") ise pencere dışında ücret/etiket
 * kurallarına takılır. Şablon kavramı bu kanallarda YOK — gönderim kapısı zaten öyle reddediyor.
 *
 * **İki zarf, tek gövde:** pencere kapandıktan sonra aynı mesaj `MESSAGE_TAG` + `HUMAN_AGENT` ile
 * gider (Meta'nın belgelediği alan adları; 7 günlük aralık). `messaging_type` ile `tag` BİRLİKTE
 * yazılır — etiketsiz `MESSAGE_TAG` da, `RESPONSE` yanında duran bir `tag` de reddedilir.
 */
function messengerBody(message: CloudApiMessage): Record<string, unknown> {
  return {
    recipient: { id: message.to },
    ...(message.humanAgent ? { messaging_type: 'MESSAGE_TAG', tag: 'HUMAN_AGENT' } : { messaging_type: 'RESPONSE' }),
    message: message.interactive ? { attachment: message.interactive } : { text: message.text ?? '' },
  };
}

export async function sendCloudApiMessage(config: CloudApiConfig, message: CloudApiMessage): Promise<CloudApiResult> {
  const doFetch = config.fetchImpl ?? fetch;
  const base = config.baseUrl ?? `https://graph.facebook.com/${GRAPH_VERSION}`;
  const url = `${base}/${encodeURIComponent(message.accountRef)}/messages`;
  const body = message.channel === 'whatsapp' ? whatsappBody(message) : messengerBody(message);

  let response: Response;
  try {
    response = await doFetch(url, {
      method: 'POST',
      headers: { authorization: `Bearer ${config.token}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (err) {
    // Ağ hatası: sağlayıcıya ULAŞILAMADI — mesajın gidip gitmediği bilinmiyor. Denenebilir sayılır;
    // idempotency'yi çağıran taşır (defterin `provider_message_id` tekilliği).
    return { ok: false, reason: `network_error: ${String(err)}`, retryable: true };
  }

  const payload = (await response.json().catch(() => ({}))) as GraphError & {
    messages?: { id?: string }[];
    message_id?: string;
  };

  if (!response.ok || payload.error) {
    const code = payload.error?.code;
    return {
      ok: false,
      // Kod ve metin BİRLİKTE: kod eşlemeyi, metin teşhisi taşır. Log'a kimlik yazılır, müşteri
      // içeriği değil (`CLAUDE §1`) — burada dönen şey zaten sağlayıcının kendi metnidir.
      reason: `meta_${code ?? response.status}: ${payload.error?.message ?? 'bilinmeyen hata'}`,
      retryable: retryableOf(response.status, code),
    };
  }

  // WhatsApp `messages[0].id` (wamid…), Messenger/IG `message_id` (m_…) döndürür — aynı kavram,
  // iki ad. Kimliği alamazsak BAŞARILI SAYMAYIZ: defterdeki satırın sağlayıcı kimliği olmadan
  // tekrar teslimatı (echo) ayırt edilemez ve aynı mesaj iki kez yazılır.
  const messageId = payload.messages?.[0]?.id ?? payload.message_id;
  if (!messageId) return { ok: false, reason: 'meta_no_message_id', retryable: false };
  return { ok: true, messageId };
}
