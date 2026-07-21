# Dış Entegrasyonlar

Genel ilke: her dış servis bir **agnostik arayüzün** arkasında yaşar. Sağlayıcı sonradan takılır/değişir, iş kodu değişmez. Bu, blueprint'in "bir bilgi tek yerde" ve "erken soyutlama kurma ama genişlemeyi engelleme" dengesine uyar — arayüz Faz 1'de tanımlanır, gerçek sağlayıcı ihtiyaç fazında bağlanır.

Webhook alan entegrasyonlar tercihen `apps/backend`'de yaşar (blueprint STACK §7): web uygulamasının yeniden dağıtımından bağımsız olurlar.

---

## Ödeme

- **Faz 1:** online kart ödemesi (sağlayıcı seçilecek — Stripe güçlü aday, FR/DE uyumlu) + kapıda ödeme (nakit/kart/çek, sistem içinde kaydedilir).
- Kapıda kart için basit bir cihaz (ör. SumUp) kullanılabilir; sistem yalnızca sonucu kaydeder.
- Ödeme sağlayıcı bir arayüz arkasında; kapıda ödeme zaten iç mantık.
- Webhook (ödeme onayı) `apps/backend`'de.

## Kargo

- **Faz 2.** Rota dışı teslimat için kargo şirketi: etiket üretimi, takip numarası, durum güncellemesi.
- Sağlayıcı FR/DE'de çalışan bir kargo olacak; agnostik arayüz.

## Muhasebe export

- Sistem ön muhasebe verisini dış muhasebe yazılımına **export** eder; resmî fatura orada kesilir.
- **Hedef yazılım Faz 2'de netleşir** — muhasebecinin kullandığı programa göre (Pennylane, Sage, EBP, Tiime vb. Fransa'da yaygın). İlk sürümde tek hedef seçilir, adaptör deseniyle yazılır (başka hedef sonradan eklenebilir).
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
| Faz 3 | Mobil push | Ücretsiz | Ayrı mobil uygulamayla |
| Faz 3 | WhatsApp Business API | Ücretli (FR/DE pahalı pazar) | Yalnız gerekirse, BSP üzerinden |

**WhatsApp API notu (ileride gerekirse):**
- BSP (aracı sağlayıcı) üzerinden kurulur; doğrudan Meta entegrasyonu ağır.
- 360dialog ilk aday: markup'suz, developer-first, kendi platformumuza uygun. Ama kurulumda güncel fiyat/plan ve kullanıcı şikâyetleri gözden geçirilmeli.
- Fiyat mantığı: müşteri sana yazınca açılan 24 saatlik pencerede mesajlar ücretsiz; sen başlatınca (template) ücretli. Strateji: rutin bildirim e-posta/push, WhatsApp yalnız kaçırılması pahalı anlar.
- **Karar:** Faz 1–2'de API'ye girilmez. `wa.me` deep-link işi görür.

## AI (yapay zeka)

- **Çeviri:** girilen dili referans alıp diğer iki dili önerir (bkz. `SEO_I18N.md`). Admin onaylı.
- **Müşteri talep/şikâyet (Faz 2):** sıradan soruların otomatik yanıtı, gerekince insana yönlendirme.
- Sağlayıcı agnostik arayüz arkasında.
