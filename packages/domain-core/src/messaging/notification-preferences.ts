import type { MarketingChannel, MarketingConsent, NotificationConsent, NotificationKind } from '@lezzet/types';
import { readableCode } from '../order/reference-no';

/*
  BİLDİRİM TERCİHLERİ — saf kurallar (22.08).

  Sayfanın kendisi web'de, gönderim kapıları uygulama katmanında; BURADA yalnız *"bu bildirim
  gönderilir mi"* kararı ve jetonun üretimi durur. Karar tek yerde olmalı çünkü aynı soruyu iki
  gönderim işi (değerlendirme daveti, bölge müjdesi) ve bir okuma yüzeyi (tercih sayfası) soruyor;
  üç yerde yazılsaydı biri bir gün varsayılanı ters okurdu — ve o hata SESSİZDİR: kimse
  gönderilmeyen bir maili fark etmez.
*/

/**
 * Tercih sayfasının oturumsuz anahtarı.
 *
 * **24 hane, `feedbackToken`in 16'sından uzun** ve gerekçesi ömür: değerlendirme jetonu süreli
 * (`expires_at`), bu jeton yıllar önce gönderilmiş bir mailin altbilgisinde durmaya devam ediyor.
 * Süresiz bir anahtarın tahmin edilmeye karşı payı da o oranda geniş olmalı.
 *
 * Üreteç kriptografik (`readableCode` varsayılanı) — `random` yalnız test enjeksiyonu içindir.
 */
export function notificationToken(random?: () => number): string {
  return readableCode(24, random);
}

/**
 * Kampanya gönderilebilir mi — **OPT-IN**: anahtar yoksa izin yoktur.
 *
 * Sessizliği rıza saymak hem yanlış hem hukuken savunulamaz; kampanya açık onay ister.
 *
 * **BEKLEYEN(14.8): bu kapıyı SORAN bir gönderim yolu henüz yok.** Rıza toplanıyor (checkout,
 * tercih sayfası, müşteri ekranı) ama kampanya e-postası elle gönderim aracı yazılmadı; araç
 * geldiğinde alıcı listesi bu fonksiyondan süzülecek. Kapı önce yazıldı ve bu bilinçli: izin
 * kuralını gönderim gününe bırakmak, o gün acele bir `consent?.email` kontrolü doğururdu ve
 * opt-in/opt-out ayrımı (aşağıdaki künye) sessizce kaybolurdu.
 *
 * `@public` etiketi `knip`e "bu bilerek dışa açık" der ve onu susturur — ama borcu SUSTURMAZ:
 * `BEKLEYEN(14.8)` işaretini `docs:check` denetliyor, yani görev satırı kapanmadan bu not ayakta
 * kalır ve kapandığında işaret çürükse commit'ten geçmez. Sessiz kalan makine, kayıt tutan işaret.
 *
 * @public
 */
export function marketingAllowed(consent: MarketingConsent | null | undefined, channel: MarketingChannel): boolean {
  return consent?.[channel]?.granted === true;
}

/**
 * Bildirim türü gönderilebilir mi — **OPT-OUT**: anahtar yoksa GÖNDERİLİR.
 *
 * Varsayılanın `marketingAllowed`ın tersi olması bir tutarsızlık değil, iki farklı hukuki zemin:
 * kampanya açık rıza ister; teslim edilmiş bir siparişin değerlendirme daveti mevcut müşteri
 * ilişkisine dayanır ve gereken şey rızanın kendisi değil, kolay reddedilebilirliktir. Opt-in
 * yapılsaydı özellik doğduğu gün susardı — bugün davet herkese gidiyor ve kimse "evet" demedi.
 *
 * `granted: false` yazılıysa gitmez; başka her hâlde gider.
 */
export function notificationAllowed(consent: NotificationConsent | null | undefined, kind: NotificationKind): boolean {
  return consent?.[kind]?.granted !== false;
}
