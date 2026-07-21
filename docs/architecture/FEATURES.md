# Modüller ve Fonksiyonel Gereksinimler

Her modül: ne yapar + hangi role açık. Faz bilgisi için `SCOPE.md`. Detay iş kuralları için `DOMAIN.md`.

---

## Müşteri web uygulaması

**Kime:** müşteri (B2B ve B2C).
**Cihaz:** web + mobil "uygulama hissi". Çok dilli (TR/FR/DE), dil başına URL.

- Katalog: kategori, ürün, çok dilli içerik, görsel, fiyat (role/kanala göre)
- Arama ve filtreleme
- Sepet: fiyat sepete eklenince sabitlenir
- Sipariş oluşturma ve onay
- Ödeme: online (kart) veya kapıda (nakit/kart/çek)
- Teslimat seçimi: rota içi (bekle/ücretsiz/kapıda öde) veya kargo
- Sipariş geçmişi ve **tek tuşla tekrar sipariş** (özellikle B2B)
- Profil, adresler, tercih edilen dil
- Talep/şikâyet gönderimi (Faz 1 temel; AI destekli işletme Faz 2)

## Yönetim / admin

**Kime:** yönetici.
**Cihaz:** telefon öncelikli.

- Ürün ve kategori yönetimi (çok dilli giriş + AI çeviri önerisi)
- Fiyat yönetimi: B2B listesi, müşteriye özel fiyat, B2C
- Kullanıcı ve rol yönetimi
- İşletme ayarları (parametrik: minimum sepet, kargo eşiği, DLC uyarı eşiği)
- Tüm raporlara erişim

## Depo

**Kime:** depo sorumlusu (fiyat/kâr görmez).

- Ürün girişi, stok miktarı, konum
- DLC girişi ve FEFO'ya göre hazırlık sırası
- DLC yaklaşınca uyarı
- Sipariş hazırlama listesi, hazırlandı işaretleme

## Rota ve teslimat

**Kime:** yönetici + kurye.

- Dağıtım günü ve bölge tanımı (Faz 1 temel)
- O günün siparişlerinin rotaya dizilmesi (Faz 1: liste; optimizasyon yok)
- Kurye teslimat ekranı: kendi teslimatları
- Teslim/teslim edilemedi işaretleme
- `wa.me` deep-link ile "yola çıktık / X dk sonra oradayız" mesajı (kişisel hesaptan, tek tık)
- Kurye gün kapanışı ve kasa mutabakatı

## Kargo entegrasyonu

**Faz 2.** Rota dışı siparişler için etiket, takip numarası, müşteriye otomatik bilgi. Agnostik arayüz (bkz. `INTEGRATIONS.md`).

## Ön muhasebe

**Kime:** yönetici.

- Gelir/gider takibi (ön muhasebe seviyesi)
- Kanal ve ürün bazında kârlılık
- Muhasebe yazılımına export (hedef biçim Faz 2'de netleşir)
- Banka Excel import + eşleştirme (öneri + elle onay)
- reference_no ↔ invoice_no eşleştirme

## Analitik

**Kime:** yönetici.
**Kural:** cookie'siz, kişisel veri toplamadan (GDPR avantajı). Kendi sistemimiz, Google Analytics'e bağımlı değil.

- Ziyaretçi kaynağı, sayfa, dönüşüm (Faz 1 temel)
- Reklam getirisi ölçümü, UTM, kampanya (Faz 2)
- Akıllı bölge önerisi: rota + boş kapasite + sipariş yoğunluğu kesişimi (Faz 2)

## Bildirim

Soyut katman; sağlayıcı arkadan takılır (bkz. `INTEGRATIONS.md`).

- Faz 1: e-posta (işlem onayları) + `wa.me` deep-link (kurye/müşteri tetiklemeli)
- Faz 3: mobil push
- WhatsApp Business API yalnızca gerekirse, Faz 3, BSP üzerinden

## Müşteri talep/şikâyet

- Faz 1: temel gönderim ve takip
- Faz 2: AI destekli otomatik karşılama, sıradan soruların otomatik yanıtı, gerekince insana yönlendirme
