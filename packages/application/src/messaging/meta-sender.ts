import { sendCloudApiMessage, type CloudApiConfig } from '@lezzet/notify';
import { unconfiguredSender, type MessageSender, type SendTarget } from './send';

/** Boş ve boşluklu dizge "jeton yok"tur — `.env`'de `X=` satırı bırakmak jeton koymamaktır. */
const blankToNull = (value: string | null | undefined): string | null => (value?.trim() ? value.trim() : null);

/**
 * Sürücünün yapılandırması: tel katmanının `CloudApiConfig`i + Messenger/Instagram için SAYFA jetonu.
 *
 * ── İKİ KANAL, İKİ JETON (08.09, ölçüldü) ───────────────────────────────────
 * Gönderim her kanalda tek jetonla (`META_ACCESS_TOKEN`, sistem kullanıcısı) gidiyordu. `debug_token`
 * o jetonda `pages_messaging` OLMADIĞINI gösterdi; Meta'nın Send API'si Messenger/IG'de Sayfa
 * jetonu ister (ya da Sayfası atanmış, `pages_messaging` taşıyan bir sistem jetonu). WhatsApp'ta
 * ise sistem jetonu doğru olan. Kural kanala göre ve TEK yerde: `tokenForChannel`.
 */
export interface MetaSenderConfig extends CloudApiConfig {
  /**
   * Sayfa jetonu — Messenger/Instagram gönderimi bununla gider. Yoksa `token`a düşülür: o jeton
   * yetkiliyse mesaj yine gider, değilse Meta reddeder ve ret deftere `failed` düşer — sessiz değil.
   * WhatsApp bu alana hiç bakmaz.
   */
  pageToken?: string | null;
}

/** Kanalın jetonu — WhatsApp sistem jetonu, Messenger/IG Sayfa jetonu (yoksa sistem jetonu). */
function tokenForChannel(config: MetaSenderConfig, source: SendTarget['source']): string {
  return source === 'whatsapp' ? config.token : (blankToNull(config.pageToken) ?? config.token);
}

/**
 * **CLOUD API SÜRÜCÜSÜ** (15.11) — `MessageSender` portunun gerçek uygulaması.
 *
 * ── ÜÇ KATMAN, ÜÇ İŞ ────────────────────────────────────────────────────────
 * `send.ts` KARAR verir (pencere, kanal-şablon, hesap kimliği) · bu dosya ÇEVİRİR (konuşma
 * kavramları → sağlayıcı kavramları) · `@lezzet/notify` TELİ ÇEKER (HTTP). Uygulama katmanı HTTP
 * bilmez (`STACK §4`); burada tek bir `fetch` çağrısı yok, yalnız eşleme var.
 *
 * ── ÇEVİRİNİN TAŞIDIĞI TEK BİLGİ: KİM NEREYE ────────────────────────────────
 * `accountRef` konuşmanın aktığı İŞLETME hesabı (WhatsApp'ta `phone_number_id`, Messenger/IG'de
 * Sayfa kimliği), `externalRef` ise KİŞİ. İkisi karışırsa mesaj kendi numaramıza gider — sağlayıcı
 * bunu hata olarak döndürmez, sessizce başka bir sohbete yazar.
 *
 * ── VARSAYILAN HÂLÂ REDDEDEN SAĞLAYICI ──────────────────────────────────────
 * Bu sürücü ekrana BAĞLANMADI ve bağlanması bir karardır: numaranın Cloud API kaydı Meta
 * tarafındaki portföy kısıtı yüzünden bekliyor (15.6). Bağlanana kadar operasyon kutusu **defter
 * kutusu** olarak kalıyor — "gönderildi" diyen bir ekran, gönderilmemiş mesajı gönderilmiş
 * gösterirdi.
 *
 * **DOĞRULANMAMIŞ:** istek şekilleri Meta'nın belgelediği sözleşmeden yazıldı ve sahte Meta
 * (`@lezzet/notify/testing`) o sözleşmeyi makineyle zorluyor; ama gerçek Meta'nın kabul ettiği
 * ancak canlı bir gönderimle bilinir. Hesap açıldığı gün yapılacak iş bunu yazmak değil, doğrulamak.
 */
export function metaCloudSender(config: MetaSenderConfig): MessageSender {
  return {
    name: 'meta-cloud-api',
    async send(target, input) {
      // Tel katmanı tek jeton görür; hangisi olduğuna burası (çevirmen) karar verir.
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
        /* Şablonun dili ÇAĞIRANDAN gelir (28.08): Meta şablonu ad + dil ÇİFTİYLE arar. Sabit `tr`
           varsayımı `en_US` dilinde onaylanmış hiçbir şablonu gönderemiyordu — Meta'nın kendi test
           şablonları dahil — ve hata `132001` diye, yani "şablon yok" gibi geliyordu; oysa şablon
           vardı, dili başkaydı. Geçilmezse istemcinin varsayılanı (`tr`) sürüyor.
           BEKLEYEN(15.11): dilin müşterinin `preferredLanguage`inden TÜREMESİ hâlâ açık — bugün
           çağıran açıkça söylüyor, çünkü hangi şablonun hangi dilde onaylandığı Meta tarafında
           belirlenir ve bizim tercihimizle örtüşmeyebilir. */
        templateLanguage: input.templateLanguage ?? undefined,
        interactive: (input.payload?.interactive as Record<string, unknown> | undefined) ?? null,
        /* Kararı `send.ts` verdi (pencere kapalı + kanal Messenger/IG + 7 gün içinde); burası
           yalnız taşıyor. Sürücünün kendi pencere hesabı YOK ve olmamalı — kural iki yerde
           yaşasaydı biri gün gelip ötekinden sapardı ve sapma sessiz olurdu. */
        humanAgent: target.humanAgent ?? false,
      });

      if (!result.ok) return { ok: false, reason: result.reason, retryable: result.retryable };
      return { ok: true, providerMessageId: result.messageId };
    },
  };
}

/**
 * **JETON VAR MI → SÜRÜCÜ SEÇ** (15.8) — "yapılandırılmış mı" kuralının TEK yeri.
 *
 * Jetonu ÇAĞIRAN verir (saf kapı, testlenebilir), ama *"jeton yoksa ne olur"* kararı burada durur.
 * Tüketiciler çok (backend cron'u, webhook, web ve mobil action'ları) ve kural onlarda ayrı ayrı
 * yazılsaydı, biri gün gelip boş jetonla gerçek sürücüyü kurar — sürücü de her çağrıda Meta'dan
 * `190` yer ve arıza "sağlayıcı hatası" gibi görünürdü. Oysa gerçek sebep bizim yapılandırmamızdır
 * ve `unconfiguredSender` bunu adıyla söyler (`not_configured`).
 *
 * Ölçüt SİSTEM jetonudur: WhatsApp'ın ve çapa kodunun jetonu o; Sayfa jetonu tek başına
 * "yapılandırılmış" saymaz. Boş dizge de yok sayılır (`blankToNull`).
 */
export function messageSenderFor(token: string | null | undefined, pageToken?: string | null): MessageSender {
  const sistem = blankToNull(token);
  return sistem ? metaCloudSender({ token: sistem, pageToken: blankToNull(pageToken) }) : unconfiguredSender;
}

/** Meta jetonları — ortam değişkeni ADLARININ tek yeri. */
export interface MetaTokens {
  /** Sistem kullanıcısı jetonu (`META_ACCESS_TOKEN`) — WhatsApp gönderimi, medya indirme, çapa kodu. */
  token: string | null;
  /** Sayfa jetonu (`META_PAGE_ACCESS_TOKEN`) — Messenger/IG gönderimi ve profil adı. */
  pageToken: string | null;
}

/**
 * **ENV OKUMASI TEK KAPIDA** (08.09). 08.09'a kadar sekiz çağıran `process.env.META_ACCESS_TOKEN`ı
 * ayrı ayrı okuyordu; ikinci jeton gelince iki değişken adı sekiz yerde çoğalacak ve biri gün gelip
 * yalnız birini okuyacaktı — Messenger o çağırandan sessizce reddedilirdi. Adlar artık burada durur;
 * `messageSenderFor` env bilmeyen saf kapı olarak kalır ve testler ona vurur.
 */
export function metaTokensFromEnv(): MetaTokens {
  return {
    token: blankToNull(process.env.META_ACCESS_TOKEN),
    pageToken: blankToNull(process.env.META_PAGE_ACCESS_TOKEN),
  };
}

/** Env'den sürücü — mesaj yazan her yolun (webhook, cron, web/mobil action) çağırdığı tek satır. */
export function metaSenderFromEnv(): MessageSender {
  const jetonlar = metaTokensFromEnv();
  return messageSenderFor(jetonlar.token, jetonlar.pageToken);
}
