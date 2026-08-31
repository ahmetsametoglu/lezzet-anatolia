# Dış Entegrasyonlar

> WhatsApp'ın satış kanalı olarak mimariye oturuşu (sipariş kaynağı, kimlik, inbound/outbound, ajan sınırı) `CHANNELS.md`'de; strateji kararları `ADR_WHATSAPP.md`'de. Bu dosya sağlayıcı-düzeyi entegrasyon notlarını tutar.

Genel ilke: her dış servis bir **agnostik arayüzün** arkasında yaşar. Sağlayıcı sonradan takılır/değişir, iş kodu değişmez. Bu, blueprint'in "bir bilgi tek yerde" ve "erken soyutlama kurma ama genişlemeyi engelleme" dengesine uyar — arayüz Faz 1'de tanımlanır, gerçek sağlayıcı ihtiyaç fazında bağlanır.

Webhook alan entegrasyonlar tercihen `apps/backend`'de yaşar (blueprint STACK §7): web uygulamasının yeniden dağıtımından bağımsız olurlar.

---

## Ödeme

- **Faz 1:** online kart ödemesi (sağlayıcı seçilecek — Stripe güçlü aday, FR/DE uyumlu) + kapıda ödeme (nakit/kart/çek, sistem içinde kaydedilir).
- Kapıda kart için basit bir cihaz (ör. SumUp) kullanılabilir; sistem yalnızca sonucu kaydeder.
- Ödeme sağlayıcı bir arayüz arkasında; kapıda ödeme zaten iç mantık.
- Webhook (ödeme onayı) `apps/backend`'de.

## Kargo

- **Faz 1.** Rota dışı teslimat için kargo şirketi: etiket üretimi, takip numarası, durum güncellemesi.
- Sağlayıcı FR/DE'de çalışan bir kargo olacak; agnostik arayüz.

## Adres ve coğrafi kodlama

- **Adres arama (FR): BAN / Géoplateforme** — `packages/address-fr`. Anahtarsız, ücretsiz, açık veri
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
- **Almanya için sağlayıcı YOK ve uydurulmuyor** (BAN yalnız Fransa'ya bakar). Port
  `unsupported_country` döner, nokta `null` kalır ve o satırlar tarama kuyruğunda sayaç TÜKETMEZ —
  ikinci bir kaynak takıldığı gün çözülsünler diye. Bugün DE adreslerinin noktası beslemede kod
  merkezi olarak duruyor ve kademesi dürüstçe `municipality` yazıyor: kapı değil, yerleşimin ortası.
- **Anahtarsızlık ADLI:** `geocoderConfigured(country)` — ekran "Almanya adresleri için konum çözümü
  kapalı" diyebilir; sessiz bir eksik olmaz.
- Port `packages/application/src/delivery/geocode-port.ts`, fabrika `geocode-provider.ts` (env'i
  yalnız orada okur). Hiçbir yol fırlatmaz; her başarısızlık adlandırılmış bir sonuçtur.

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
