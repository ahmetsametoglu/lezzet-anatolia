import { sendCloudApiMessage, type CloudApiConfig } from '@lezzet/notify';
import { unconfiguredSender, type MessageSender } from './send';

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
export function metaCloudSender(config: CloudApiConfig): MessageSender {
  return {
    name: 'meta-cloud-api',
    async send(target, input) {
      const result = await sendCloudApiMessage(config, {
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
 * Jetonu ÇAĞIRAN okur (`process.env` bu paketin işi değil, `STACK §4`), ama *"jeton yoksa ne
 * olur"* kararı burada durur. İki tüketici var (backend cron'u ve web action'ı) ve kural onlarda
 * ayrı ayrı yazılsaydı, biri gün gelip boş jetonla gerçek sürücüyü kurar — sürücü de her çağrıda
 * Meta'dan `190` yer ve arıza "sağlayıcı hatası" gibi görünürdü. Oysa gerçek sebep bizim
 * yapılandırmamızdır ve `unconfiguredSender` bunu adıyla söyler (`not_configured`).
 *
 * Boş dizge de yok sayılır: `.env`'de `META_ACCESS_TOKEN=` satırı bırakmak, jeton koymamaktır.
 */
export function messageSenderFor(token: string | null | undefined): MessageSender {
  return token?.trim() ? metaCloudSender({ token: token.trim() }) : unconfiguredSender;
}
