# Build Plan — İnşa Yol Haritası (Index)

Bu klasör, sistemi **hangi sırayla ve hangi parçalar halinde** kodlayacağımızı tanımlar. Kodlama ajanı (Claude Code) her modüle buradan girer.

> **Kural:** Buradaki dosyalar karar içermez — mimariden (`docs/architecture/`) türetilmiştir. Çelişki görünürse mimari kazanır; build dosyası güncellenir.

## Çalışma kuralları (kodlama ajanı için)

1. **Önce kısa izah:** Bir modüle/önemli işe başlamadan önce ajan kullanıcıya **kısa ve anlaşılır** bir izah verir: *ne yapacağız, nasıl yapacağız, neden bu şekilde* — 3-6 cümle, teknik terimler açıklanmış. Uzun anlatı yok; ama kullanıcı ne olacağını okumadan iş başlamaz.
2. **Netleşmemiş konu masaya gelir:** `STACK.md §13`'teki gibi "taslak" işaretli konulara gelindiğinde kod yazılmadan önce seçenekler artı/eksileriyle sunulur, net karar alınır, sonra kodlanır.
3. **Modül dosyasındaki sıraya uyulur;** görevler tek oturumluk boydadır; her görev bitti-kriterine ulaşınca işaretlenir (`[x]`).
4. **Doküman senkronu:** kod, dokümandan saparsa (haklı sebeple) ilgili mimari dosya aynı oturumda güncellenir.
5. **Durumun tek sahibi bu klasördür.** Bir işin nerede olduğu YALNIZ modül dosyasındaki görev satırında yazar. `BACKLOG.md` ne yapılacağını (kapsam) tutar, ne kadar yapıldığını değil; aşağıdaki özet tablo da elle yazılmaz — `pnpm docs:sync` görev satırlarından üretir. Aynı gerçeği iki yere yazmak, ikisini de güvenilmez yapar.
6. **Görev işaretleri:** `[ ]` başlanmadı · `[~]` kısmen yapıldı (neyin eksik olduğu görev altındaki **Durum** notunda yazılı olmalı) · `[x]` bitti-kriteri karşılandı, kanıtı görüldü.
7. **Görev kimliği ve dokunma alanı:** her görev satırı `(NN.k)` kimliğiyle başlar — ajan bir işi bu kimlikle üstlenir. Birden çok ajan çalışıyorsa üstlenen ajan görev satırına `touches:` ile dokunacağı yolları yazar; `touches` kümesi kesişen iki görev aynı anda başlamaz (bkz. `WORKFLOW.md §7`).

## Modül dosyası şablonu

Her `NN-modul.md` dosyası şunları taşır: **Kapsam** (bu modül ne, ne değil) · **Okunacaklar** (mimari bölüm referansları) · **Bağımlılık** (önce ne bitmiş olmalı) · **Görevler** (işaretlenebilir, her biri bitti-kriteriyle) · **Netleşecekler** (varsa: kodlamadan önce konuşulacak maddeler).

## Yatay planlar

Bir modüle sığmayan, birden çok modülü aynı ölçütle kat eden planlar burada durur; ilerleme yine
modül dosyalarındaki görev satırlarında işaretlenir.

- [`test-dalgasi.md`](test-dalgasi.md) — testlerin toplu yazılma dalgası: sıra (yeniden eskiye),
  yöntem (birim/entegrasyon, kim koşar) ve sırası gelen dalganın envanteri.

## Sıra ve durum

Aşağıdaki tablo **türetilmiştir — elle düzenlenmez.** Kaynağı modül dosyalarındaki görev satırlarıdır; `pnpm docs:sync` yeniden üretir, `pnpm docs:check` bayatlamışsa uyarır.

<!-- durum:başlangıç -->
| # | Dosya | Kapsam | Durum | Görev |
| --- | --- | --- | --- | --- |
| 00 | `00-iskelet.md` | Monorepo İskeleti | sürüyor | 8/10 (+1 kısmi) |
| 01 | `01-types.md` | `packages/types`: Şemalar ve Enum'lar | sürüyor | 4/12 (+5 kısmi) |
| 02 | `02-database.md` | `packages/database`: Taban Servis ve İlk Şema | sürüyor | 14/16 (+1 kısmi) |
| 03 | `03-domain-core.md` | `packages/domain-core`: İş Kuralları Motoru | tamam | 11/11 |
| 04 | `04-auth-kimlik.md` | Kimlik ve Yetki: Supabase Auth, Guard'lar, Müşteri Bağlama | sürüyor | 11/13 |
| 05 | `05-katalog.md` | Katalog: Servisler ve Yönetim Zemini | sürüyor | 28/35 (+4 kısmi) |
| 06 | `06-stok.md` | Stok ve Tedarik: Parti, Rezervasyon, Satın Alma | tamam | 13/13 |
| 07 | `07-siparis.md` | Sipariş, Checkout ve Ödeme | sürüyor | 13/15 (+2 kısmi) |
| 08 | `08-musteri-app.md` | Müşteri Web Uygulaması (Vitrin) | sürüyor | 46/52 (+4 kısmi) |
| 09 | `09-admin.md` | Admin Yüzeyi: Komponentler ve Sayfalar | sürüyor | 13/28 (+14 kısmi) |
| 10 | `10-depo.md` | Depo Yüzeyi | sürüyor | 4/9 (+5 kısmi) |
| 11 | `11-kurye-rota.md` | Kurye ve Rota Teslimat | sürüyor | 5/7 (+1 kısmi) |
| 12 | `12-para-muhasebe.md` | Para, Ön Muhasebe ve Kârlılık | sürüyor | 7/11 (+2 kısmi) |
| 13 | `13-analitik.md` | Analitik | sürüyor | 6/8 (+2 kısmi) |
| 14 | `14-bildirim-email.md` | Bildirim ve E-posta: `packages/email` + `packages/notify` | sürüyor | 7/11 |
| 15 | `15-whatsapp.md` | WhatsApp: Zemin ve Canlı Kanal | sürüyor | 5/18 (+7 kısmi) |
| 16 | `16-talep-sikayet.md` | Talep / Şikâyet | sürüyor | 5/9 (+2 kısmi) |
| 17 | `17-geri-bildirim-puan.md` | Geri Bildirim, Yorum ve Puan | sürüyor | 8/11 (+1 kısmi) |
| 18 | `18-operasyon-guvenlik.md` | Operasyon ve Güvenlik | sürüyor | 1/13 (+2 kısmi) |
| 19 | `19-coklu-depo.md` | Çok Depo (Depo Ağı) | sürüyor | 27/31 (+4 kısmi) |
| 20 | `20-yapay-zeka.md` | Yapay Zekâ | sürüyor | 3/4 |
| 21 | `21-mobil-uygulama.md` | Mobil Uygulama | sürüyor | 82/98 (+12 kısmi) |
| 22 | `22-mcp-asistan.md` | MCP Yönetici Asistanı | sürüyor | 21/39 (+11 kısmi) |
| 23 | `23-barkod-kutu.md` | Barkod/QR ile Operasyon Takibi | sürüyor | 4/10 (+3 kısmi) |
<!-- durum:son -->

Sıra katı değildir ama bağımlılıklar bağlayıcıdır (her dosyada yazılı). 08–09, tasarımdan gelen **komponent envanterinin kodlanmasıyla** başlar: önce komponentler, sonra sayfalar.
