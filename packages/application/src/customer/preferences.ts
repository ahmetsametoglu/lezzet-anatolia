import { UserProfileService } from '@lezzet/database';
import type { MarketingChannel, MarketingConsent, PreferredLanguage, UserProfile } from '@lezzet/types';
import type { SupabaseClient } from '@supabase/supabase-js';

/*
  MÜŞTERİ TERCİH KAPISI — dil + kampanya izinleri (21.16). Web'de İKİ ayrı yerde duran kuralın
  TERFİSİ (kopya değil, CLAUDE §1): `apps/web/lib/identity/language-actions.ts` (dil) ve
  `app/(customer)/[locale]/account/actions.ts` → `setConsentAction` (izin). Ölçüt karşılandı —
  aynı kuralları artık iki yüzey istiyor (web hesap sayfası + mobil hesap ekranı). Web dosyaları
  bugün kendi ekranlarını besliyor (KÖPRÜ); benimsemesi web şeridinin işi.

  Web'den ölçülen ve BİREBİR korunan kurallar:
  · **Dil TEKTİR** — sitenin dili ile bildirimlerin dili aynı şeydir (kullanıcı kararı 30.07,
    `language-actions.ts` künyesi). Bu alan bir görüntü tercihi değil: değiştiren müşteri sonraki
    e-postalarını da o dilde alır (aşağıdaki YAN ETKİ bloğu).
  · **İzin bir BAYRAK değil KAYIT** — `granted` + `at` + `source` (`MarketingConsentSchema`).
    Pazarlama izni bir gün sorulduğunda kanıt budur (GDPR); "açık mı" tek başına kanıt değildir.
  · **Öbür kanalın kaydı KORUNUR** — nesne baştan yazılsaydı e-posta iznini açmak WhatsApp'ın "ne
    zaman verildi" izini silerdi (web künyesindeki ders; `marketing_consent` tek bir jsonb kolonu,
    yani her yazım TÜM nesneyi değiştirir).
  · **Sipariş bildirimleri bundan BAĞIMSIZDIR** — siparişin kendi maili sözleşme gereğidir,
    pazarlama izni değil: izni kapatan müşteri de siparişinin yola çıktığını öğrenir.

  ── DAMGA POLİTİKASI: web'in DAVRANIŞI değil, NİYETİ korunur ────────────────────────────────
  Web'in `setConsentAction`ı olayla tetiklenir (anahtar her fiziksel çevrilişinde bir çağrı) ve
  her çağrıda damgayı yeniden vurur. Bu kapı GÖVDEYLE çağrılıyor: istemci formun tamamını, yani
  dokunulmamış kanalları da gönderebilir. Aynı davranış burada iki sessiz hasar üretirdi:

  1. **Kanıt tarihi kayardı.** Değişmemiş bir izne yeni damga vurmak, hiç yaşanmamış bir onay anı
     uydurmaktır — üstelik `source`u da ezerek: "checkout'ta verildi" kaydı, hesap ekranı bir kez
     açıldı diye "app-account"a dönerdi.
  2. **"Hiç sorulmadı" → "reddetti"ye dönerdi.** İkisi AYRI hâllerdir ve operasyon ekranı bunları
     ayırıyor (`customers-read.ts` → `toConsentView`: `null` = kayıt yok). Kapalı gelen bir anahtar
     çoğu zaman "hayır dedim" değil "bana hiç sorulmadı"dır; onu ret kaydına çevirmek olmayan bir
     müşteri beyanını kayda geçirmek olurdu.

  Kural bu yüzden şudur: **yalnız DEĞİŞEN kanala damga vurulur** ve karşılaştırmada kayıtsız kanal
  `false` sayılır (`?? false`). Sonuç: gerçek onay ve gerçek GERİ ÇEKME damgalanır (ikisi de
  kanıtı gereken anlardır), tekrar gönderilen aynı değer hiçbir şey yazmaz (çağrı geçerlidir,
  yalnız boşa yazmaz).

  ── DİL DEĞİŞİMİNİN YAN ETKİSİ (ölçüldü, sessiz kalmasın) ───────────────────────────────────
  `preferredLanguage` bir arayüz ayarı DEĞİL, giden yazışmanın dilidir. Bu alanı okuyan yerler:
  · `apps/web/lib/ticket/notify.ts`            → talep/şikâyet e-postaları (doğrudan profil)
  · `apps/web/lib/b2b/application.ts`          → B2B onay/ret e-postaları (doğrudan profil)
  · `apps/backend/src/jobs/zone-available.ts`  → "bölgeye gelindi" bildirimi
  · `apps/web/lib/order/notification-data.ts`  → sipariş mailleri, ama **önce `order.locale`**
  · `apps/backend/src/jobs/send-feedback-invites.ts` → geri bildirim daveti, yine önce sipariş dili
  Yani: değişiklikten SONRAKİ yazışmalar yeni dile geçer; **hâlihazırdaki siparişlerin mailleri
  DEĞİŞMEZ** çünkü sipariş kendi dilini donduruyor (0015 `locale` — "müşteri bu siparişi hangi
  dilde verdiyse mailini o dilde okumalı"). Kapı bunu ayrıca bildirmez: iki davranış da kayıtlı
  bir karardır, burada yalnız görünür kılınıyor.

  Sonuç GÖRÜNÜR RETLİ döner (`updateCustomerProfile` · `addCustomerAddress` emsali) ve başarıda
  GÜNCEL PROFİLİ taşır: çağıran uç cevabı `MeSchema` ile süzüp döndürüyor, ikinci bir okuma turu
  istemciyi de sunucuyu da gereksiz yere dolaştırırdı.
*/

/**
 * Gövdeden gelen izin bayrakları — kanal başına "açık mı". Kanal kümesi `MarketingChannel`den
 * TÜRER (varlık şemasının `.keyof()` kararı): ikinci bir kanal listesi yazılmaz.
 *
 * Değer `Consent` DEĞİL boolean: `at`/`source` istemcinin yazabileceği alanlar olmamalı — kanıtın
 * damgasını vuran taraf sunucudur (sözleşme künyesindeki aynı gerekçe).
 */
export type CustomerConsentToggles = Partial<Record<MarketingChannel, boolean>>;

export type UpdateCustomerPreferencesOutcome =
  | { status: 'ok'; profile: UserProfile }
  | { status: 'no_changes' | 'profile_not_found' };

export async function updateCustomerPreferences(
  db: SupabaseClient,
  input: {
    profileId: string;
    /**
     * İznin NEREDEN verildiğini söyleyen etiket — kaydın `source` alanına yazılır ve operasyon
     * müşteri kartında OPERATÖRE ham hâliyle görünür (`customer-preview.tsx`: "12.03.2026 ·
     * checkout"). Bugünkü değerler: web hesap sayfası `account`, checkout `checkout`.
     *
     * Zorunlu ve varsayılansız: kaynağı kendisi uyduran bir kapı, kanıtı kaynaksız bırakır ya da
     * yanlış yüzeye yazar — mobil uygulamadan verilen izin web'inkinden ayırt edilemezdi.
     */
    source: string;
    preferredLanguage?: PreferredLanguage;
    marketingConsent?: CustomerConsentToggles;
  },
): Promise<UpdateCustomerPreferencesOutcome> {
  // Hiçbir talimat taşımayan gövde GÖRÜNÜR retle döner (sözleşme künyesi): sessizce 200 dönmek,
  // yanlış anahtarla istek kuran istemciyi "kaydediyorum" sanısında bırakırdı.
  const channels = Object.keys(input.marketingConsent ?? {}) as MarketingChannel[];
  if (input.preferredLanguage === undefined && channels.length === 0) return { status: 'no_changes' };

  const profiles = new UserProfileService(db);
  // Okuma ŞART, sadeleştirilemez: `marketing_consent` tek bir jsonb kolonu ve öbür kanalın kaydını
  // korumak için mevcut nesne gerekiyor. Dil tek başına gelse de aynı turdan okunur — iki ayrı yol
  // açmak, `profile_not_found` cevabını çağrının şekline göre değiştirirdi.
  const profile = await profiles.getById(input.profileId);
  if (!profile) return { status: 'profile_not_found' };

  const patch: { id: string; preferredLanguage?: PreferredLanguage; marketingConsent?: MarketingConsent } = {
    id: input.profileId,
  };

  if (input.preferredLanguage !== undefined && input.preferredLanguage !== profile.preferredLanguage) {
    patch.preferredLanguage = input.preferredLanguage;
  }

  const consent = changedConsent(profile.marketingConsent, input.marketingConsent, input.source);
  if (consent) patch.marketingConsent = consent;

  // Gelen değerler kayıtlıyla aynıysa DB'ye hiç gidilmez. Bu bir ret değil: çağrı geçerliydi,
  // yazacak bir şey çıkmadı — cevap yine güncel profildir (istemci `publishMe` ile yayınlıyor,
  // eli boş dönmemeli). Tek yazım turu da bilinçli: dil ve izni iki ayrı `update`e bölmek, biri
  // düşerse yarım yazılmış bir tercih bırakırdı.
  if (Object.keys(patch).length === 1) return { status: 'ok', profile };

  return { status: 'ok', profile: await profiles.update(patch) };
}

/**
 * İzin nesnesinin YENİ hâli — değişen kanal yoksa `null` (yazılacak bir şey yok).
 *
 * `{ ...current }` ile başlar: dokunulmayan kanalın `granted/at/source` üçlüsü olduğu gibi kalır.
 * Damga TEK bir `at` değeriyle vurulur — aynı istekte iki kanal birden değiştiyse ikisi de aynı
 * anı gösterir; `new Date()`i döngü içinde çağırmak, tek bir kullanıcı hareketini birkaç
 * milisaniye arayla yaşanmış iki ayrı beyan gibi kaydederdi.
 */
function changedConsent(current: MarketingConsent, toggles: CustomerConsentToggles | undefined, source: string): MarketingConsent | null {
  if (!toggles) return null;

  const at = new Date().toISOString();
  const next: MarketingConsent = { ...current };
  let changed = false;

  for (const channel of Object.keys(toggles) as MarketingChannel[]) {
    const granted = toggles[channel];
    if (granted === undefined) continue;
    // Kayıtsız kanal `false` sayılır: "hiç sorulmadı" hâlini ret kaydına çevirmemek için (üstteki
    // damga politikası). Gerçek geri çekme (`true` → `false`) buradan geçer ve damgalanır.
    if ((current[channel]?.granted ?? false) === granted) continue;
    next[channel] = { granted, at, source };
    changed = true;
  }

  return changed ? next : null;
}
