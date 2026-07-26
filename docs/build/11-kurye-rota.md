# 11 — Kurye ve Rota Teslimat

## Kapsam

Kuryenin sahadaki iki ekranı (gün listesi, teslimat) + gün kapanışı. Teslim onayı (imza/foto), tahsilat, ulaşılamadı/reddedildi ayrımı, teslimat özeti PDF. Rota bölgesi yönetimi ve kurye atama admin'de (09); burası kuryenin gördüğü yüzey. **İzin:** kurye yalnız kendi teslimatlarını, marj/maliyeti görmez.

## Okunacaklar

- `design/pages/kurye-gun.md`, `kurye-teslimat.md`, `kurye-kapanis.md` (içerik bağlayıcı)
- `DOMAIN.md §4` (teslim edilememe/rezervasyon çıpası), `§6` (teslim onayı/özet), `§7` (gün kapanışı/nakit uyarısı), `§8` (kısmi/kapıda)

## Bağımlılık

`07-siparis` (teslim/durum RPC'leri), `09-admin` (kurye atama + operasyon komponentleri), `14-bildirim` (teslimat özeti PDF + e-posta).

## Başlarken verilecek izah (örnek)

> "Kuryenin telefonunda kullanacağı ekranları kuruyoruz. Gün listesinde sadece kendi teslimatlarını rota sırasıyla görüyor. Teslimatta kalemleri işaretliyor, B2B müşteride imza/foto alıyor, parayı topluyor — nakit yasal sınırı aşarsa uyarı çıkıyor ama engellemiyor. Müşteri evde yoksa 'ulaşılamadı', kabul etmezse 'reddedildi' diyor; ikisinin stok sonucu farklı. Gün sonunda topladığı parayı kasayla karşılaştırıyoruz, fark aynı gün görünüyor."

## Görevler

- [ ] (11.1) **Gün listesi:** kuryenin o günkü teslimatları rota sırasıyla (adres, müşteri, ödeme beklentisi + tutar, içerik özeti); yalnız kendi teslimatları
  - *Bitti:* başka kuryenin teslimatı görünmüyor; ulaşılamayanlar listede kalıyor
- [ ] (11.2) **Teslimat ekranı — onay:** kalem listesi + eksik/reddedilen işaretleme (tutar kendiliğinden düşer); B2B'de imza/foto zorunlu (parametrik) → `Order.delivery_proof`
  - *Bitti:* B2B teslimatı imzasız kapanmıyor; eksik işareti tutarı düşürüyor
- [ ] (11.3) **Teslimat ekranı — tahsilat:** nakit/kart/çek + tutar; nakit yasal sınır aşımında uyarı (engel yok); kapıda tavan/`cod_allowed` zaten checkout'ta uygulandı
  - *Bitti:* nakit sınır uyarısı çıkıyor ama tahsilat tamamlanabiliyor
- [ ] (11.4) **Ulaşılamadı / reddedildi:** iki ayrı işaret; ulaşılamadı → `ready` (mal ayrılmış kalır), reddedildi → `returned` (depoya döner); `wa.me` "yoldayım" tek tık
  - *Bitti:* iki durumun stok sonucu 07/06 kurallarına uygun
- [ ] (11.5) **Teslimat özeti PDF:** teslimde e-postalı müşteriye otomatik (parametrik); kurye isterse çıktı ("resmî fatura değildir")
  - *Bitti:* teslimde PDF üretiliyor + gönderiliyor; çıktı alınabiliyor
- [ ] (11.6) **Gün kapanışı (RPC):** `CourierDayClose` — teslim edilenler, yöntem bazında toplam, iadeler; beklenen vs sayılan farkı aynı gün; kapanmış gün salt-okunur
  - *Bitti:* fark hesabı doğru; kapanan gün değiştirilemiyor

## Netleşecekler

- **İmza yakalama tekniği:** ekran imzası mı, foto mu, ikisi de mi — sahada (eldiven/soğuk) hangisi güvenilir; tasarım+pratik test sırasında kesinleşir.
- **Offline dayanıklılık:** sahada bağlantı kesilirse teslim işaretinin nasıl tutulup senkronlanacağı — kapsam kararı (basit tutulabilir).
