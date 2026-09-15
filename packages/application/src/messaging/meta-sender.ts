import { sendCloudApiMessage, type CloudApiConfig } from '@lezzet/notify';
import { unconfiguredSender, type MessageSender, type SendTarget } from './send';

/** `.env`'de `X=` satırı bırakmak jeton koymamaktır. */
const blankToNull = (value: string | null | undefined): string | null => (value?.trim() ? value.trim() : null);

/** Messenger/Instagram Send API sayfa jetonu ister, WhatsApp sistem jetonu; kural kanala göre ve tek yerde (`tokenForChannel`). */
export interface MetaSenderConfig extends CloudApiConfig {
  /** Yoksa `token`a düşülür: yetkisizse Meta reddeder ve ret `failed` olarak görünür, sessiz değil. */
  pageToken?: string | null;
}

function tokenForChannel(config: MetaSenderConfig, source: SendTarget['source']): string {
  return source === 'whatsapp' ? config.token : (blankToNull(config.pageToken) ?? config.token);
}

/**
 * `send.ts` karar verir, bu dosya çevirir, `@lezzet/notify` HTTP'yi çeker. `accountRef` işletme hesabıdır, `externalRef` kişi:
 * karışırsa sağlayıcı hata döndürmez, mesaj sessizce başka bir sohbete yazılır.
 */
export function metaCloudSender(config: MetaSenderConfig): MessageSender {
  return {
    name: 'meta-cloud-api',
    async send(target, input) {
      // Tel katmanı tek jeton görür; hangisi olduğuna çevirmen karar verir.
      const wire: CloudApiConfig = {
        token: tokenForChannel(config, target.source),
        fetchImpl: config.fetchImpl,
        baseUrl: config.baseUrl,
      };
      const result = await sendCloudApiMessage(wire, {
        accountRef: target.accountRef ?? '',
        to: target.externalRef,
        channel: target.source,
        text: input.text,
        templateName: input.templateName,
        // Kalıbın dili çağırandan gelir, çünkü Meta kalıbı ad ve dil çiftiyle arar.
        // BEKLEYEN(15.11): kalıp dilinin müşterinin `preferredLanguage`inden türemesi.
        templateLanguage: input.templateLanguage ?? undefined,
        interactive: (input.payload?.interactive as Record<string, unknown> | undefined) ?? null,
        // Kararı `send.ts` verdi; sürücünün kendi pencere hesabı yok, kural iki yerde yaşasaydı sessizce saparlardı.
        humanAgent: target.humanAgent ?? false,
      });

      if (!result.ok) return { ok: false, reason: result.reason, retryable: result.retryable };
      return { ok: true, providerMessageId: result.messageId };
    },
  };
}

/**
 * "Jeton yoksa ne olur" kararının tek yeri: çağıranlarda ayrı yazılsaydı biri boş jetonla gerçek sürücüyü kurar ve arıza Meta'dan
 * `190` diye, sağlayıcı hatası gibi görünürdü. Ölçüt sistem jetonudur; sayfa jetonu tek başına yapılandırılmış saymaz.
 */
export function messageSenderFor(token: string | null | undefined, pageToken?: string | null): MessageSender {
  const sistem = blankToNull(token);
  return sistem ? metaCloudSender({ token: sistem, pageToken: blankToNull(pageToken) }) : unconfiguredSender;
}

/** Ortam değişkeni adlarının tek yeri. */
export interface MetaTokens {
  /** Sistem kullanıcısı jetonu: WhatsApp gönderimi, medya indirme, çapa kodu. */
  token: string | null;
  /** Sayfa jetonu: Messenger/Instagram gönderimi ve profil adı. */
  pageToken: string | null;
}

/**
 * Env tek kapıdan okunur: iki jeton adı sekiz çağıranda çoğalsaydı biri yalnız birini okur ve Messenger sessizce reddedilirdi.
 * `messageSenderFor` env bilmeyen saf kapı olarak kalır.
 */
export function metaTokensFromEnv(): MetaTokens {
  return {
    token: blankToNull(process.env.META_ACCESS_TOKEN),
    pageToken: blankToNull(process.env.META_PAGE_ACCESS_TOKEN),
  };
}

export function metaSenderFromEnv(): MessageSender {
  const jetonlar = metaTokensFromEnv();
  return messageSenderFor(jetonlar.token, jetonlar.pageToken);
}
