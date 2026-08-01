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

- [x] (14.1) **[Önce netleştir]** E-posta sağlayıcı seçimi (aşağıdaki "Netleşecekler") — istemci kodu bu karardan sonra
  - **Karar (28.07): Resend.** Seçim fiilen 04-auth'ta verilmişti (OTP maili oradan gidiyor) ve doğrulandı: React Email ile aynı ekosistem, şablon tarafında ek katman yok; SPF/DKIM kurulumu tek alan adı; ek maliyet düşük hacimde sıfıra yakın. **Arayüz agnostiktir** (`sendEmail`) — sağlayıcı değişirse `client.ts` değişir, şablonlar ve çağıranlar değişmez.
- [x] (14.2) `packages/email`: sağlayıcı-agnostik gönderim arayüzü + seçilen sağlayıcı sürücüsü + default şablon altyapısı (çok dilli — müşterinin `preferred_language`'ı; marka sabitleri `packages/brand`'ten)
  - *Bitti:* test adresine örnek şablon üç dilde de doğru render edilip gönderiliyor
  - **Durum (28.07):** `client.ts` (Resend, anahtar yoksa graceful atlar) + şablon altyapısı: ortak iskelet `components/order-email-layout.tsx`, metin sözlükleri `Record<PreferredLanguage, Copy>`. Marka adı ve adres dışarıdan verilir — şablonda sabit yok.
- [x] (14.3) **Supabase Auth send-email hook:** doğrulama/OTP mailleri `packages/email` default şablonuyla çıkar; Supabase'in yerleşik mail yapısı devre dışı
  - *Bitti:* kayıt/OTP maili bizim şablonla geliyor; Supabase şablonundan giden sıfır mail
  - **SAPMA — hook değil, Supabase mail akışının tamamen DIŞINDA kalmak** (04-auth'ta uygulandı). Görev satırı "send-email hook" diyor; biz OTP'yi kendi tablomuzda (`email_verifications`) üretip `packages/email` ile gönderiyoruz, oturumu mailsiz `generateLink` + `verifyOtp` ile mint ediyoruz. Sebep: hook, Supabase'in mail üretimini devralır ama TTL/deneme/rate-limit kurallarını yine Supabase'e bırakır; bizim akışta o kurallar atomik RPC'de ve testli. Sonuç görev satırının istediğiyle aynı: Supabase şablonundan giden sıfır mail (`config.toml`'dan magic_link şablonu kaldırıldı).
- [x] (14.4) `packages/notify`: tek arayüz (olay + müşteri + veri) + sürücü kaydı — e-posta ve `wa.me` sürücüleri çalışır; WhatsApp API sürücüsü boş arayüzle hazır (15'te dolar)
  - *Bitti:* aynı olay çağrısı sürücüye göre e-posta gönderiyor / wa.me linki üretiyor (birim test)
  - **Durum (28.07):** `types.ts` (olay→veri eşlemesi, sürücü arayüzü, üçlü sonuç) · `notifier.ts` (sürücü kaydı) · üç sürücü. 6 birim testi.
  - **Sürücü seçimi iş kuralı DEĞİL, yetenek bakmasıdır:** e-posta sürücüsü adresi olana, wa.me telefonu olana bakar. Eşik/izin hesaplayan mantık buraya girmez — bu maller işlemseldir, pazarlama iznine bağlı değildir (DOMAIN §11).
  - **Liste sırası tercih sırasıdır.** Ayrı bir kural tablosu yok: ilk destekleyen gönderir. `all` verilirse destekleyen her kanal gönderir; varsayılan tektir — aynı haberi iki kez almak gürültüdür.
  - **Üç sonuç ayrı:** `sent` gitti · `skipped` gönderilecek bir şey yoktu (adres yok, sağlayıcı anahtarı yok) · `error` gitmesi gerekiyordu gidemedi. Anahtarsız yerelde her mailin "başarılı" görünmesi bu ayrım olmadan kaçınılmazdı.
  - **`wa.me` bir ara çözüm değil, kanal:** bağlantı üretir, mesajı operatör yollar. WhatsApp API sürücüsü şimdilik hiçbir olayı üstlenmez (`supports → false`) — sessizce "gitti" demek en kötü yalan olurdu.
- [x] (14.5) **İşlem bildirimleri temel set** — sipariş durum geçişlerine bağlanır: onay (`→ confirmed`), yola çıktı (`→ out_for_delivery`), teslim + fiş (`→ delivered`), iptal/iade (`→ cancelled`/`→ returned`/para iadesi)
  - *Bitti:* her geçişte doğru şablon, müşteri dilinde; geçiş başına en fazla bir mail (tekrar tetikte no-op)
  - **Durum (28.07):** ALTI şablon tasarımdan birebir — akış (onay/yolda/teslim) + istisna (iptal/eksik karşılanma/iade). Kapı `apps/web/lib/order/{notify,notification-data}.ts`; akış bildirimleri `transition.ts` ve `deliverOrder`'a, istisna bildirimleri `refund.ts`'teki iptal ve kalem düzeltmesine bağlı. 10 entegrasyon + 6 birim testi.
  - **İstisna bildirimlerinde zaman çizgisi YOK** (tasarım kuralı): akış bildirimi yolculuğu gösterir, istisna bildirimi tek anı — çizgi yerine renkli durum bloğu (iptal kiremit, eksik amber). Para çözümü her zaman ilk karttadır: müşterinin ilk sorusu "param ne olacak".
  - **Hangi haberin gideceğini MALIN NEREDE OLDUĞU belirler.** Aynı kalem düzeltmesi, mal daha çıkmadıysa "eksik karşılanma" (müşteri kapıda sürprizle karşılaşmasın), çıktıysa "iade işlendi" (para geri döndü) doğurur. Ayrı iki çağrı değil, tek yol + duruma bakan tek satır.
  - **Onay maili her kalemi "iptal edildi" diye anlatıyordu (29.07 — AYRI bir hata):** `buildLines` `fulfilled_qty`'yi koşulsuz "gönderilen" sayıyordu. Yeni onaylanmış siparişte o sayı 0'dır; ama bu *"eksik gitti"* değil, *"daha hazırlanmadı"* demektir. Müşteri siparişini verir vermez şunu okuyordu: **"2 commandés, 0 expédiés — 20,00 € seront remboursés"**, ve satır tutarları 0,00 € görünüyordu (gerçek sipariş LA-26-99C7YN).
    - **Aynı maildeki indirim hatasıyla KARIŞTIRILMAMALI** (07.4 notu): o ödeme hapını bozuyordu, bu kalem listesini. İkisi ayrı kök, ayrı düzeltme — indirim düzeltmesi indikten sonra bu hata birebir tekrarlandı.
    - Çare, motorun zaten bildiği ayrım: `isFulfillmentSettled`. Kesinleşmişse karşılanan adet, kesinleşmemişse SİPARİŞ EDİLEN adet yazılır ve eksiklik notu ancak kesinleşmişse doğar. Aynı dosyadaki `grandTotal` bu tuzağı zaten biliyordu (yorumu da var), operasyon ekranı da kullanıyordu — yalnız kalem satırları kullanmıyordu. 3 regresyon testi (`notification-data.test.ts`).
  - **İade tutarı KAPIDAN gelir, türetimden değil.** Hareket yazıldıktan sonra "iade borcu" zaten sıfırdır; onu okusaydık mail "iade yok" derdi. Mail OLANI bildirir, kalanı değil. İstisnası eksik karşılanma: orada tutar gitmeyen malın değeridir — peşinse iade edilecek, kapıdaysa tahsilattan düşecek olan; tek sayı, iki durum, ödeme yöntemine bakan dal yok.
  - **Tahsilat yoksa iade kartı hiç çıkmaz:** "0,00 € iade edildi" diyen bir mail gürültüdür (testli).
  - **Tekrarı önleyen şey bayrak değil, durum kaydıdır.** Sipariş aynı duruma ikinci kez girerse (kapıdan dönüp yeniden yola çıkmak) haber tekrarlanmaz; ölçüt `order_status_log`'daki giriş sayısıdır. Ayrı "gönderildi" bayrağı tutsaydık iki kaynak olurdu ve biri kayardı.
  - **Veri şekli `packages/types`'ta** (`OrderNotification`): şablon, sürücü ve veriyi kuran kapı aynı şekli okur. Şablonun içine gömülseydi sürücü bilmezdi; kapıya konsaydı şablon uygulamaya bağlanırdı. Saklanmaz — gönderim anında kurulur.
  - **Onayda "genel toplam", sonrasında "güncel toplam".** İki ayrı soru, iki ayrı sayı: onayda mal henüz hazırlanmadığı için karşılanan tutar 0'dır (o yazılsaydı mailde "0,00 €" görünürdü) → sipariş tutarı yazılır. Sonraki maillerde karşılanan tutar yazılır, eksik çıkan kalem varsa toplam kendiliğinden iner. **Bu kusuru test yakaladı**, göz değil.
  - **Eksik karşılanmada sebep YAZILMAZ** (tasarım kuralı) — yalnız miktar + para çözümü: "5 sipariş edildi, 4 gönderildi — 5,90 € iade edilecek". Sebep müşterinin sorunu değil, sonuç onun sorunu.
  - **Zaman çizgisi durum LOGUNDAN türer** — siparişte "hazırlandı" damgası tutulmaz, geçiş kaydı zaten var (07.6).
  - **Mailin DİLİ artık siparişten okunuyor (29.07 — 04.9 + 05.13):** eskiden `customer.preferred_language`'dan geliyordu ve o kolonu **hiçbir akış yazmıyordu** — DB varsayılanı `'fr'`, dolayısıyla `/tr` ve `/de` yüzeylerinden sipariş veren müşteriler de Fransızca mail alıyordu. Şablonlar baştan beri üç dilliydi; eksik olan tek şey hangi dilin seçileceğini söyleyen veriydi. Sıra: `order.locale` → profil → `'fr'`. Sipariş dilini profilden okumamanın sebebi snapshot: profil sonradan değişebilir, gönderilmiş mailin dili değişmemeli.
  - **İndirim satırı artık kampanyanın adını söylüyor** (`order.discount_label`, 05.13): *"Remise — Offre de bienvenue"*. Ad sipariş anında KOPYALANIR; kampanya yeniden adlandırılsa da mailin yeniden basımı aynı şeyi der. Ad yoksa satır genel adında kalır — sepetteki tür açıklaması (*"kampanya %15"*) burada tekrarlanmaz, çünkü sipariş kaydında o türü söyleyecek bir bilgi yok ve uydurmak yerine susulur.
- [ ] (14.6) **Teslimat özeti PDF:** kalemler + karşılanan miktarlar + `reference_no` + "resmî fatura değildir" ibaresi; teslimde e-postası olan müşteriye **otomatik** gönderim (parametrik `Setting`, varsayılan açık); kurye için indirilebilir/yazdırılabilir hâli
  - *Bitti:* `delivered` geçişinde PDF ekli mail gidiyor; Setting kapalıyken gitmiyor; kısmi karşılamada miktarlar doğru
- [x] (14.7) **Talep cevap bildirimi:** ticket olayları için notify olayı + şablon (admin cevabı / durum değişimi) — tetikleme `16-talep-sikayet`'te bağlanır
  - *Bitti:* örnek ticket cevabı şablondan müşteri dilinde çıkıyor
  - **Durum (29.07):** iki olay (`ticket_replied` · `ticket_status_changed`), tek veri şekli `TicketNotification` (`types/notification.schema`), tek şablon dosyası `email/templates/ticket-notification.tsx` + üç dilli `ticket-copy.ts`. 12 test (10 şablon + 2 sürücü).
  - **Üçüncü olay + yazışma geçmişi (01.08):** `ticket_received` (teyit) eklendi ve mailler artık yazışmanın kendisini taşıyor. `replyBody`/`repliedAt` KALKTI, yerine `history: TicketHistoryEntry[]` — son mesajlar en yeniden eskiye; `history[0]` mailin konusu (tam kartta), kalanı alıntı (`QuoteCard`). Aynı mesajı iki alanda taşımak "hangisi güncel" sorusunu doğuran türden bir tekrardı.
    - **Sınır KAPIDA, şablonda değil:** bir talebin mesajları sınırsız büyür (`CLAUDE.md §1`) — `lib/ticket/notify.ts` son 4 mesajı alır, alıntıları 600 karakterde keser ve kestiğini `truncated` ile söyler. **İlk sıra asla kırpılmaz:** personelin cevabı müşteriye aynen görünmelidir (DOMAIN §15 — iç not yoktur).
    - **Durum maili yazışmayı GÖSTERMEZ** (`quoted={[]}`): konusu bir mesaj değil bir durum, neyin çözüldüğünü künye kartı zaten söylüyor. Cevabın metni başka bir olayın konusu ve o mail zaten gitti.
    - **`admin` ile `ai` müşteriye aynı görünür** ("Biz"): kimin yazdığı iç izlenebilirlik meselesi, müşterinin muhatabı marka.
    - **Enum ham geçer, etiket değil:** kapı `status`/`type` gönderir, "Çözüldü"/"Résolue" çevirisi şablonun yanındaki sözlükte. Kapı etiket üretseydi aynı sözlük iki yerde dururdu.
    - **Cevabın TAM metni maildedir** (DOMAIN §15 — iç not yoktur): kırpsaydık müşteri okumak için tıklamak zorunda kalırdı, oysa mail zaten cevabı taşımak için gidiyor. Satır sonları korunur.
    - **Çözülen talepte "yine yazabilirsin" daveti var:** kapanmış talebe yazılabildiği söylenmezse müşteri ikinci talep açar ve aynı konu iki yerde ilerler.
    - `in_progress` bildirim DOĞURMAZ — "incelemeye aldık" müşteriye bir şey söylemez (iade mailindeki aynı gerekçe).
    - **Ortak iskelet genelleşti:** `OrderEmailLayout` → `EmailLayout`, `OrderHeaderCard` → `HeaderCard` (`components/email-layout.tsx`). Talep maili marka iskeletini aynen kullanır — `design/project`'te `Email - Talep` çizimi yok, improvise edilmedi.
    - **Ek düzeltme:** `wa-link` sürücüsündeki altı sipariş mesajı Türkçe sabitti; müşteriye giden metin müşterinin dilinde olmalı (DOMAIN §10) → üç dile açıldı. Talep mesajları talebin KONUSUNU taşımaz: WhatsApp önizlemesi kilit ekranında görünür, şikâyet başlığı oraya düşmemeli.
    - Eksik: tetikleme (16.4 — cevap/durum kapılarına bağlanması).
- [ ] (14.8) **Kampanya e-postası elle gönderim aracı (admin):** alıcı listesi yalnız `marketing_consent.email` izinlilerden; içerik elle hazırlanır, önizleme + gönder; otomasyon/zamanlama **yok**
  - *Bitti:* izinsiz müşteri listeye giremiyor; test gönderimi yalnız izinli kayıtlara ulaşıyor
- [ ] (14.9) **Bülten kayıt kutusu (site) + `marketing_consent` yazımı:** kutu baştan işaretsiz (AB açık eylem şartı); kayıtta `{granted, at, source}` yazılır — checkout/kayıt kutuları da aynı yazım fonksiyonunu kullanır
  - *Bitti:* kayıt sonrası consent jsonb'de zaman + kaynak dolu; aynı e-postayla ikinci kayıt idempotent

## Netleşecekler

- **E-posta sağlayıcı seçimi:** Resend / Amazon SES / benzeri — teslim edilebilirlik (deliverability), FR/DE veri konumu, fiyat, kurulum yükü ve şablon/attachment (PDF) desteği artı/eksileriyle masaya konur; karar sonra kodlanır. Arayüz agnostik olduğundan seçim sonradan değişebilir, ama domain/DNS kurulumu (SPF/DKIM) sağlayıcıya bağlı — baştan doğru seçmek kıymetli.
