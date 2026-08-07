# Mobil teknoloji etüdü — React Native / Capacitor / Flutter (05–06.08.2026)

> **Statü: ETÜT + ÖNERİ — karar kullanıcının.** Soru: müşteri mobil uygulaması hangi teknolojiyle
> yazılacak? Birincil ölçüt (kullanıcı kararı): **test edilebilirlik** — hızlı/deterministik
> birim+komponent testi, olgun E2E, makul CI maliyeti.
> Yöntem: çok-ajanlı web araştırması (Ağustos 2026 kaynakları) + depo-uyum analizi; kritik
> iddiaların tamamı birincil kaynaktan **elle teyit edildi** (§8 doğrulama kaydı).
> Zemin: `docs/feature/mobil-platform.md` "özellikler uygulamayı zorlamıyor" demişti (02.08);
> 05.08 ürün kararıyla soru değişti — uygulama yapılacak.

## 0. Kısa cevap (öneri)

**React Native + Expo.** Üç gerekçe:

1. **Test piramidinin alt iki katı cihazsız ve resmî belgeli.** Birim + komponent testleri
   Node'da koşar (Jest + jest-expo + React Native Testing Library v14); E2E için Expo'nun resmî
   rehberi Maestro + EAS Workflows. Araç seçiminde belirsizlik yok, tek belgelenmiş hat var.
2. **Çekirdek aynen taşınır, test varlığı korunur.** `@lezzet/types` (5,1k satır Zod) +
   `domain-core` (11k satır, 47 test dosyası) + `helper` + `i18n` + `brand` ≈ 17k satır saf TS,
   RN'de **değişiklik olmadan** import edilir; 568 birim testi mobili de güvence altına alır.
   **"Şema tek kaynak" değişmezi mobile genişler** — mobil API cevapları aynı Zod şemasıyla parse
   edilir. Flutter'da bu değişmez yapısal olarak kırılır (§5b), Capacitor'da korunur ama dağıtım
   modeli sakat (§5a).
3. **Ödeme ve auth yolları resmî destekli.** `@stripe/stripe-react-native` (PaymentSheet, Expo
   config plugin) + supabase-js'in resmî Expo desteği. Fiziksel gıda satışında Apple IAP
   **kullanılamaz** (kart/Apple Pay şart) ve Google Play Billing muaf — Stripe komisyonsuz sürer
   (§8 madde 6, 11).

Dar anlamda "en iyi test aracı" sorusunun cevabı Flutter'dır (widget testleri gerçek render
üzerinde, cihazsız, milisaniye ölçeği). Ama ölçüt *sistemin* test edilebilirliği olunca tablo
döner: Flutter'a geçiş 568 mevcut testin ve tüm Zod sözleşme doğrulamasının sıfırlanması, iki
dilde çift şema bakımı demek. RN, "bugün elimizde olan güvenceyi mobile taşıyan" tek native
seçenek.

## 1. Ölçütler

| Ölçüt | Ağırlık | Neden |
| --- | --- | --- |
| Test edilebilirlik | birincil | Kullanıcı kararı; proje kültürü zaten test-yoğun (568 birim testi ~1,3 sn, Playwright E2E) |
| Mevcut varlıkların yeniden kullanımı | yüksek | CLAUDE.md "hiçbir türde duplication yok" + "şema tek kaynak" değişmezleri |
| Ödeme/auth/i18n uyumu | yüksek | Stripe + özel e-posta OTP (Resend) + fr/de/tr — üçü de mobilde birebir çalışmalı |
| Ekosistem sağlığı / bakım riski | orta | Tek geliştiricili proje; terk edilen bağımlılık doğrudan bize fatura |
| Ekip/araç zinciri uyumu | orta | pnpm + turbo + Vitest + knip + TS disiplini; üç-şerit ajan düzeni |

## 2. Adaylar (Ağustos 2026 durumu)

| | React Native + Expo | Capacitor | Flutter |
| --- | --- | --- | --- |
| Güncel sürüm | Expo SDK 57 (30.06.2026) · RN 0.86 · React 19.2 | Capacitor 8 (12.2025; 8.4.x 06.2026) | Flutter 3.44 (05.2026) · Dart 3.12 |
| Model | Native UI, paylaşılan TS mantık | WebView kabuk, web kodu aynen | Native (Skia/Impeller), her şey Dart |
| Mimari notu | RN 0.85'te Bridge silindi → yalnız New Architecture; Expo kırılmasız ara-sürüm temposu deniyor | OutSystems Ionic'in **ticari** ürünlerini kapatıyor; Capacitor açık kaynak bakımı taahhütlü | Material/Cupertino çekirdekten ayrılıyor (geçiş dönemi) |

## 3. Test edilebilirlik karşılaştırması

| Katman | RN + Expo | Capacitor | Flutter |
| --- | --- | --- | --- |
| Birim (saf mantık) | ✅ mevcut Vitest paketleri AYNEN + app içi Jest — cihazsız, ms | ✅ mevcut 568 test sıfır değişiklikle | ✅ dart test cihazsız; ama dosya başına 3–7 sn derleme yükü, TS'teki anlık döngü yok |
| Komponent | ✅ RNTL v14 + jest-expo, cihazsız, deterministik (async API, React 19) | ✅ web komponent testi aynen | ✅✅ **en güçlü**: WidgetTester gerçek render ağacında, cihazsız, ms |
| E2E | ✅ Maestro (resmî Expo hattı, EAS CI); emülatör/simülatör şart | ⚠ Playwright tarayıcıda sürer ama GERÇEK WebView E2E'si Appium'a kalır (context-switch kırılgan) | ✅ integration_test + Patrol 4.8 (native yüzeyler dahil); cihaz şart, device-farm seçenekleri dar |
| Screenshot/görsel | ⚠ web kadar olgun değil (Maestro screenshot + ayrı motor) | ✅ Playwright emülasyonu vekil; gerçek cihaz görseli ayrı iş | ✅ golden test çekirdeğe gömülü (+Alchemist CI deseni) |
| Native entegrasyon (ödeme/push/deep link) | ⚠ E2E'de, dev build ister (Expo Go'da Apple/Google Pay yok) | ❌ en zayıf: köprü + WebView; push yarı-otomatik | ⚠ Patrol native automation; gerçek cihaz + device-minute maliyeti |
| Mevcut test varlığının geleceği | **korunur** (568 test + Zod sözleşmesi mobili de kapsar) | korunur (aynı kod) | **sıfırlanır** (tek test taşınmaz) |

E2E'de üç adayın ortak gerçeği: cihazsız koşan Playwright konforu mobilde yok; emülatör/simülatör
her durumda gerekir. Fark alt katmanlarda ve *mevcut* güvencenin akıbetinde.

## 4. Depo uyumu — ne taşınır?

Depo-uyum analizi ajan tarafından çıkarıldı, sayıları ve yapısal iddiaları elle doğrulandı (§8).

| Paket | RN/Expo | Capacitor | Flutter |
| --- | --- | --- | --- |
| `types` (46 dosya, 5.122 satır Zod) | **aynen** | aynen | ❌ elle Dart modeli ya da codegen hattı kurulur |
| `domain-core` (99 dosya, 10.967 satır, 47 test) | **aynen** | aynen | ❌ ~11k satır + testler Dart'a yeniden yazılır |
| `helper` (623 satır, sıfır bağımlılık) | **aynen** | aynen | ❌ gerekli kısmı elle port |
| `i18n` (133 satır; PATHNAMES deep-link kaynağı olur) | **aynen** | aynen | ❌ kopya (üçüncü kopya = sessiz eskime) |
| `brand` (33 satır) | **aynen** | aynen | ❌ kopya |
| `database` (14k satır, supabase-js) | sunucuda kalır (önerilen); istemcide ancak anon-key+RLS alt-kümesiyle | aynen (sunucuda) | ❌ |
| `observability`, `notify`, `email`, `storage` | sunucuda kalır; mobil istemci log/push ayrı iş | sunucuda kalır | sunucuda kalır |
| Müşteri UI (157 dosya, 15,7k satır + 65 komponent dosyası) | ❌ yeniden yazılır (hook/mantık katmanı kısmen taşınır) | ✅ aynen — ama §5a'daki dağıtım açmazıyla | ❌ |
| Sayfa metinleri (`messages.json`) | **aynen** — düz JSON + `messages[locale]`, next-intl'e bağlı değil (elle doğrulandı) | aynen | ❌ ARB'a dönüştürülür |

**Kritik boşluk (elle doğrulandı):** mobil için API yüzeyi bugün YOK. `apps/backend` (Hono) tek
HTTP rotası `/health`; web'de yalnız 2 route handler (Stripe webhook, auth callback); müşteri
akışları 10 kolokasyonlu server action dosyasında (tüm uygulamada 40) — native istemci bunları
çağıramaz. **RN de Flutter da ince bir `/api/v1` katmanı ister**; en ucuz yol mevcut Hono
backend'i (database servisleri + domain-core zaten bağımlılığında). Bu maliyet teknoloji seçimini
ayrıştırmaz — Capacitor dışında her yolda aynı.

## 5. Aday aday hüküm

### 5a. Capacitor — vaadi bizde çalışmıyor

Capacitor'ın değer önerisi "web kodunu aynen paketle"dir. **Bizim mimaride paketlenemiyor:**
Next.js static export, Server Actions / Cookies / Middleware-Proxy / rewrites'ı desteklemiyor
(resmî liste, elle doğrulandı §8.3) — apps/web ise 40 server action + `@supabase/ssr` çerez
oturumu + next-intl middleware üstüne kurulu. Kalan iki yol:

- **Uzak URL kabuğu** (WebView canlı siteye bakar): teknik olarak her şey çalışır ama Capacitor
  üretimde önermiyor; Apple 4.2 "paketlenmiş web sitesi" reddi gerçek risk (elle doğrulandı
  §8.7); offline sıfır; localStorage oturumu OS tarafından silinebilir (custom storage adapter
  şart). Uygulama mağazada "web'den farksız" durursa reddedilir — farklılaştırmak için native
  özellik eklemek de "ince kabuk" vaadini eritir.
- **Ayrı SPA**: müşteri yüzeyini API-first yeniden yazmak demek — o noktada RN ile aradaki fark
  kapanır, WebView'in test/UX vergisi (Appium context-switch, klavye/viewport pürüzleri) kalır.

02.08 etüdünün Capacitor'a biçtiği rol (personel tarafı için kaçış kapısı: arka plan GPS, garanti
push) geçerliliğini korur; **müşteri mağaza uygulaması** için birincil araç değildir.

### 5b. Flutter — en iyi test aracı, en pahalı sistem bedeli

Test tarafında somut üstünlük: widget testleri gerçek render ağacında cihazsız koşar, golden test
çekirdeğe gömülü, Patrol 4.8 native yüzeyleri (izin diyaloğu, push) Dart'tan sürer.
supabase_flutter birinci parti ve e-posta OTP akışımızı SDK seviyesinde destekler (elle
doğrulandı §8.5) — Resend gönderimi sunucu tarafında olduğundan istemciye şeffaftır.

Bedeli yapısal: **Zod→Dart köprüsü yok.** `types` + `domain-core` + `helper` + testleri —
hiçbiri taşınmaz; her şema değişikliği iki dilde iki kez yapılır ve CLAUDE.md'nin 1 numaralı
değişmezi ("şema tek kaynak, hiçbir duplication yok") kalıcı olarak ihlal edilir. Codegen
köprüleri (zod→JSON Schema→quicktype) refine/transform/türetme zincirini taşımaz; zincirin kilit
paketi zod-to-json-schema'nın aktif bakımı Zod 4'e kaydı (biz Zod 3'teyiz). Ayrıca: tamamen ayrı
araç zinciri (pub/melos, turbo-knip-docs:check dışında), köprü paketlerin ikisi de birinci parti
değil (flutter_stripe, supadart), ve tek-uçuşlu test koşucusu/DDL kuyruğu disiplini (§4b) TS
script'lerine gömülü — Flutter tarafı bu kilidi görmez, paylaşılan yerel DB disiplini ikinci kez
inşa edilir. Yeni bir dil öğrenme maliyeti de cabası. **Elenmesinin nedeni test değil, sistem.**

### 5c. React Native + Expo — öneri, bedelleriyle

Kazançlar §0'da. Dürüst bedel listesi:

- **Müşteri UI yeniden yazılır** (15,7k satır web UI taşınmaz; hook/mantık/tip katmanı taşınır).
  Bu native görünümün kaçınılmaz bedeli — Flutter'da da aynı, üstüne çekirdek de yazılırdı.
- **Monorepo'da çift test koşucusu:** paketlerde Vitest kalır, RN uygulamasında Jest (Expo resmî
  hattı; Vitest'in RN desteği yok — köprü eklentileri bakımsız, elle doğrulandı §8.1). İki
  config, iki mock modeli. Karşılığı: paketlerin testleri Vitest'te *değişmeden* kalıyor.
- **`/api/v1` katmanı kurulacak** (§4) + müşteri okumaları için RLS politikaları gözden
  geçirilecek (bugün okumalar sunucuda service-role ile; `SUPABASE_SECRET_KEY` asla mobil
  bundle'a giremez).
- **Expo SDK temposu:** yılda ~3 SDK, her biri native kütüphane sürümlerini sabitler — düzenli
  upgrade maliyeti takvime girer. RNTL v14'ün Test Renderer'ı React minor'una birebir eşlenir;
  SDK yükseltmesinde eşzamanlı taşınmazsa komponent testleri topluca kırılır.
- **New Architecture eleme ölçütü:** RN 0.85+ interop'suz — New Arch desteği olmayan native
  kütüphane HİÇ çalışmaz; her bağımlılık seçiminde ilk kontrol bu.
- **E2E emülatör ister**; Maestro CLI kendi CI'ında ücretsiz, bulut cihazı (~$250/cihaz/ay)
  gereksiz — plan simülatör/emülatör üstüne kurulur. Detox'a yatırım yapılmaz (Expo desteği
  topluluk-güdümlü, belgeli uyumluluk RN 0.84'te kaldı).

## 6. RN seçilirse ilk kurulacaklar (kapsam işareti)

1. `apps/mobile` (Expo, pnpm workspace — SDK 52+ Metro'yu monorepo için otomatik yapılandırır)
2. `apps/backend`'e `/api/v1` uçları: Zod şemalı sözleşme (`types`'tan türetilir), `{data,error}`
   deseni; server action gövdelerindeki mantık zaten `lib/` katmanında ayrık
3. Auth: mevcut OTP akışının API karşılığı + oturum saklama (SecureStore)
4. Test hattı: jest-expo + RNTL v14 (baştan async API) + Maestro duman akışları; paylaşılan-DB
   disiplini (§4b) mobil entegrasyon testleri için de geçerli
5. Push: `packages/notify`e push driver + cihaz token tablosu (mimari buna hazır, sürücü eklemek
   yapıyı bozmaz — 02.08 etüdüyle uyumlu)
6. Görsel URL'leri API'de sunucuda çözülür (`publicImageUrl`) — istemciye storage portu gerekmez

## 7. Riskler ve karşı önlemler

| Risk | Önlem |
| --- | --- |
| New Arch uyumsuz kütüphane seçimi | Her native bağımlılıkta ilk eleme ölçütü; Expo SDK'nın sabitlediği sürümler dışına çıkma |
| SDK upgrade dalgası test katmanını kırar | React + Test Renderer + jest-expo tek PR'da birlikte taşınır; upgrade takvimi sezon dışına |
| supabase-js realtime'ın RN pürüzleri (ajan bulgusu, teyitsiz) | v1'de realtime kullanmıyoruz; kullanılacaksa sürüm sabitle + entegrasyon testi |
| Maestro yeşili yarış hatalarını maskeler | E2E yeşili tek kanıt sayılmaz; kritik akışlarda assert + birim/komponent katmanı esas |
| RLS açığı (istemci doğrudan DB okursa) | Önerilen mimari: istemci yalnız `/api/v1` konuşur, DB erişimi sunucuda kalır — RLS ikinci savunma hattı |

## 8. Doğrulama kaydı

Araştırma çok-ajanlı yapıldı; aşağıdaki yük taşıyan iddialar **birincil kaynaktan elle teyit
edildi** (06.08.2026). Ajan çürütme turunun RN/Capacitor ayağı ağ kesintilerinde düştü; yerine bu
elle tur geçti.

| # | İddia | Kaynak | Sonuç |
| --- | --- | --- | --- |
| 1 | Expo resmî birim test hattı Jest+jest-expo+RNTL; Vitest anılmıyor | docs.expo.dev/develop/unit-testing | ✓ |
| 2 | Expo resmî E2E rehberi Maestro (Detox yok) | docs.expo.dev/eas/workflows/examples/e2e-tests | ✓ |
| 3 | Static export: Server Actions/Cookies/Proxy/rewrites desteklenmez | nextjs.org/docs/app/guides/static-exports (v16.3.0) | ✓ |
| 4 | Maestro iOS gerçek cihaz: resmî destek simülatör; gerçek cihaz TestingBot/topluluk yoluyla (01.2026+) | testingbot.com, Maestro PR #2856 | ✓ (nüanslı) |
| 5 | supabase Dart SDK: verifyOtp e-posta tipleri destekli | supabase.com/docs/reference/dart/auth-verifyotp | ✓ |
| 6 | Apple 3.1.3(e): fiziksel malda IAP kullanılamaz, kart/Apple Pay şart | developer.apple.com App Review Guidelines | ✓ |
| 7 | Apple 4.2: paketlenmiş-web-sitesi uygulamaları reddedilir | aynı kaynak | ✓ |
| 8 | Expo SDK 57 = RN 0.86 + React 19.2 (30.06.2026) | expo.dev/changelog/sdk-57 | ✓ |
| 9 | RNTL v14: async API, React ≥19, Node ≥22.13, codemod'lu | github.com/callstack/react-native-testing-library/releases | ✓ |
| 10 | OutSystems Ionic ticari ürünlerini kapatıyor; Capacitor OSS bakımı taahhütlü | ionic.io blog duyurusu | ✓ |
| 11 | Google Play: fiziksel mal/yemek Play Billing'den muaf | support.google.com/googleplay/android-developer/answer/10281818 | ✓ |
| 12 | RN 0.85 Bridge'i kaldırdı; 0.85+ yalnız New Architecture | reactnative.dev 0.84 blog + çapraz kaynaklar | ✓ |
| 13 | Expo pnpm monorepo birinci sınıf (SDK 52+ Metro otomatik; yasak: çift React) | docs.expo.dev/guides/monorepos | ✓ |
| 14 | Depo iddiaları: `/health` tek rota; paket sayı/satır/bağımlılıkları; messages.json düz JSON | depoda `grep`/`wc` ile | ✓ (bir düzeltme: server action dosyası 9 değil, müşteri yüzeyinde 10 / toplam 40) |

Ajan kaynaklı olup elle teyit edilmeyen ikincil iddialar (Patrol 4.8 ayrıntıları, flutter_stripe
sürüm geçmişi, supabase-js realtime pürüzü, Maestro Cloud fiyatı) metinde "ajan bulgusu" olarak
işaretli ya da karara etkisiz.

## 9. Açık sorular (karar sonrası)

- `/api/v1` sözleşmesinin biçimi: REST + Zod parse mi, tRPC benzeri mi? (öneri: sade REST +
  `types`'tan türetilen şemalar — AI_ADMIN_ASSISTANT'ın MCP hedefiyle de uyumlu)
- Mobil istemci hata izleme (observability paketi sunucu-only): Sentry mi, kendi `error_log`
  API ucumuz mu?
- v1 ekran kapsamı: hangi müşteri akışları girer (katalog+sepet+ödeme+sipariş takibi çekirdek;
  keşif/geri bildirim sonraki sürüm?)

## 10. Ek etüt (06.08): Expo mu, çıplak RN mi?

**Hüküm: Expo — test merceğinden bakınca da net.** Birim/komponent katmanında fark küçük (iki
yol da Jest+RNTL'ye çıkar; jest-expo mock'ları ve platform varyantlarını kutudan verir, çıplak
RN'de expo-benzeri her native modül mock'u el işidir). Asıl ayrışma E2E build hattı ve bakımda:

- **CNG (prebuild):** native `ios/android` klasörleri üretilir, git'e girmez; upgrade "config
  plugin güncelle + yeniden üret" işlemine iner. Çıplak RN'de resmî yol Upgrade Helper diff'ini
  native dosyalara **elle** uygulamaktır ve RN yılda ~6 sürüm çıkarıyor.
- **Resmî konum:** reactnative.dev yeni uygulama için açıkça framework (fiilen Expo) öneriyor;
  çıplak kurulum "olağan dışı kısıtı olanlar" için (elle doğrulandı §10a). Bizde o kısıtlardan
  hiçbiri yok; Expo görsel kit de dayatmaz, tasarım disipliniyle çatışmaz.
- **EAS kilit değil:** resmî SSS "Expo projesi normal bir RN uygulamasıdır, EAS opsiyoneldir"
  diyor; prebuild + gradle/xcodebuild ile kendi CI'ında build her zaman açık kaçış yolu. Boyut
  etkisi ~1 MB (eski "Expo şişirir" bilgisi geçersiz). (elle doğrulandı §10a)

**Plana şimdiden yazılan uyarılar:**
1. **Expo Go test planına HİÇ girmez:** Android push (SDK 53+) ve Stripe Apple/Google Pay
   Expo Go'da çalışmaz — ilk sprintten itibaren development build (expo-dev-client). Aksi
   "Go'da yeşil, gerçek build'de kırık" sınıfı yalancı yeşil üretir.
2. EAS Workflows'un maestro job'ı hâlâ **alpha** etiketli ve ücretli plana bakar; ücretsiz kota
   düşük — E2E CI stratejisi: PR'da yalnız Jest paketi; Maestro nightly/merge-öncesi pencerede,
   önce EAS denenir, kota/fiyat uymazsa kendi runner'a taşınır (iOS için macOS runner ~10x
   Linux fiyatı, ajan bulgusu).
3. CNG bir disiplindir: native dosya ASLA elle düzenlenmez (SDK 57'de prebuild varsayılan
   temiz üretim — elle değişiklik sessizce silinir); her native ihtiyaç config plugin'le.
4. Takvime yıllık "SDK upgrade penceresi" yazılır (SDK ömrü ~1 yıl); React + Test Renderer +
   jest-expo tek PR'da birlikte taşınır (§5c ile aynı kural).

### 10a. Ek doğrulama kaydı (06.08, elle)

| # | İddia | Kaynak | Sonuç |
| --- | --- | --- | --- |
| 15 | reactnative.dev yeni uygulamada framework (Expo) önerir; çıplak yol "unusual constraints" içindir | reactnative.dev/docs/environment-setup | ✓ |
| 16 | EAS opsiyonel; kendi CI'ında build resmî destekli; boyut etkisi ~1 MB | docs.expo.dev/faq | ✓ |

## 11. Ek etüt (06.08): stil katmanı — komponent kütüphanesi YOK

**Hüküm: komponent kütüphanesi kullanılmaz** (kullanıcı tercihi + tasarım disiplini zaten bunu
söylüyor: görsel karar `.dc.html`'de verili ve birebir uygulanır — Material görünüşlü hazır kit
bununla çatışır). **Stil motoru: Unistyles 3** + kendi form kitimiz; form kitinin davranış/a11y
iskeleti için @rn-primitives'ten **kopyala-sahiplen** (shadcn modeli — kod repoya girer, bizim
olur; "kütüphane istemem" tercihiyle çelişmez, onu destekler).

**Neden Unistyles 3 (3.3.0):** (1) resmî Jest test hikâyesi — `react-native-unistyles/mocks` +
test ortamında kendini otomatik kapatan Babel plugin (elle doğrulandı §11a); (2) yalnız New
Architecture'a yazılmış çekirdek, RN 0.86 zeminiyle birebir; (3) tema düz TS nesnesi → token
tek-kaynağına doğal bağlanır.

**NativeWind tuzağı (webde Tailwind 4 kullanmamıza rağmen):** stabil sürüm 4.2.6 **Tailwind v3**
hedefler; Tailwind 4 uyumlu v5 "preview — not intended for production use"; Jest'te `toHaveStyle`
sorunu açık ve "post-5.0"a ertelenmiş (elle doğrulandı §11a). Test-birincil ölçütte bugün elenir.
İlke: **web'le sınıf adı değil TOKEN paylaşılır** — duplikasyon yasağını sağlayan token'dır.

**Token tek-kaynak deseni:** bugün 223 token `apps/web/app/globals.css`'te (158 `@theme` + 60
karanlık blok + 5 font istisnası; 21.3 parser'ı ile ölçüldü — ilk elle sayım 229 idi). Plan: `design-tokens` paketi (düz TS sabit modülü; 21.3'te kurulur) tek kaynak olur → web'de küçük bir
üretim adımı `@theme` CSS'ini bu modülden türetir, RN'de Unistyles teması modülü doğrudan import
eder. "Ham hex yasak" kuralı RN'de de aynen lint'lenir. Token seti büyürse Style Dictionary 5.x
(DTCG) hazır yükseltme yolu.

**Altyapı primitifleri** (kütüphane sayılmaz, fiilen platform parçası; tümü New Arch, sürümler
npm'den elle teyitli): reanimated 4.5.x + gesture-handler 3.1.x + safe-area-context + screens
(kaçınılmaz dörtlü), FlashList 2.3.x (katalog listeleri), react-native-keyboard-controller
1.22.x (form/checkout ekranları), @gorhom/bottom-sheet 5.2.x — **kendi sarmalayıcımızın
arkasında** (tek-maintainer + Reanimated 4/GH3 sürtünme raporları; motor değişirse tek dosya
değişsin).

**Kütüphanesiz gitmenin bedelleri (kullanıcının istediği uyarı listesi):**
1. **Erişilebilirlik en büyük gizli maliyet:** rol/state/label, focus yönetimi, 44pt dokunma
   hedefi her form kiti parçasına elle yazılır. A11y prop sözleşmesi form kitinin İLK sürümüne
   konur — sonradan eklemek her komponenti ikinci kez açmaktır. (@rn-primitives iskeleti bu yükü
   ciddi azaltır.)
2. **Jest'te stil assert edilemez varsayılır:** Unistyles mock'ları ekran/pixel-ratio vermez.
   Komponent testleri davranış + a11y (role/state/testID) üzerine yazılır; renk/piksel doğrulaması
   Maestro E2E'nin ve tasarım incelemesinin işidir.
3. **Font scaling kapatılmaz** (`allowFontScaling=false` yasağı, "ham hex yasak" ile aynı sınıf
   kural): `.dc.html`'deki sabit yükseklikli kutular 1.3–2x yazı ölçeğinde taşar — tasarım
   dosyalarına "büyük yazı" esneme kuralı eklenmeli.
4. **"Birebir `.dc.html`" mobilde piksel-birebir olamaz:** iOS gölge vs Android elevation, font
   metrikleri, ripple vs highlight — "birebir"in platform başına tanımı netleştirilmeli.
5. **Klavye davranışı** yerleşik `KeyboardAvoidingView` ile çözülmez; keyboard-controller baştan
   plana alınır (checkout/form).
6. **Select en tuzaklı form parçası:** iOS picker / Android dialog / özel bottom-sheet listesi —
   `.dc.html`'de select çizilirken platform davranışı da karara bağlanmalı.
7. Karar gözden geçirme eşiği: NativeWind v5 stable + test sorunları kapanırsa ya da Uniwind
   (Unistyles yazarının Tailwind-4 projesi; bugün genç, test dokümanı yok) 6 ay istikrar
   gösterirse sınıf-paritesi yeniden masaya gelir.

### 11a. Ek doğrulama kaydı (06.08, elle)

| # | İddia | Kaynak | Sonuç |
| --- | --- | --- | --- |
| 17 | NativeWind v5 pre-release, "not intended for production"; stabil 4.2.6 | nativewind.dev/v5 + npm | ✓ |
| 18 | NativeWind Jest `toHaveStyle` sorunu açık, "deferred (post-5.0)" etiketli | github nativewind#1398 | ✓ |
| 19 | Unistyles resmî Jest mock'ları + Babel plugin test ortamında otomatik kapalı; mock'lar ekran/pixel-ratio vermez | unistyl.es/v3/start/testing | ✓ |
| 20 | Unistyles 3.3.0 (10.07.2026) aktif; 2M+ indirme | unistyl.es + npm registry | ✓ |
| 21 | restyle 2.4.5 son yayın 19.03.2025 — ~17 ay sessiz | npm registry (`npm view`) | ✓ |
| 22 | @rn-primitives: headless, a11y gömülü, kopyala-ya-da-kur modeli; 1.5.2 (07.2026) | rnprimitives.com + npm | ✓ |
| 23 | Altyapı sürümleri: reanimated 4.5.3, gesture-handler 3.1.0, FlashList 2.3.2, keyboard-controller 1.22.3, bottom-sheet 5.2.14 | npm registry (`npm view`) | ✓ tümü |

**Cevaplar / itirazlar:**

**denetim (06.08):** Öneriye katılıyorum — belirleyici gerekçe evin 1 numaralı değişmezi:
"şema tek kaynak" yalnız RN yolunda korunuyor (17k satır çekirdek + 568 test aynen taşınır);
Flutter'ın elenme gerekçesi (test değil, sistem) ve Capacitor 5a hükmü depo-tarafı ölçümlerimle
tutarlı. **Kapsam güncellemesi (kullanıcı kararı 06.08, README):** uygulama artık yalnız müşteri
değil — *operasyon (birçok yönüyle) + müşteri*; yönetici tam kontrolü masaüstü web'de KALICI,
operasyonun web-mobil forku emekliye ayrılacak (parite sonrası), uygulama mevcut tasarımları
TAŞIMADAN yeniden kurgulanacak. Bu, §4'teki `/api/v1` kapsamını büyütür (operasyon eylemleri de
girer — `AI_ADMIN_ASSISTANT` MCP hedefiyle çift amaçlı yatırım) ve §9'a iki soru ekler:
*(1)* müşteri ile operasyon TEK uygulama mı iki ayrı paket mi (dağıtım kanalları farklı:
mağaza ↔ personel-içi); *(2)* tasarım sadakati disiplini (web'de yaşadığımız sapma sorunu)
uygulama tasarım hattına baştan nasıl gömülür (token'lar `brand`'dan türer + stil sözleşmesi).
Plan dokümanlarına şerit düzeni sorusu da girmeli: `apps/mobile`'ı kim yazar, `touches` sınırı ne.
