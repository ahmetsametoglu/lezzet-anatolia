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
