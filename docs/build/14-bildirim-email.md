# 14 — Bildirim ve E-posta: `packages/email` + `packages/notify`

## Kapsam

Sistemin dışarıya konuşan sesi: `packages/email` (mail istemcisi + default şablonlar — **Supabase Auth mailleri dahil**, send-email hook üzerinden) ve `packages/notify` (soyut outbound bildirim katmanı; e-posta ve `wa.me` sürücüleri burada, WhatsApp API sürücüsü arayüze hazır bırakılır, `15-whatsapp` doldurur). İçerik: işlem bildirimleri temel seti, teslimat özeti PDF'i, talep cevap bildirimi, kampanya e-postası **elle** gönderim aracı ve bülten kayıt kutusu. **Kampanya otomasyonu yok** — o Faz 2; burada yalnız izinli liste birikir ve elle gönderilir.

## Okunacaklar

- `FEATURES.md` "Bildirim" (temel set + kanallar)
- `INTEGRATIONS.md` "Bildirim" (sürücü tablosu + Auth mailleri notu)
- `DOMAIN.md §6` (teslimat özeti PDF), `§10` (Auth send-email hook), `§11` (pazarlama izni — toplama gönderimden önce)
- `CHANNELS.md §4` (inbound ≠ outbound; notify'ın yeri)
- `STACK.md §3-4` (paket yerleşimi, bağımlılık yönü)

## Bağımlılık

`02-database` (Setting/Customer), `04-auth-kimlik` (hook'un bağlanacağı Auth kurulumu), `07-siparis` (bildirimleri tetikleyen durum geçişleri). Paket kabukları `00-iskelet`'te hazır.

## Başlarken verilecek izah (örnek)

> "Sistemin müşteriye e-posta gönderen katmanını kuruyoruz. İki parça var: mail'i fiilen gönderen ve şablonları tutan `email` paketi, ve 'müşteriye haber ver' diyen soyut `notify` katmanı — kod hep notify'a konuşur, arkada e-posta mı WhatsApp mı gideceğine sürücü karar verir. Böylece yarın WhatsApp API'si eklenince iş kodu değişmez. Kayıt/doğrulama mailleri dahil her mail bizim şablonlarımızdan, müşterinin dilinde çıkar. Bir de teslimatta otomatik giden özet PDF'i ve izinli listeye elle kampanya gönderme aracı var — otomatik kampanya yok, o sonraki faz."

## Görevler

- [ ] (14.1) **[Önce netleştir]** E-posta sağlayıcı seçimi (aşağıdaki "Netleşecekler") — istemci kodu bu karardan sonra
- [ ] (14.2) `packages/email`: sağlayıcı-agnostik gönderim arayüzü + seçilen sağlayıcı sürücüsü + default şablon altyapısı (çok dilli — müşterinin `preferred_language`'ı; marka sabitleri `packages/brand`'ten)
  - *Bitti:* test adresine örnek şablon üç dilde de doğru render edilip gönderiliyor
- [ ] (14.3) **Supabase Auth send-email hook:** doğrulama/OTP mailleri `packages/email` default şablonuyla çıkar; Supabase'in yerleşik mail yapısı devre dışı
  - *Bitti:* kayıt/OTP maili bizim şablonla geliyor; Supabase şablonundan giden sıfır mail
- [ ] (14.4) `packages/notify`: tek arayüz (olay + müşteri + veri) + sürücü kaydı — e-posta ve `wa.me` sürücüleri çalışır; WhatsApp API sürücüsü boş arayüzle hazır (15'te dolar)
  - *Bitti:* aynı olay çağrısı sürücüye göre e-posta gönderiyor / wa.me linki üretiyor (birim test)
- [ ] (14.5) **İşlem bildirimleri temel set** — sipariş durum geçişlerine bağlanır: onay (`→ confirmed`), yola çıktı (`→ out_for_delivery`), teslim + fiş (`→ delivered`), iptal/iade (`→ cancelled`/`→ returned`/para iadesi)
  - *Bitti:* her geçişte doğru şablon, müşteri dilinde; geçiş başına en fazla bir mail (tekrar tetikte no-op)
- [ ] (14.6) **Teslimat özeti PDF:** kalemler + karşılanan miktarlar + `reference_no` + "resmî fatura değildir" ibaresi; teslimde e-postası olan müşteriye **otomatik** gönderim (parametrik `Setting`, varsayılan açık); kurye için indirilebilir/yazdırılabilir hâli
  - *Bitti:* `delivered` geçişinde PDF ekli mail gidiyor; Setting kapalıyken gitmiyor; kısmi karşılamada miktarlar doğru
- [ ] (14.7) **Talep cevap bildirimi:** ticket olayları için notify olayı + şablon (admin cevabı / durum değişimi) — tetikleme `16-talep-sikayet`'te bağlanır
  - *Bitti:* örnek ticket cevabı şablondan müşteri dilinde çıkıyor
- [ ] (14.8) **Kampanya e-postası elle gönderim aracı (admin):** alıcı listesi yalnız `marketing_consent.email` izinlilerden; içerik elle hazırlanır, önizleme + gönder; otomasyon/zamanlama **yok**
  - *Bitti:* izinsiz müşteri listeye giremiyor; test gönderimi yalnız izinli kayıtlara ulaşıyor
- [ ] (14.9) **Bülten kayıt kutusu (site) + `marketing_consent` yazımı:** kutu baştan işaretsiz (AB açık eylem şartı); kayıtta `{granted, at, source}` yazılır — checkout/kayıt kutuları da aynı yazım fonksiyonunu kullanır
  - *Bitti:* kayıt sonrası consent jsonb'de zaman + kaynak dolu; aynı e-postayla ikinci kayıt idempotent

## Netleşecekler

- **E-posta sağlayıcı seçimi:** Resend / Amazon SES / benzeri — teslim edilebilirlik (deliverability), FR/DE veri konumu, fiyat, kurulum yükü ve şablon/attachment (PDF) desteği artı/eksileriyle masaya konur; karar sonra kodlanır. Arayüz agnostik olduğundan seçim sonradan değişebilir, ama domain/DNS kurulumu (SPF/DKIM) sağlayıcıya bağlı — baştan doğru seçmek kıymetli.
