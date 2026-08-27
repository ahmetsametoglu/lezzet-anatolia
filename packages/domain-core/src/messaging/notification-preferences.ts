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
 * ── DİKKAT: BU KURALIN İKİNCİ BİR İFADESİ VAR ve YAŞAYAN O (ölçüldü 27.08) ───
 * Aynı izin ölçütü `packages/database/src/services/user-profile.service.ts` içinde **SQL olarak**
 * da yazılı (`consentFilter` → `marketing_consent-><kanal>->>granted = 'true'`) ve çalışan hâli
 * odur: müşteri listesini ve sayacını o süzüyor, operasyon ekranının "pazarlama" kapsamı onu
 * çağırıyor. Bu TypeScript nüshasının ise **hiçbir çağıranı yok.**
 *
 * 26.08'de buraya *"özelliğinden önce yazılmış kapı, `14.8` gelince bağlanacak"* diye bir
 * `BEKLEYEN` işareti konmuştu; **yanlıştı ve kaldırıldı** — bağlanacak bir şey yok, kural zaten
 * uygulanıyor. Yanlış işaret sessiz koddan kötüdür: `14.8`i yazacak kişiye olmayan bir borç
 * gösterirdi.
 *
 * **Açık karar (sahibi kullanıcı):** iki ifadeden hangisi kalacak. Toplu süzme SQL ister (on bin
 * profil TS'te süzülmez); tek kayıt sorusunun ise bugün soranı yok.
 *
 * **`knip` bunu ARTIK BİLDİRMİYOR ve sebebi öğreticidir:** testi yazıldığı an test dosyası bir
 * "kullanan" sayıldı. Yani bekçi "üretimde çağrılmıyor" sınıfını değil, "hiçbir yerde
 * çağrılmıyor" sınıfını görüyor — test yazmak bir ölü ihracatı makinenin gözünden SAKLIYOR.
 * Bekçinin sınırı budur ve kayıt bu yüzden burada, künyede duruyor: susan makinenin yerine
 * yazılı not geçer.
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
