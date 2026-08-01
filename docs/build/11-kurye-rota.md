# 11 — Kurye ve Rota Teslimat

## Kapsam

Kuryenin sahadaki iki ekranı (gün listesi, teslimat) + gün kapanışı. Teslim onayı (imza/foto), tahsilat, ulaşılamadı/reddedildi ayrımı, teslimat özeti PDF. Rota bölgesi yönetimi ve kurye atama admin'de (09); burası kuryenin gördüğü yüzey. **İzin:** kurye yalnız kendi teslimatlarını, marj/maliyeti görmez.

## Okunacaklar

- `design/pages/kurye-gun.md`, `kurye-teslimat.md`, `kurye-kapanis.md` (içerik bağlayıcı)
- `DOMAIN.md §4` (teslim edilememe/rezervasyon çıpası), `§6` (teslim onayı/özet), `§7` (gün kapanışı/nakit uyarısı), `§8` (kısmi/kapıda)

## Bağımlılık

`07-siparis` (teslim/durum RPC'leri), `09-admin` (kurye atama + operasyon komponentleri), `14-bildirim` (teslimat özeti PDF + e-posta). **`19-coklu-depo` (01.08):** kurye depoya bağlı roldür (kapsam ataması 19.5; kapsamsız kurye hiçbir teslimatı görmez) — ekranlar 19.1–19.3'ten sonra yazılır; gün listesi/kapanış kurye-gün ekseninde kalır (`DOMAIN §17`).

## Başlarken verilecek izah (örnek)

> "Kuryenin telefonunda kullanacağı ekranları kuruyoruz. Gün listesinde sadece kendi teslimatlarını rota sırasıyla görüyor. Teslimatta kalemleri işaretliyor, B2B müşteride imza/foto alıyor, parayı topluyor — nakit yasal sınırı aşarsa uyarı çıkıyor ama engellemiyor. Müşteri evde yoksa 'ulaşılamadı', kabul etmezse 'reddedildi' diyor; ikisinin stok sonucu farklı. Gün sonunda topladığı parayı kasayla karşılaştırıyoruz, fark aynı gün görünüyor."

## Görevler

- [~] (11.1) **Gün listesi:** kuryenin o günkü teslimatları rota sırasıyla (adres, müşteri, ödeme beklentisi + tutar, içerik özeti); yalnız kendi teslimatları
  - *Bitti:* başka kuryenin teslimatı görünmüyor; ulaşılamayanlar listede kalıyor
  - **Durum (28.07) — ARKA UÇ HAZIR, ekran yok.** Kapı `apps/web/lib/courier/day.ts`: `listCourierDay` (adres anlık kopyadan, ödeme beklentisi, içerik özeti, "yoldayım" bağlantısı). Ekranı yüzey ajanı yazacak; bu kapı onun sözleşmesidir.
  - **"Yalnız kendi teslimatları" İMZADA durur:** `courierId` zorunlu parametredir, seçenek değil — çağıranın süzmeyi hatırlamasına bağlı bırakılmadı. `OrderService.listByCourier` de aynı imzayı taşır.
  - **Kurye tek bir para görür: tahsil edeceği tutar.** Maliyet, kâr, marj, alış fiyatı, vade/limit/borç dönen görünüm modelinde YOK (depo kuyruğuyla aynı yapısal sınır) — test serileştirilmiş çıktıda arıyor.
  - **"Ulaşılamadı" ile "henüz sıra gelmedi" TÜRETİLİR:** ikisi de `ready`'dir; ayrım `out_for_delivery → ready` geçiş sayısından çıkar, ayrı kolon açılmadı.
- [~] (11.2) **Teslimat ekranı — onay:** kalem listesi + eksik/reddedilen işaretleme (tutar kendiliğinden düşer); B2B'de imza/foto zorunlu (parametrik) → `Order.delivery_proof`
  - *Bitti:* B2B teslimatı imzasız kapanmıyor; eksik işareti tutarı düşürüyor
  - **Durum (28.07) — arka uç hazır.** Kapı `apps/web/lib/courier/delivery.ts` (`confirmDoorDelivery`).
  - **Sıra kuralın kendisidir:** kanıt kapısı (hiçbir yazım yapılmadan) → MAL → teslim → PARA. Kanıt sonda kalsaydı yarısı yazılmış teslimat üstüne "olmadı" denirdi; kalem düzeltmesi teslimden sonra yapılsaydı aynı mal iki kez oynatılırdı (0026'nın "tam bir kez say" kuralı); tahsilat teslimden önce yazılsaydı `stale` dönüşte karşılıksız para kalırdı.
  - **Kurye hesap yapmaz:** eksik işaretlendiğinde tutarı düşüren şey bir çarpma değil, ödeme durumu türetimidir (`domain-core/payment`) — tutar tek yerde hesaplanır.
  - **Ayar okunamazsa kanıt zorunlu SAYILMAZ:** eksik ayar yüzünden kuryenin kapıda kilitlenmesi, kanıtsız bir teslimattan pahalıdır.
- [~] (11.3) **Teslimat ekranı — tahsilat:** nakit/kart/çek + tutar; nakit yasal sınır aşımında uyarı (engel yok); kapıda tavan/`cod_allowed` zaten checkout'ta uygulandı
  - *Bitti:* nakit sınır uyarısı çıkıyor ama tahsilat tamamlanabiliyor
  - **Durum (28.07) — arka uç hazır.** Aynı kapıdan (`confirmDoorDelivery`) geçer; `cashLimitExceeded` dönen bir BİLGİDİR, akış durmaz (DOMAIN §7). Sınır ayardan (`cash_legal_limit_cents`), yalnız nakde ait — aynı tutar kartla alınırsa uyarı yok.
  - **Yöntem siparişe yazılır:** gün kapanışının yöntem bazlı beklenen toplamı bundan türer; ayrıca bir "kurye tahsil etti mi" bayrağı tutulmadı.
- [~] (11.4) **Ulaşılamadı / reddedildi:** iki ayrı işaret; ulaşılamadı → `ready` (mal ayrılmış kalır), reddedildi → `returned` (depoya döner); `wa.me` "yoldayım" tek tık
  - *Bitti:* iki durumun stok sonucu 07/06 kurallarına uygun
  - **Durum (28.07) — arka uç hazır.** `markUndelivered` (day.ts) + saf motor `domain-core/delivery/on-the-way.ts` (6 birim testi).
  - **"Yoldayım" mesajı MÜŞTERİNİN dilinde** kurulur, kuryenin değil: operasyon yüzeyi Türkçedir, ekranın diline uyulsaydı Fransız müşteriye Türkçe giderdi. Metin bu yüzden motorda; bir sayfa `messages.json`'una konsaydı operasyon sözlüğüne düşer, müşteri dilleri hiç doğmazdı.
  - **Numara biçimi normalize edilir:** `+33 6…`, `0033 6…` ve yerel `06…` aynı sonuca iner; ayırt edilemeyecek kadar kısa girdide bağlantı üretilmez (çalışmayan düğme gösterilmez).
- [ ] (11.5) **Teslimat özeti PDF:** teslimde e-postalı müşteriye otomatik (parametrik); kurye isterse çıktı ("resmî fatura değildir")
  - *Bitti:* teslimde PDF üretiliyor + gönderiliyor; çıktı alınabiliyor
  - **Not:** `14.6` ile AYNI iştir; tek yerde yapılır (PDF üretimi + `delivered` mailine ek). Yeni bir PDF bağımlılığı gerektirdiği için ayrı ele alınıyor.
- [x] (11.6) **Gün kapanışı (RPC):** `CourierDayClose` — teslim edilenler, yöntem bazında toplam, iadeler; beklenen vs sayılan farkı aynı gün; kapanmış gün salt-okunur
  - *Bitti:* fark hesabı doğru; kapanan gün değiştirilemiyor
  - **Durum (28.07) — TAMAM.** `0032_courier_day_close.sql` (görünüm + tablo + RPC), `CourierDayCloseService`, kapı `apps/web/lib/courier/day-close.ts`. 9 test. Ekran yüzey ajanının.
  - **Kapanış bir MUTABAKATTIR, para hareketi değil:** para kapıda tahsil edilirken yazıldı (11.3). Burada beklenen ile sayılan yan yana konur, fark aynı gün görünür.
  - **Beklenen toplam tek yerde toplanır:** `courier_day_collection` görünümü — hem kapanış öncesi ekran hem RPC oradan okur. Yalnız kapıda toplanan üç yöntem sayılır; online/havale kuryenin eline hiç girmez.
  - **`expected_*` saklanır ama `reconciled` SAKLANMAZ:** beklenen tutar kapanış anının fotoğrafıdır (sonradan bir hareket düzeltilse de o gün ne konuşulduğu değişmemeli — testli); "fark var/yok" ise iki kolondan generated kolonla türer, çelişme şemada kapalıdır.
  - **Sonuçlanmamış durak kapanışı engellemez** (tasarım §4): kurye depoya döndüyse günü kapatabilmeli; `pendingCount` uyarı içindir. Kapanmış gün salt-okunur — ikinci çağrı `already_closed` döner, kayıt ezilmez.

## Netleşecekler

- **İmza yakalama tekniği:** ekran imzası mı, foto mu, ikisi de mi — sahada (eldiven/soğuk) hangisi güvenilir; tasarım+pratik test sırasında kesinleşir.
- **Offline dayanıklılık:** sahada bağlantı kesilirse teslim işaretinin nasıl tutulup senkronlanacağı — kapsam kararı (basit tutulabilir).
