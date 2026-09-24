# Dış Entegrasyonlar

> WhatsApp'ın satış kanalı olarak mimariye oturuşu (sipariş kaynağı, kimlik, inbound/outbound, ajan sınırı) `CHANNELS.md`'de; strateji kararları `ADR_WHATSAPP.md`'de. Bu dosya sağlayıcı-düzeyi entegrasyon notlarını tutar.

Genel ilke: her dış servis bir **agnostik arayüzün** arkasında yaşar. Sağlayıcı sonradan takılır/değişir, iş kodu değişmez. Bu, blueprint'in "bir bilgi tek yerde" ve "erken soyutlama kurma ama genişlemeyi engelleme" dengesine uyar — arayüz Faz 1'de tanımlanır, gerçek sağlayıcı ihtiyaç fazında bağlanır.

Webhook alan entegrasyonlar tercihen `apps/backend`'de yaşar (blueprint STACK §7): web uygulamasının yeniden dağıtımından bağımsız olurlar.

---

## Ödeme

- **Faz 1:** online kart ödemesi — **Stripe, karar verildi ve üretimde** (`STACK` §Ödeme; "aday" ifadesi eskidir) + kapıda ödeme (nakit/kart, sistem içinde kaydedilir).
- Kapıda kart için basit bir cihaz (ör. SumUp) kullanılabilir; sistem yalnızca sonucu kaydeder.
- Ödeme sağlayıcı bir arayüz arkasında; kapıda ödeme zaten iç mantık.
- Webhook (ödeme onayı) `apps/web/app/api/webhooks/stripe` — `apps/backend` yerine, gerekçesi `lib/order/stripe-webhook.ts` künyesinde (uygulama kapıları orada). **Stripe panosunda dinlenecek olaylar:** `payment_intent.succeeded` · `payment_intent.canceled` · `charge.refunded` · `payout.paid` (12.14: havuz → banka transferi ve ücretler). Muhasebe modeli (brüt tahsilat · ödeme başına ücret · payout transferi) `data-model/para.md`'de.

## Kargo

- **Faz 1.** Rota dışı teslimat için kargo şirketi: etiket üretimi, takip numarası, durum güncellemesi.
- Sağlayıcı FR/DE'de çalışan bir kargo olacak; agnostik arayüz.
- **BEDAVA ama ATILAN bir adres sinyali var** (ölçüldü 02.09): `announce` cevabındaki `errors[]`
  alınıp düşürülüyor (`packages/sendcloud/src/client.ts` — yalnız istisna detayında görünüyor).
  Taşıyıcının adres hakkında söylediği tek şey o ve bize hiçbir şeye mal olmuyor. **Ama geç geliyor:**
  etiket basıldıktan SONRA, yani para harcanmışken — o yüzden checkout doğrulamasının yerine geçmez,
  yanına gelir. Kaydı: `docs/build/11-kurye-rota.md` › `(11.11)`.

## Adres ve coğrafi kodlama

- **Adres arama (FR): BAN / Géoplateforme** — `packages/address` (`fr/`). Anahtarsız, ücretsiz, açık veri
  (Etalab 2.0). İki kullanım: müşterinin adres önerisi kutusu (istemciden) ve **koordinat çözümü**
  (sunucudan, 11.9). İkincisi 31.08'de eklendi ve kapsamı genişletti — eskiden yalnız müşterinin
  yazdığı harfler giderdi, şimdi kaydedilen her adres bir kez soruluyor.
- **Giden veri yalnız ADRES METNİDİR:** kimlik yok, oturum yok, çerez yok. Müşteri adı/telefonu
  sorguya **eklenmez** ve bu bir kısıt — port `GeocodeQuery` olarak dört alan alır (`line1`,
  `postalCode`, `city`, `country`), fazlasını taşıyamaz.
- **Kota IP başına saniyeliktir** ve bu yüzden koordinat, adres kaydedilirken SENKRON çözülmez:
  kaydetme yoluna binen bir çağrı kotayı tüm müşterilere ortak yapardı ve akşam saatinde bir 429
  herkese birden çarpardı. Çözüm taramalı bir cron (`geocode_addresses`, on dakikada bir) + müşteri
  öneriyi seçtiğinde zaten cevapta gelen koordinatın taşınması.
- **Almanya → Google** (`packages/address`, `google/` girişi, bağlandı 13.09 — aşağıdaki bölüm). Anahtar
  yokken port `unsupported_country` döner, nokta `null` kalır ve o satırlar tarama kuyruğunda sayaç
  TÜKETMEZ. Anahtarsız DE adresinin noktası beslemede kod merkezi olarak duruyor ve kademesi
  dürüstçe `municipality` yazıyor: kapı değil, yerleşimin ortası.
- **Anahtarsızlık ADLI:** `geocoderConfigured(country)` — ekran "Almanya adresleri için konum çözümü
  kapalı" diyebilir; sessiz bir eksik olmaz. Env'i tek yer okur (`delivery/google-maps.ts`).
- Port `packages/application/src/delivery/geocode-port.ts`, fabrika `geocode-provider.ts`. Hiçbir
  yol fırlatmaz; her başarısızlık adlandırılmış bir sonuçtur.

### Kapının VARLIĞI ayrı bir sorudur — adres doğrulama (11.11)

Koordinat çözmek ile *"bu kapı gerçekten var mı"* diye sormak aynı iş değil. İkincisi
**sipariş anında** sorulur (kullanıcı kararı 02.09) — adres girişinde değil: müşteri defterine on
adres ekleyebilir, soru ancak malın gideceği kapı seçilince anlamlıdır.

**Yöntem BAN'a İKİ sorgudur ve ikinciliği şart:** birinci sorgu posta kodunu sert süzgeç olarak
verir, ikincisi vermez. Kodu sabitlemek "posta kodu yanlış" hâlini **yapısal olarak görünmez**
kılıyordu — ölçüldü (01.09): `192c Rue du Maréchal Foch` 67000 ile sorulduğunda Strasbourg'un aynı
adlı SOKAĞI dönüyor (0,717), kısıtsız sorulduğunda 67380 Lingolsheim'deki gerçek kapı (0,973).
Arada 7,2 km. Karar `@lezzet/address` `address-verdict`, kapı
`application/delivery/address-check`.

### Almanya: Google Maps Platform — BAĞLANDI (13.09; karar 02.09)

BAN yalnız Fransa'ya bakar. Almanya için iki kapı, tek anahtar (`GOOGLE_MAPS_API_KEY`, yalnız
`delivery/google-maps.ts` okur), paket **`@lezzet/address/google`** (kendi paketimiz, yalnız `zod`;
fırlatmaz, her başarısızlık adlı — BAN paketiyle aynı disiplin):

- **Adres önerisi — Places API (New)** `places:autocomplete` + `places/{id}` (alan maskesi
  `addressComponents,formattedAddress,location`, Essentials kademesi). **Sunucudan** çağrılır
  (`application/delivery/address-suggest.ts` → web eylemi): BAN'ın "tarayıcıdan, IP kotası" gerekçesi
  burada tersine döner — kota projeye bağlı, anahtar gizli. `includedRegionCodes: ['DE']` — "önce
  ülke" kararının servise yansıması; `sessionToken` istemcide üretilir (yazmaya başlarken bir UUID),
  seçimle biter: oturum olarak fiyatlanır (oturum kullanımı ücretsiz; tek tek istekler 10.000/ay
  sonrası ücretli — fiyat sayfası 10.09). FR önerisi buradan GEÇMEZ (`unsupported_country`).
- **Adres doğrulama — Address Validation** `v1:validateAddress`: tek çağrı geçerliliği
  (`addressComplete`), neyin düzeltildiğini (`replaced`), düzeltilmiş adresin kendisini VE
  `geocode.location`ı veriyor; `validationGranularity` bizim `precision`a çevrilir (`PREMISE`/
  `SUB_PREMISE` → `housenumber`, `ROUTE`/`BLOCK`/`PREMISE_PROXIMITY` → `street`). `geocoder()`
  ülkeyi SORGUDAN okur: FR → BAN, DE → Google. Aynı iki soru, TEK çağrı: gövde sokak satırı + kod +
  şehir taşır (dil alanı YOK — üst düzey `languageCode` isteği 400 ile düşürüyor, ölçüldü 13.09);
  Google kodu DEĞİŞTİRDİYSE kapı istenen kodda yoktur (`no_match`) ve `elsewhere` aynı cevabın
  düzeltilmiş adresini tek aday olarak taşır. BAN'daki "kısıtsız ikinci arama" Google'da
  KULLANILMAZ: bağlamsız soru rastgele kapı seçiyor (ölçüldü 13.09: yalnız "Hauptstraße 1" →
  84544 Aschau am Inn; müşteri 77694 Kehl'deydi). Skor servisin bayraklarından
  (kapı + tam → 0,95 · kapı + doğrulanmamış bileşen → 0,85 · sokak → 0,6), ki `addressVerdict`in
  0,8 eşiği iki kaynakta aynı anlama gelsin. 5.000/ay ücretsiz, sonra 17 $/1000.

**Üç kısıt ve karşılıkları:**

- **Koordinat en fazla 30 GÜN** (süresiz saklanabilen tek alan `placeId`). `geo_source = 'google'`
  satırları tarama işi her turda önce düşürür (`geocode-scan` → `expireGoogleGeo`, `listStaleGeo`);
  düşen satır **sipariş anında** yeniden çözülür (`checkAddress`), taramada DEĞİL:
  `geocoderScanAllowed('DE')` yanlış — ücretli ve 30 gün ömürlü bir kaynakla hiç sipariş vermeyecek
  adresleri ayda bir çözmek para yakmak olurdu. Koordinatın gerçek ömrü sipariş↔teslimat penceresi
  (kullanıcı düzeltmesi 02.09). BAN noktası süresiz (Licence Ouverte) — kaynak ayrımı `geo_source`ta.
- **Google Maps logosu** (harita yokken, 16–19 dp; dar yerde "Google Maps" metni) Places
  içeriğinin gösterildiği yerde: DE öneri listesi ve DE adresinin düzeltme teklifi. Resmî varlık
  Google'ın atıf paketinden (`apps/web/public/`); çizen yüzeyin işi.
- **FAIL-OPEN.** Doğrulama sipariş anında koştuğu için servisin düştüğü an checkout DURMAZ:
  `checkAddress` `unknown` döner ve susar. Geçici OLMAYAN iki arıza ayrı adla gelir — 401/403
  `denied` (anahtar/kısıt/fatura), öteki 4xx `rejected` (isteğimiz sözleşmeye uymuyor) — ve uygulama
  katmanı (`traceGoogleFailure`) `captureError` ile iz bırakır: kapı sessiz düşünce kimse fark
  etmez, log söyler. Ölçüldü 13.09: ikisi de (anahtar kısıtındaki 403 ve gövdedeki fazla alanın
  400'ü) önceki hâlde `unavailable`a karışıyor ve hiçbir yere yazılmıyordu.

**Fransa'da çoğu sipariş SIFIR maliyet** — BAN önerisinden kapı düzeyinde seçilmiş adres zaten
doğrulanmış ve koordinatı süresiz; Google yalnız DE adresleri için çağrılır (FR'de elle yazılmış
adres de BAN'a sorulur). **Kapsam yine FR+DE:** diğer AB ülkeleri `docs/GELECEK.md` 07.17.

### Kargo sağlayıcısı bu işi YAPAMAZ — ölçüldü, ve nedeni yapısal

Sendcloud'un `addresses/validate` ucu **var** (100+ ülke, düzeltilmiş adres döndürüyor) ama bizim
soruya cevap veremiyor:

- **Koordinat döndürmüyor** — rota sırası koordinatla hesaplanıyor, adres metniyle değil.
- **`carrier_code` ZORUNLU** — yapısı gereği bir KARGO doğrulaması. Kurye rotasında taşıyıcı yok;
  olmayan bir taşıyıcı adına doğrulama yapılamaz.

`here` yönteminin ücretsiz kademesi de bizim posta kodu kontrolümüzden fazlasını vermiyor.
Tam ölçüm ve karar zinciri: `docs/build/11-kurye-rota.md` › `(11.11)`.

## Muhasebe export

- Sistem ön muhasebe verisini dış muhasebe yazılımına **export** eder; resmî fatura orada kesilir.
- **Hedef yazılım muhasebeciyle netleşince biçimlenir** (iş bağımlılığı, faz değil) — muhasebecinin kullandığı programa göre (Pennylane, Sage, EBP, Tiime vb. Fransa'da yaygın). İlk sürümde tek hedef seçilir, adaptör deseniyle yazılır (başka hedef sonradan eklenebilir).
- e-fatura (2026 FR zorunluluğu) sistemin işi **değil** — dış yazılımda. Sistem sadece temiz veri üretir.

## Banka import

- Bankanın Excel/CSV dosyası içe alınır; hareketler sipariş/alımlarla eşleştirilir.
- Eşleştirme: **öneri + elle onay.** Tam otomatik değil (toplu ödeme, kısmi ödeme, iade eşleşmeyi bozar).

## Bildirim

Soyut bildirim katmanı; arkasına sürücü takılır.

| Faz | Sürücü | Maliyet | Not |
| --- | --- | --- | --- |
| Faz 1 | E-posta | Ücretsiz/çok ucuz | İşlem onayları, fiş |
| Faz 1 | `wa.me` deep-link | Ücretsiz | Kurye/müşteri tıklar, kişisel WhatsApp önceden yazılı mesajla açılır. API yok, Business hesabı gerekmez. |
| Faz 1 | WhatsApp Business API (360dialog) | Ücretli (FR/DE pahalı pazar) | Canlı satış kanalı + utility template |
| Faz 2 | Mobil push | Ücretsiz | Ayrı mobil uygulamayla |

**Auth mailleri de buradan:** Supabase Auth kimliği tutar ama doğrulama/OTP mailini **göndermez** — Auth "send email" hook'u `packages/email`'e devreder, default şablonla çıkar. Supabase'in yerleşik mail şablon/gönderim yapısı kullanılmaz (bkz. `DOMAIN.md §10`).

**WhatsApp API notu (ileride gerekirse):**
- BSP (aracı sağlayıcı) üzerinden kurulur; doğrudan Meta entegrasyonu ağır.
- 360dialog ilk aday: markup'suz, developer-first, kendi platformumuza uygun. Ama kurulumda güncel fiyat/plan ve kullanıcı şikâyetleri gözden geçirilmeli.
- Fiyat mantığı: müşteri sana yazınca açılan 24 saatlik pencerede mesajlar ücretsiz; sen başlatınca (template) ücretli. Strateji: rutin bildirim e-posta/push, WhatsApp yalnız kaçırılması pahalı anlar.
- **Karar:** bildirim tarafında `wa.me` deep-link ile başlanır; API canlı satış kanalıyla birlikte devreye girer (Faz 1, adım 2).

## AI (yapay zeka)

- **Çeviri:** girilen dili referans alıp diğer iki dili önerir (bkz. `SEO_I18N.md`). Admin onaylı.
- **Müşteri talep/şikâyet:** sıradan soruların otomatik yanıtı, gerekince insana yönlendirme.
- Sağlayıcı agnostik arayüz arkasında.
