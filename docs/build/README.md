# Build Plan — İnşa Yol Haritası (Index)

Bu klasör, sistemi **hangi sırayla ve hangi parçalar halinde** kodlayacağımızı tanımlar. Kodlama ajanı (Claude Code) her modüle buradan girer.

> **Kural:** Buradaki dosyalar karar içermez — mimariden (`docs/architecture/`) türetilmiştir. Çelişki görünürse mimari kazanır; build dosyası güncellenir.

## Çalışma kuralları (kodlama ajanı için)

1. **Önce kısa izah:** Bir modüle/önemli işe başlamadan önce ajan kullanıcıya **kısa ve anlaşılır** bir izah verir: *ne yapacağız, nasıl yapacağız, neden bu şekilde* — 3-6 cümle, teknik terimler açıklanmış. Uzun anlatı yok; ama kullanıcı ne olacağını okumadan iş başlamaz.
2. **Netleşmemiş konu masaya gelir:** `STACK.md §13`'teki gibi "taslak" işaretli konulara gelindiğinde kod yazılmadan önce seçenekler artı/eksileriyle sunulur, net karar alınır, sonra kodlanır.
3. **Modül dosyasındaki sıraya uyulur;** görevler tek oturumluk boydadır; her görev bitti-kriterine ulaşınca işaretlenir (`[x]`).
4. **Doküman senkronu:** kod, dokümandan saparsa (haklı sebeple) ilgili mimari dosya aynı oturumda güncellenir.

## Modül dosyası şablonu

Her `NN-modul.md` dosyası şunları taşır: **Kapsam** (bu modül ne, ne değil) · **Okunacaklar** (mimari bölüm referansları) · **Bağımlılık** (önce ne bitmiş olmalı) · **Görevler** (işaretlenebilir, her biri bitti-kriteriyle) · **Netleşecekler** (varsa: kodlamadan önce konuşulacak maddeler).

## Sıra ve durum

| # | Dosya | Kapsam | Durum |
| --- | --- | --- | --- |
| 00 | `00-iskelet.md` | Monorepo iskeleti: pnpm + Turborepo, paket kabukları, tooling | bekliyor |
| 01 | `01-types.md` | `packages/types`: Zod şemaları, enum'lar, LocalizedText | bekliyor |
| 02 | `02-database.md` | `packages/database`: BaseDbService, migration altyapısı, ilk şema | bekliyor |
| 03 | `03-domain-core.md` | Durum makinesi, fiyat çözümü, rezervasyon, kanal/kaynak kuralları (saf fonksiyonlar + birim test) | bekliyor |
| 04 | `04-auth-kimlik.md` | Supabase Auth, guard'lar, müşteri bul-veya-oluştur, misafir hızlı doğrulama | bekliyor |
| 05 | `05-katalog.md` | Ürün/varyant/kategori/koleksiyon/paket + fiyat yönetimi (admin CRUD + vitrin okuma) | bekliyor |
| 06 | `06-stok.md` | Parti, rezervasyon (RPC), stok girişi, tedarik (tedarikçi kartı, kod eşlemesi, tedarik siparişi, eşik önerisi), imha/fire, sıcaklık | bekliyor |
| 07 | `07-siparis.md` | Checkout, sipariş yaşam döngüsü, Stripe, kısmi karşılama, iade | bekliyor |
| 08 | `08-musteri-app.md` | Vitrin sayfaları (komponentlerden inşa), sepet, hesap, çok dillilik | bekliyor |
| 09 | `09-admin.md` | Admin sayfaları (komponentlerden inşa), B2B onay, ayarlar | bekliyor |
| 10 | `10-depo.md` | Hazırlık ekranı (FEFO + parti kaydı), mal kabul | bekliyor |
| 11 | `11-kurye-rota.md` | Rota listesi, teslimat ekranı, teslim onayı, gün kapanışı | bekliyor |
| 12 | `12-para-muhasebe.md` | Hesaplar, para hareketleri, banka import, export, kârlılık | bekliyor |
| 13 | `13-analitik.md` | Olay toplama, raporlar, AI içgörü | bekliyor |
| 14 | `14-bildirim-email.md` | `packages/email` + `notify`, işlem bildirimleri, teslimat özeti PDF | bekliyor |
| 15 | `15-whatsapp.md` | Zemin (elle işleme) + canlı (webhook, AI ajanı, kartlar, payment link) | bekliyor |
| 16 | `16-talep-sikayet.md` | Ticket akışı + AI destekli işletme | bekliyor |
| 17 | `17-geri-bildirim-puan.md` | Swipe, yorum, puan/kupon, ürün skoru | bekliyor |
| 18 | `18-operasyon-guvenlik.md` | Deploy, yedekleme, log/alarm, CI/staging — **tamamı önce netleşecek** (STACK §13) | bekliyor |

Sıra katı değildir ama bağımlılıklar bağlayıcıdır (her dosyada yazılı). 08–09, tasarımdan gelen **komponent envanterinin kodlanmasıyla** başlar: önce komponentler, sonra sayfalar.
